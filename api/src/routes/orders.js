import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { resolvePriceListId, priceSqlFragment } from '../lib/pricing.js';

const router = Router();
router.use(requireAuth);

// Transiciones de estado permitidas por rol
const VALID_TRANSITIONS = {
  admin: {
    'Pendiente por aprobar': ['Pendiente', 'Rechazado'],
    'Rechazado':             ['Pendiente'],
    'Pendiente':             ['Validar disponibilidad'],
    'Validar disponibilidad':['Alistamiento'],
    'Alistamiento':          ['En Ruta'],
    'En Ruta':               ['Entregado'],
    'Entregado':             [],
  },
  advisor: {
    'Pendiente':             ['Validar disponibilidad'],
    'Validar disponibilidad':['Alistamiento'],
    'Alistamiento':          ['En Ruta'],
    'En Ruta':               ['Entregado'],
  },
  supervisor: {
    'Pendiente por aprobar': ['Pendiente', 'Rechazado'],
  },
  // PHASE 5: rol delivery (couriers)
  delivery: {
    'Alistamiento': ['En Ruta'],
    'En Ruta':      ['Entregado'],
  },
};

// Estados visibles para delivery (operativo)
const DELIVERY_VISIBLE_STATUSES = ['Alistamiento', 'En Ruta', 'Entregado'];

// GET /orders
router.get('/', async (req, res) => {
  const { role, id: myId, companyId } = req.user;
  const clientRole = req.user.clientRole;
  const { status, clientId, advisorId, companyId: qCompanyId, dateFrom, dateTo, search, page = 1, limit = 20 } = req.query;

  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset   = (pageNum - 1) * limitNum;

  const params = [];
  const conditions = [];

  // Filtros automáticos por rol
  if (role === 'advisor') {
    conditions.push(`o.advisor_id = $${params.push(myId)}`);
    conditions.push(`o.status NOT IN ('Pendiente por aprobar', 'Rechazado')`);
  } else if (role === 'client' && clientRole === 'creador_pedidos') {
    conditions.push(`o.client_id = $${params.push(myId)}`);
  } else if (role === 'client' && clientRole === 'supervisor') {
    // Ve todos los pedidos de su empresa
    conditions.push(
      `o.client_id IN (SELECT id FROM users WHERE company_id = $${params.push(companyId)})`
    );
  } else if (role === 'delivery') {
    // PHASE 5: delivery solo ve pedidos en estados operativos
    conditions.push(
      `o.status = ANY($${params.push(DELIVERY_VISIBLE_STATUSES)}::varchar[])`
    );
  }

  // Filtros opcionales (solo admin puede aplicar todos)
  if (status)    conditions.push(`o.status = $${params.push(status)}`);
  if (clientId && role === 'admin')  conditions.push(`o.client_id  = $${params.push(parseInt(clientId))}`);
  if (advisorId && role === 'admin') conditions.push(`o.advisor_id = $${params.push(parseInt(advisorId))}`);
  if (qCompanyId && role === 'admin') {
    conditions.push(`o.client_id IN (SELECT id FROM users WHERE company_id = $${params.push(parseInt(qCompanyId))})`);
  }
  if (dateFrom) conditions.push(`o.created_at >= $${params.push(dateFrom)}`);
  if (dateTo)   conditions.push(`o.created_at <= $${params.push(dateTo + ' 23:59:59')}`);
  if (search)   conditions.push(`o.id ILIKE $${params.push('%' + search + '%')}`);

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const { rows } = await pool.query(
      `SELECT o.*,
         uc.name AS client_name,
         ua.name AS advisor_name,
         COUNT(DISTINCT oi.id)::int  AS item_count,
         COUNT(DISTINCT oc.id)::int  AS comment_count,
         COUNT(DISTINCT att.id)::int AS attachment_count
       FROM orders o
       JOIN users uc ON uc.id = o.client_id
       LEFT JOIN users ua ON ua.id = o.advisor_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN order_comments oc ON oc.order_id = o.id
       LEFT JOIN order_attachments att ON att.order_id = o.id
       ${where}
       GROUP BY o.id, uc.name, ua.name
       ORDER BY o.created_at DESC
       LIMIT $${params.push(limitNum)} OFFSET $${params.push(offset)}`,
      params
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(DISTINCT o.id) FROM orders o
       JOIN users uc ON uc.id = o.client_id
       LEFT JOIN users ua ON ua.id = o.advisor_id
       ${where}`,
      params.slice(0, params.length - 2)
    );

    return res.json({
      data:  rows,
      total: parseInt(countRows[0].count),
      page:  pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Helper: ACL compartida para GET /:id y GET /:id/timeline
async function canViewOrder(req, order) {
  const { role, id: myId, companyId } = req.user;
  if (role === 'admin') return true;
  if (role === 'advisor') return order.advisor_id === myId;
  if (role === 'delivery') return DELIVERY_VISIBLE_STATUSES.includes(order.status);
  if (role === 'client') {
    const { rows } = await pool.query(
      `SELECT company_id FROM users WHERE id = $1`, [order.client_id]
    );
    return rows[0]?.company_id === companyId;
  }
  return false;
}

// GET /orders/:id/timeline (PHASE 6)
// Feed cronologico unificado: status changes + comments + attachments
router.get('/:id/timeline', async (req, res) => {
  const orderId = req.params.id.toUpperCase();

  try {
    const { rows: orderRows } = await pool.query(
      `SELECT id, client_id, advisor_id, status FROM orders WHERE id = $1`,
      [orderId]
    );
    if (!orderRows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (!(await canViewOrder(req, orderRows[0]))) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { rows } = await pool.query(
      `
      SELECT * FROM (
        SELECT
          'status'::text       AS event_type,
          osl.created_at       AS occurred_at,
          osl.changed_by       AS actor_id,
          u.name               AS actor_name,
          u.role               AS actor_role,
          jsonb_build_object(
            'fromStatus', osl.from_status,
            'toStatus',   osl.to_status,
            'reason',     osl.reason
          ) AS payload
        FROM order_status_log osl
        LEFT JOIN users u ON u.id = osl.changed_by
        WHERE osl.order_id = $1

        UNION ALL

        SELECT
          'comment'::text      AS event_type,
          oc.created_at        AS occurred_at,
          oc.author_id         AS actor_id,
          u.name               AS actor_name,
          u.role               AS actor_role,
          jsonb_build_object(
            'commentId', oc.id,
            'text',      oc.text
          ) AS payload
        FROM order_comments oc
        JOIN users u ON u.id = oc.author_id
        WHERE oc.order_id = $1

        UNION ALL

        SELECT
          'attachment'::text   AS event_type,
          oa.uploaded_at       AS occurred_at,
          oa.uploaded_by       AS actor_id,
          u.name               AS actor_name,
          u.role               AS actor_role,
          jsonb_build_object(
            'attachmentId', oa.id,
            'fileName',     oa.file_name,
            'mimeType',     oa.mime_type,
            'fileSize',     oa.file_size,
            'fileUrl',      oa.file_url,
            'type',         oa.type
          ) AS payload
        FROM order_attachments oa
        JOIN users u ON u.id = oa.uploaded_by
        WHERE oa.order_id = $1
      ) t
      ORDER BY occurred_at ASC, event_type ASC
      `,
      [orderId]
    );

    return res.json({ orderId, events: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /orders/:id
router.get('/:id', async (req, res) => {
  const { role, id: myId, companyId } = req.user;
  const orderId = req.params.id.toUpperCase();

  try {
    const { rows } = await pool.query(
      `SELECT o.*,
         uc.name AS client_name,
         uc.company_id,
         ua.name AS advisor_name
       FROM orders o
       JOIN users uc ON uc.id = o.client_id
       LEFT JOIN users ua ON ua.id = o.advisor_id
       WHERE o.id = $1`,
      [orderId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    const order = rows[0];

    // Control de acceso
    if (role === 'advisor' && order.advisor_id !== myId) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (role === 'client') {
      const { rows: userRows } = await pool.query(
        `SELECT company_id FROM users WHERE id = $1`, [order.client_id]
      );
      if (userRows[0]?.company_id !== companyId) {
        return res.status(403).json({ error: 'No autorizado' });
      }
    }
    if (role === 'delivery' && !DELIVERY_VISIBLE_STATUSES.includes(order.status)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Items
    const { rows: items } = await pool.query(
      `SELECT * FROM order_items WHERE order_id = $1`, [orderId]
    );
    // Comentarios
    const { rows: comments } = await pool.query(
      `SELECT oc.*, u.name AS author_name, u.role AS author_role
       FROM order_comments oc
       JOIN users u ON u.id = oc.author_id
       WHERE oc.order_id = $1
       ORDER BY oc.created_at ASC`,
      [orderId]
    );
    // Adjuntos
    const { rows: attachments } = await pool.query(
      `SELECT att.*, u.name AS uploaded_by_name
       FROM order_attachments att
       JOIN users u ON u.id = att.uploaded_by
       WHERE att.order_id = $1
       ORDER BY att.uploaded_at DESC`,
      [orderId]
    );

    return res.json({ ...order, items, comments, attachments });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /orders
// PHASE 3:
//   - Valida estructura de items
//   - Resuelve precio BACKEND (lib pricing) y lo persiste como frozen en order_items.unit_price
//   - Si el cliente envia item.unitPrice, valida que coincida con el backend (anti-tamper / cache stale)
//   - Cliente NUNCA dicta el precio almacenado
router.post('/', requireRole('client'), async (req, res) => {
  const { id: clientId, clientRole, companyId } = req.user;
  const { items } = req.body;
  let { notes } = req.body;

  // ── Validacion de payload ────────────────────────────────
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(422).json({ error: 'El pedido debe tener al menos un producto' });
  }

  // PHASE 6: validar notes (max 1000 chars, trim, null si vacio)
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string') {
      return res.status(422).json({ error: 'notes debe ser texto' });
    }
    notes = notes.trim();
    if (notes.length > 1000) {
      return res.status(422).json({ error: 'notes no puede superar 1000 caracteres' });
    }
    if (notes.length === 0) notes = null;
  }

  for (const [idx, item] of items.entries()) {
    if (!Number.isInteger(item?.productId) || item.productId <= 0) {
      return res.status(422).json({ error: `items[${idx}].productId invalido` });
    }
    if (!Number.isInteger(item?.quantity) || item.quantity <= 0) {
      return res.status(422).json({ error: `items[${idx}].quantity debe ser entero positivo` });
    }
    if (item.unitPrice !== undefined &&
        (typeof item.unitPrice !== 'number' || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
      return res.status(422).json({ error: `items[${idx}].unitPrice invalido` });
    }
  }

  // Detectar productIds duplicados (el frontend deberia agruparlos)
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.productId)) {
      return res.status(422).json({ error: `productId duplicado: ${it.productId}` });
    }
    seen.add(it.productId);
  }

  // Status inicial segun clientRole
  const initialStatus = clientRole === 'supervisor' ? 'Pendiente' : 'Pendiente por aprobar';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Resolver lista aplicable al cliente (company > user)
    const orderPriceListId = await resolvePriceListId(
      { companyId, userId: clientId },
      client
    );

    const { select: priceSelect, join: priceJoin } = priceSqlFragment({
      alias: 'p',
      listIdParam: '$2',
    });

    // Calcular total y armar snapshot frozen con precio BACKEND
    let total = 0;
    const itemsToInsert = [];
    const priceMismatches = [];

    for (const [idx, item] of items.entries()) {
      const { rows: productRows } = await client.query(
        `SELECT p.id, p.name, p.sku, p.unit, p.active,
                ${priceSelect} AS backend_price
         FROM products p
         ${priceJoin}
         WHERE p.id = $1`,
        [item.productId, orderPriceListId]
      );
      const product = productRows[0];
      if (!product) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `items[${idx}]: producto no encontrado (id=${item.productId})` });
      }
      if (!product.active) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `items[${idx}]: producto inactivo (id=${item.productId})` });
      }

      const backendPrice = Number(product.backend_price);
      if (!Number.isFinite(backendPrice) || backendPrice <= 0) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: `items[${idx}]: precio backend no resoluble (producto ${item.productId})` });
      }

      // Validar precio del cliente vs backend (deteccion de cache stale o tampering)
      if (item.unitPrice !== undefined && Math.round(item.unitPrice) !== backendPrice) {
        priceMismatches.push({
          productId:    product.id,
          productName:  product.name,
          clientPrice:  Math.round(item.unitPrice),
          backendPrice,
        });
      }

      itemsToInsert.push({
        productId:   product.id,
        productName: product.name,
        sku:         product.sku,
        quantity:    item.quantity,
        unitPrice:   backendPrice,        // ← FROZEN: backend es la unica fuente de verdad
        unit:        product.unit,
      });
      total += backendPrice * item.quantity;
    }

    // Mismatch de precios: abortar y forzar reconfirmacion en cliente
    if (priceMismatches.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'El precio cambio. Recarga el catalogo y reconfirma el pedido.',
        mismatches: priceMismatches,
      });
    }

    // Generar ID despues de validar (no quemamos numeros si falla)
    const { rows: idRows } = await client.query(`SELECT fn_generate_order_id() AS id`);
    const newId = idRows[0].id;

    // Crear pedido
    await client.query(
      `INSERT INTO orders (id, client_id, status, notes, total)
       VALUES ($1, $2, $3, $4, $5)`,
      [newId, clientId, initialStatus, notes || null, total]
    );

    // Insertar items (snapshot frozen)
    for (const it of itemsToInsert) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, sku, quantity, unit_price, unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [newId, it.productId, it.productName, it.sku, it.quantity, it.unitPrice, it.unit]
      );
    }

    // PHASE 4: log de creacion (from_status NULL = evento de creacion)
    await client.query(
      `INSERT INTO order_status_log (order_id, from_status, to_status, changed_by)
       VALUES ($1, NULL, $2, $3)`,
      [newId, initialStatus, clientId]
    );

    await client.query('COMMIT');
    return res.status(201).json({
      id:          newId,
      status:      initialStatus,
      total,
      priceListId: orderPriceListId,
      createdAt:   new Date().toISOString(),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// PUT /orders/:id
// PHASE 4:
//   - Transaccion + SELECT FOR UPDATE para evitar race conditions en transiciones.
//   - Validacion estricta de transiciones (ya existente, ahora atomica con el UPDATE).
//   - Log de cambio de estado en order_status_log.
//   - 'Rechazado' requiere campo `reason`.
router.put('/:id', async (req, res) => {
  const { role, id: myId, companyId } = req.user;
  const clientRole = req.user.clientRole;
  const orderId = req.params.id.toUpperCase();
  const { status, carrier, advisorId, reason } = req.body;

  // Sanidad temprana antes de abrir transaccion
  if (status === 'Rechazado' && (!reason || !reason.trim())) {
    return res.status(422).json({ error: 'reason es obligatorio para rechazar un pedido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock de fila para serializar transiciones concurrentes
    const { rows } = await client.query(
      `SELECT o.*, uc.company_id AS client_company_id
       FROM orders o
       JOIN users uc ON uc.id = o.client_id
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [orderId]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    const order = rows[0];

    const statusChanges = status !== undefined && status !== order.status;

    // Validar transicion de estado
    if (statusChanges) {
      let allowedTransitions = [];
      if (role === 'admin') {
        allowedTransitions = VALID_TRANSITIONS.admin[order.status] || [];
      } else if (role === 'advisor') {
        // Advisor solo puede tocar pedidos asignados a el (o sin asignar -> se auto-asigna)
        if (order.advisor_id && order.advisor_id !== myId) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Pedido asignado a otro asesor' });
        }
        allowedTransitions = VALID_TRANSITIONS.advisor[order.status] || [];
      } else if (role === 'client' && clientRole === 'supervisor') {
        if (order.client_company_id !== companyId) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'No autorizado para aprobar pedidos de otra empresa' });
        }
        allowedTransitions = VALID_TRANSITIONS.supervisor[order.status] || [];
      } else if (role === 'delivery') {
        // PHASE 5: delivery solo opera transiciones de transporte
        allowedTransitions = VALID_TRANSITIONS.delivery[order.status] || [];
      } else {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No autorizado para cambiar este estado' });
      }

      if (!allowedTransitions.includes(status)) {
        await client.query('ROLLBACK');
        return res.status(422).json({
          error: `Transicion de estado invalida: ${order.status} -> ${status}`,
          allowed: allowedTransitions,
        });
      }
    }

    // Construir UPDATE dinamico
    const fields = [];
    const params = [];
    if (status   !== undefined) fields.push(`status    = $${params.push(status)}`);
    if (carrier  !== undefined) fields.push(`carrier   = $${params.push(carrier)}`);
    if (advisorId !== undefined && role === 'admin') fields.push(`advisor_id = $${params.push(advisorId)}`);

    // Auto-asignar advisor en su primer toque (solo si no estaba asignado)
    if (role === 'advisor' && !order.advisor_id) {
      fields.push(`advisor_id = $${params.push(myId)}`);
    }

    if (!fields.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'No hay campos para actualizar' });
    }

    params.push(orderId);
    const { rows: updated } = await client.query(
      `UPDATE orders SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    // Log del cambio de estado (solo si efectivamente cambio)
    if (statusChanges) {
      await client.query(
        `INSERT INTO order_status_log (order_id, from_status, to_status, changed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, order.status, status, myId, reason?.trim() || null]
      );
    }

    await client.query('COMMIT');
    return res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

export default router;
