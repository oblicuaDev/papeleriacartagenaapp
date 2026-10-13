import { Router } from 'express';
import multer from 'multer';
import sanitizeHtml from 'sanitize-html';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadBuffer, deleteObject } from '../lib/storage.js';
import { CLAIM_ATTACHMENT_TTL_DAYS } from '../lib/claimsPurge.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('admin', 'advisor', 'client'));

export const CLAIM_REASONS = {
  no_llego_producto:     'No me llegó producto',
  producto_averiado:     'Producto averiado',
  devolucion_producto:   'Devolución de producto',
  reclamo_servicio:      'Reclamo sobre el servicio prestado',
  felicitacion_servicio: 'Valoración o felicitación sobre el servicio prestado',
};
const PRAISE_REASON = 'felicitacion_servicio';
// Motivos sobre artículos: exigen indicar artículos y cantidades del pedido.
// Los motivos sobre el servicio no llevan artículos.
export const ITEM_REASONS = ['no_llego_producto', 'producto_averiado', 'devolucion_producto'];

// Pedidos sobre los que se puede reclamar: ya aprobados y no devueltos.
const NON_CLAIMABLE_STATUSES = ['Pendiente por aprobar', 'Rechazado', 'Devuelto'];

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
  },
});

// Ejecuta un middleware de multer y traduce sus errores a respuestas HTTP.
function runUpload(mw) {
  return (req, res, next) => mw(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Archivo demasiado grande. Máximo 10 MB' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(422).json({ error: `Máximo ${MAX_FILES} archivos` });
      return res.status(415).json({ error: 'Solo se permiten fotografías (JPG, PNG, WEBP) o archivos PDF' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error al subir el archivo' });
  });
}

// ── Sanitización del texto enriquecido ───────────────────────
const RICH_TEXT_OPTS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote'],
  allowedAttributes: {},
  transformTags: { div: 'p' },
};
const plainText = (html) =>
  sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, ' ').trim();

// ── Alcance por rol (misma visibilidad que los pedidos) ──────
// Alias esperados: o = orders, uc = users (dueño del pedido).
function scopeCondition(user, params) {
  const { role, id, companyId, clientRole, sucursalId } = user;
  if (role === 'admin') return 'TRUE';
  if (role === 'advisor') {
    return user.allOrdersAccess ? 'TRUE' : `o.advisor_id = $${params.push(id)}`;
  }
  if (role === 'client') {
    if (clientRole === 'creador_pedidos') return `o.client_id = $${params.push(id)}`;
    if (clientRole === 'supervisor') {
      return `(uc.company_id = $${params.push(companyId)} AND uc.sucursal_id = $${params.push(sucursalId ?? null)})`;
    }
    return `uc.company_id = $${params.push(companyId)}`; // admin_empresa / administrador_contrato
  }
  return 'FALSE';
}

const isInternal = (user) => user.role === 'admin' || user.role === 'advisor';

const CLAIM_SELECT = `
  SELECT c.*,
         o.status        AS order_status,
         o.advisor_id    AS order_advisor_id,
         cu.name         AS client_name,
         uc.name         AS order_client_name,
         cb.name         AS closed_by_name
    FROM claims c
    JOIN orders o  ON o.id  = c.order_id
    JOIN users  uc ON uc.id = o.client_id
    JOIN users  cu ON cu.id = c.client_id
    LEFT JOIN users cb ON cb.id = c.closed_by`;

async function findVisibleClaim(user, claimId, db = pool) {
  const params = [claimId];
  const scope = scopeCondition(user, params);
  const { rows } = await db.query(`${CLAIM_SELECT} WHERE c.id = $1 AND ${scope}`, params);
  return rows[0] || null;
}

// Traza en el pedido (aparece en su línea de tiempo como comentario del sistema).
async function traceOnOrder(db, orderId, userId, text) {
  await db.query(
    `INSERT INTO order_comments (order_id, author_id, text) VALUES ($1, $2, $3)`,
    [orderId, userId, text]
  );
}

async function setOrderStatus(db, order, newStatus, userId, reason) {
  if (order.status === newStatus) return;
  await db.query(`UPDATE orders SET status = $1 WHERE id = $2`, [newStatus, order.id]);
  await db.query(
    `INSERT INTO order_status_log (order_id, from_status, to_status, changed_by, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [order.id, order.status, newStatus, userId, reason]
  );
}

// Al cerrar el último reclamo abierto, el pedido vuelve al estado previo.
async function restoreOrderIfNoOpenClaims(db, claim, userId) {
  const { rows: open } = await db.query(
    `SELECT 1 FROM claims WHERE order_id = $1 AND status = 'Abierto' AND id <> $2 LIMIT 1`,
    [claim.order_id, claim.id]
  );
  if (open[0]) return;
  const { rows } = await db.query(`SELECT id, status FROM orders WHERE id = $1 FOR UPDATE`, [claim.order_id]);
  if (rows[0]?.status !== 'En reclamación') return; // p.ej. 'Devuelto': no se toca
  await setOrderStatus(db, rows[0], claim.prev_order_status || 'Entregado', userId,
    `Reclamo ${claim.id} cerrado`);
}

async function saveAttachments(db, claimId, files, userId, kind) {
  const saved = [];
  for (const f of files) {
    const { url, size } = await uploadBuffer({
      buffer: f.buffer, originalName: f.originalname, mimeType: f.mimetype,
      prefix: `claims/${claimId}`,
    });
    saved.push(url);
    await db.query(
      `INSERT INTO claim_attachments (claim_id, file_name, file_size, mime_type, file_url, kind, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [claimId, f.originalname, size, f.mimetype, url, kind, userId]
    );
  }
  return saved;
}

// Artículos del pedido con la cantidad aún reclamable: cantidad pedida menos
// lo ya reclamado en cualquier reclamo del pedido (abierto o cerrado).
async function claimableItems(db, orderId) {
  const { rows } = await db.query(
    `SELECT oi.id, oi.product_id, oi.product_name, oi.sku, oi.unit, oi.quantity,
            COALESCE(SUM(ci.quantity), 0)::int AS claimed_quantity
       FROM order_items oi
       LEFT JOIN claim_items ci ON ci.order_item_id = oi.id
      WHERE oi.order_id = $1
      GROUP BY oi.id
      ORDER BY oi.id`,
    [orderId]
  );
  return rows.map(r => ({ ...r, available_quantity: Math.max(0, r.quantity - r.claimed_quantity) }));
}

// Normaliza y valida los artículos enviados contra los reclamables del pedido.
// Devuelve { items } o { error }.
function validateClaimItems(raw, available) {
  let list = raw;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { return { error: 'Formato de artículos inválido' }; }
  }
  if (!Array.isArray(list) || list.length === 0) {
    return { error: 'Selecciona al menos un artículo y su cantidad' };
  }
  const byId = new Map(available.map(i => [i.id, i]));
  const seen = new Set();
  const items = [];
  for (const entry of list) {
    const orderItemId = Number(entry?.orderItemId);
    const qty = Number(entry?.quantity);
    const item = byId.get(orderItemId);
    if (!item) return { error: 'Uno de los artículos no pertenece al pedido' };
    if (seen.has(orderItemId)) return { error: `"${item.product_name}" está repetido` };
    seen.add(orderItemId);
    if (!Number.isInteger(qty) || qty <= 0) {
      return { error: `La cantidad de "${item.product_name}" debe ser un número entero mayor que cero` };
    }
    if (qty > item.available_quantity) {
      return {
        error: item.available_quantity === 0
          ? `"${item.product_name}" ya fue reclamado en su totalidad`
          : `La cantidad de "${item.product_name}" no puede superar ${item.available_quantity}`,
      };
    }
    items.push({ ...item, claim_quantity: qty });
  }
  return { items };
}

const itemsSummary = (items) => items.length
  ? ` Artículos: ${items.map(i => `${i.product_name} (${i.claim_quantity})`).join(', ')}.`
  : '';

const cleanupUploads = (urls) =>
  Promise.all(urls.map(u => deleteObject(u).catch(() => {})));

// ── GET /claims ──────────────────────────────────────────────
// ?status=Abierto|Cerrado  ?orderId=ORD-00001  ?search=texto
router.get('/', async (req, res) => {
  const { status, orderId, search } = req.query;
  const params = [];
  const conditions = [scopeCondition(req.user, params)];
  if (status === 'Abierto' || status === 'Cerrado') conditions.push(`c.status = $${params.push(status)}`);
  if (orderId) conditions.push(`c.order_id = $${params.push(String(orderId).toUpperCase())}`);
  if (search) {
    const p = params.push(`%${search}%`);
    conditions.push(`(c.id ILIKE $${p} OR c.order_id ILIKE $${p} OR cu.name ILIKE $${p})`);
  }
  try {
    const { rows } = await pool.query(
      `${CLAIM_SELECT} WHERE ${conditions.join(' AND ')}
       ORDER BY (c.status = 'Abierto') DESC, c.created_at DESC
       LIMIT 500`,
      params
    );
    return res.json({
      data: rows.map(({ description, ...r }) => ({ ...r, reason_label: CLAIM_REASONS[r.reason] })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── GET /claims/claimable-items?orderId=ORD-00001 ───────────
router.get('/claimable-items', async (req, res) => {
  const orderId = String(req.query.orderId || '').toUpperCase();
  if (!orderId) return res.status(422).json({ error: 'orderId es requerido' });
  try {
    const params = [orderId];
    const scope = scopeCondition(req.user, params);
    const { rows } = await pool.query(
      `SELECT o.id FROM orders o JOIN users uc ON uc.id = o.client_id WHERE o.id = $1 AND ${scope}`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    return res.json({ data: await claimableItems(pool, orderId) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── GET /claims/:id ──────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const claim = await findVisibleClaim(req.user, req.params.id.toUpperCase());
    if (!claim) return res.status(404).json({ error: 'Reclamo no encontrado' });

    const { rows: events } = await pool.query(
      `SELECT e.id, e.type, e.text, e.created_at, e.author_id,
              u.name AS author_name, u.role AS author_role
         FROM claim_events e
         LEFT JOIN users u ON u.id = e.author_id
        WHERE e.claim_id = $1
        ORDER BY e.created_at ASC, e.id ASC`,
      [claim.id]
    );
    const { rows: attachments } = await pool.query(
      `SELECT a.id, a.file_name, a.file_size, a.mime_type, a.kind, a.uploaded_at, a.deleted_at,
              CASE WHEN a.deleted_at IS NULL THEN a.file_url END AS file_url,
              u.name AS uploaded_by_name
         FROM claim_attachments a
         JOIN users u ON u.id = a.uploaded_by
        WHERE a.claim_id = $1
        ORDER BY a.uploaded_at ASC, a.id ASC`,
      [claim.id]
    );
    const { rows: items } = await pool.query(
      `SELECT id, order_item_id, product_id, product_name, sku, unit, quantity
         FROM claim_items WHERE claim_id = $1 ORDER BY id`,
      [claim.id]
    );

    const expiresAt = new Date(new Date(claim.created_at).getTime() + CLAIM_ATTACHMENT_TTL_DAYS * 86400000);
    const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));

    return res.json({
      ...claim,
      reason_label: CLAIM_REASONS[claim.reason],
      attachments_expire_at: expiresAt.toISOString(),
      attachments_days_left: daysLeft,
      events,
      attachments,
      items,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── POST /claims ─────────────────────────────────────────────
// multipart: orderId, reason, description (HTML), confirmDuplicate, files[],
//            items (JSON: [{ orderItemId, quantity }], obligatorio en ITEM_REASONS)
router.post('/', requireRole('client'), runUpload(upload.array('files', MAX_FILES)), async (req, res) => {
  const { id: userId, clientRole } = req.user;
  const files = req.files || [];

  if (clientRole === 'admin_empresa') {
    return res.status(403).json({ error: 'admin_empresa no puede crear reclamos' });
  }

  const orderId = String(req.body.orderId || '').toUpperCase();
  const reason = req.body.reason;
  const confirmDuplicate = req.body.confirmDuplicate === 'true' || req.body.confirmDuplicate === true;

  if (!orderId) return res.status(422).json({ error: 'orderId es requerido' });
  if (!CLAIM_REASONS[reason]) return res.status(422).json({ error: 'Selecciona un motivo válido' });

  const description = sanitizeHtml(String(req.body.description || ''), RICH_TEXT_OPTS).trim();
  const descLen = plainText(description).length;
  if (!descLen) return res.status(422).json({ error: 'Escribe la reclamación' });
  if (descLen > 5000) return res.status(422).json({ error: 'La reclamación no puede superar 5000 caracteres' });

  const db = await pool.connect();
  const uploaded = [];
  try {
    await db.query('BEGIN');

    // Pedido visible para este usuario
    const params = [orderId];
    const scope = scopeCondition(req.user, params);
    const { rows: orderRows } = await db.query(
      `SELECT o.* FROM orders o JOIN users uc ON uc.id = o.client_id
        WHERE o.id = $1 AND ${scope} FOR UPDATE OF o`,
      params
    );
    const order = orderRows[0];
    if (!order) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    if (NON_CLAIMABLE_STATUSES.includes(order.status)) {
      await db.query('ROLLBACK');
      return res.status(409).json({ error: `No se puede crear un reclamo sobre un pedido en estado "${order.status}"` });
    }

    // Reclamos abiertos del mismo pedido: exige confirmación explícita.
    const { rows: openClaims } = await db.query(
      `SELECT id, prev_order_status FROM claims
        WHERE order_id = $1 AND status = 'Abierto' ORDER BY created_at ASC`,
      [orderId]
    );
    if (openClaims.length && !confirmDuplicate) {
      await db.query('ROLLBACK');
      return res.status(409).json({
        error: `Este pedido ya tiene el Reclamo con ID ${openClaims[0].id}.`,
        code: 'OPEN_CLAIM_EXISTS',
        openClaimIds: openClaims.map(c => c.id),
      });
    }

    // Artículos reclamados: se validan con el pedido bloqueado para que dos
    // reclamos simultáneos no superen la cantidad disponible.
    let items = [];
    if (ITEM_REASONS.includes(reason)) {
      const result = validateClaimItems(req.body.items, await claimableItems(db, orderId));
      if (result.error) {
        await db.query('ROLLBACK');
        return res.status(422).json({ error: result.error });
      }
      items = result.items;
    }

    const { rows: idRows } = await db.query(`SELECT 'REC-' || LPAD(nextval('claims_seq')::text, 5, '0') AS id`);
    const claimId = idRows[0].id;
    const isPraise = reason === PRAISE_REASON;
    const prevStatus = order.status === 'En reclamación'
      ? (openClaims[0]?.prev_order_status || 'Entregado')
      : order.status;

    await db.query(
      `INSERT INTO claims (id, order_id, client_id, reason, description, status, prev_order_status, closed_at, closed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [claimId, orderId, userId, reason, description,
       isPraise ? 'Cerrado' : 'Abierto', prevStatus,
       isPraise ? new Date() : null, isPraise ? userId : null]
    );
    for (const it of items) {
      await db.query(
        `INSERT INTO claim_items (claim_id, order_item_id, product_id, product_name, sku, unit, quantity)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [claimId, it.id, it.product_id, it.product_name, it.sku, it.unit, it.claim_quantity]
      );
    }
    uploaded.push(...await saveAttachments(db, claimId, files, userId, 'initial'));

    await db.query(
      `INSERT INTO claim_events (claim_id, type, text, author_id) VALUES ($1,'created',$2,$3)`,
      [claimId, items.length ? `${CLAIM_REASONS[reason]}.${itemsSummary(items)}` : CLAIM_REASONS[reason], userId]
    );

    if (isPraise) {
      await db.query(
        `INSERT INTO claim_events (claim_id, type, text, author_id) VALUES ($1,'closed',$2,$3)`,
        [claimId, 'Cerrado automáticamente: valoración o felicitación.', userId]
      );
      await traceOnOrder(db, orderId, userId,
        `[Reclamo ${claimId}] Valoración o felicitación registrada (cerrada automáticamente).`);
    } else {
      await setOrderStatus(db, order, 'En reclamación', userId, `Reclamo ${claimId} creado: ${CLAIM_REASONS[reason]}`);
      await traceOnOrder(db, orderId, userId,
        `[Reclamo ${claimId}] Reclamo creado: ${CLAIM_REASONS[reason]}.${itemsSummary(items)}`);
    }

    await db.query('COMMIT');
    return res.status(201).json({
      id: claimId, orderId, reason, status: isPraise ? 'Cerrado' : 'Abierto',
      orderStatus: isPraise ? order.status : 'En reclamación',
    });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    await cleanupUploads(uploaded);
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    db.release();
  }
});

// ── Acciones de gestión (admin / asesor) ─────────────────────
async function loadManageableClaim(db, req, res) {
  const claim = await findVisibleClaim(req.user, req.params.id.toUpperCase(), db);
  if (!claim) { res.status(404).json({ error: 'Reclamo no encontrado' }); return null; }
  if (claim.status !== 'Abierto') { res.status(409).json({ error: 'El reclamo ya está cerrado' }); return null; }
  return claim;
}

// POST /claims/:id/notes — nota pública al cliente (no cierra el reclamo)
router.post('/:id/notes', requireRole('admin', 'advisor'), async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(422).json({ error: 'La nota es obligatoria' });
  if (text.length > 2000) return res.status(422).json({ error: 'La nota no puede superar 2000 caracteres' });

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const claim = await loadManageableClaim(db, req, res);
    if (!claim) { await db.query('ROLLBACK'); return; }

    await db.query(
      `INSERT INTO claim_events (claim_id, type, text, author_id) VALUES ($1,'note',$2,$3)`,
      [claim.id, text, req.user.id]
    );
    await traceOnOrder(db, claim.order_id, req.user.id, `[Reclamo ${claim.id}] Nota pública: ${text}`);
    await db.query('COMMIT');
    return res.status(201).json({ message: 'Nota registrada' });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    db.release();
  }
});

// POST /claims/:id/close — cierre con nota (obligatoria) y adjunto (opcional, permanente)
router.post('/:id/close', requireRole('admin', 'advisor'), runUpload(upload.single('file')), async (req, res) => {
  const note = String(req.body?.note || '').trim();
  if (!note) return res.status(422).json({ error: 'La nota de cierre es obligatoria' });
  if (note.length > 2000) return res.status(422).json({ error: 'La nota no puede superar 2000 caracteres' });

  const db = await pool.connect();
  const uploaded = [];
  try {
    await db.query('BEGIN');
    const claim = await loadManageableClaim(db, req, res);
    if (!claim) { await db.query('ROLLBACK'); return; }

    await db.query(
      `UPDATE claims SET status = 'Cerrado', closed_at = NOW(), closed_by = $1 WHERE id = $2`,
      [req.user.id, claim.id]
    );
    if (req.file) uploaded.push(...await saveAttachments(db, claim.id, [req.file], req.user.id, 'closure'));
    await db.query(
      `INSERT INTO claim_events (claim_id, type, text, author_id) VALUES ($1,'closed',$2,$3)`,
      [claim.id, note, req.user.id]
    );
    await traceOnOrder(db, claim.order_id, req.user.id,
      `[Reclamo ${claim.id}] Reclamo cerrado${req.file ? ' (con adjunto)' : ''}: ${note}`);
    await restoreOrderIfNoOpenClaims(db, claim, req.user.id);

    await db.query('COMMIT');
    return res.json({ message: 'Reclamo cerrado' });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    await cleanupUploads(uploaded);
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    db.release();
  }
});

// POST /claims/:id/return — devolución del pedido (estado 'Devuelto').
// No genera un pedido nuevo; 'Devuelto' queda fuera de consolidados y presupuesto.
router.post('/:id/return', requireRole('admin', 'advisor'), async (req, res) => {
  const note = String(req.body?.note || '').trim();
  if (req.body?.confirm !== true) {
    return res.status(422).json({ error: 'Debes confirmar la devolución del pedido' });
  }
  if (!note) return res.status(422).json({ error: 'Indica el motivo de la devolución' });
  if (note.length > 2000) return res.status(422).json({ error: 'La nota no puede superar 2000 caracteres' });

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const claim = await loadManageableClaim(db, req, res);
    if (!claim) { await db.query('ROLLBACK'); return; }

    const { rows } = await db.query(`SELECT id, status FROM orders WHERE id = $1 FOR UPDATE`, [claim.order_id]);
    const order = rows[0];
    if (order.status === 'Devuelto') {
      await db.query('ROLLBACK');
      return res.status(409).json({ error: 'El pedido ya fue devuelto' });
    }

    await setOrderStatus(db, order, 'Devuelto', req.user.id, `Devolución por reclamo ${claim.id}: ${note}`);
    await db.query(
      `INSERT INTO claim_events (claim_id, type, text, author_id) VALUES ($1,'return',$2,$3)`,
      [claim.id, note, req.user.id]
    );
    await traceOnOrder(db, claim.order_id, req.user.id,
      `[Reclamo ${claim.id}] Pedido devuelto: ${note}`);

    await db.query('COMMIT');
    return res.json({ message: 'Pedido devuelto', orderStatus: 'Devuelto' });
  } catch (err) {
    try { await db.query('ROLLBACK'); } catch {}
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    db.release();
  }
});

export default router;
