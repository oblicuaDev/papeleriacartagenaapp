import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { priceSqlFragmentChain, resolveOrderRouting } from '../lib/pricing.js';
import { ensurePurchaseOrderPdf, loadOrderContext, renderPdfBuffer } from '../lib/purchaseOrderPdf.js';
import { buildOrderDetailXlsx } from '../lib/orderExport.js';
import { splitIva } from '../lib/iva.js';
import { resolveActiveContractProductIds } from '../lib/contracts.js';

const router = Router();
router.use(requireAuth);

// Transiciones de estado permitidas por rol.
// FLUJO ACTUALIZADO: supervisor aprueba -> 'Validar disponibilidad';
// el asesor revisa items y avanza a 'Alistamiento'; el repartidor opera
// desde 'Alistamiento' en adelante.
const VALID_TRANSITIONS = {
  admin: {
    'Pendiente por aprobar': ['Validar disponibilidad', 'Rechazado'],
    'Rechazado':             ['Pendiente'],
    // 'Pendiente' es estado legacy: aprobaciones antiguas; el admin puede
    // empujarlo a 'Validar disponibilidad' para reentrar al flujo nuevo.
    'Pendiente':             ['Validar disponibilidad'],
    'Validar disponibilidad':['Alistamiento'],
    'Alistamiento':          ['En Ruta'],
    'En Ruta':               ['Entregado'],
    'Entregado':             [],
  },
  advisor: {
    'Pendiente':             ['Validar disponibilidad'],
    'Validar disponibilidad':['Alistamiento'],
  },
  supervisor: {
    'Pendiente por aprobar': ['Validar disponibilidad', 'Rechazado'],
  },
  // administrador_contrato: igual que supervisor, pero a nivel de toda la empresa.
  administrador_contrato: {
    'Pendiente por aprobar': ['Validar disponibilidad', 'Rechazado'],
  },
  // Rol delivery: solo opera desde Alistamiento en adelante.
  delivery: {
    'Alistamiento':           ['En Ruta'],
    'En Ruta':                ['Entregado'],
  },
};

// Estados visibles para delivery: ya no incluye 'Pendiente'/'Validar disponibilidad'
// porque esos pertenecen al flujo asesor.
const DELIVERY_VISIBLE_STATUSES = ['Alistamiento', 'En Ruta', 'Entregado'];

// GET /orders
router.get('/', async (req, res) => {
  const { role, id: myId, companyId } = req.user;
  const clientRole = req.user.clientRole;
  // "Direccion Comercial": asesor que ve/trabaja pedidos de cualquier vendedor.
  const allOrders = role === 'advisor' && req.user.allOrdersAccess;
  const { status, clientId, advisorId, companyId: qCompanyId, dateFrom, dateTo, search, page = 1, limit = 20 } = req.query;

  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset   = (pageNum - 1) * limitNum;

  const params = [];
  const conditions = [];

  // Filtros automáticos por rol
  if (role === 'advisor') {
    // Con cobertura total (Direccion Comercial) ve los pedidos de todos los
    // asesores; sin ella, solo los suyos.
    if (!allOrders) conditions.push(`o.advisor_id = $${params.push(myId)}`);
    conditions.push(`o.status NOT IN ('Pendiente por aprobar', 'Rechazado')`);
  } else if (role === 'client' && clientRole === 'creador_pedidos') {
    conditions.push(`o.client_id = $${params.push(myId)}`);
  } else if (role === 'client' && clientRole === 'supervisor') {
    // PHASE 3: supervisor solo ve pedidos de su sucursal
    conditions.push(
      `o.client_id IN (
         SELECT u.id FROM users u
         WHERE u.company_id = $${params.push(companyId)}
           AND u.sucursal_id = $${params.push(req.user.sucursalId ?? null)}
       )`
    );
  } else if (role === 'client' && (clientRole === 'admin_empresa' || clientRole === 'administrador_contrato')) {
    // PHASE 3: admin_empresa/administrador_contrato ven pedidos de TODAS las sucursales de su empresa
    conditions.push(
      `o.client_id IN (SELECT id FROM users WHERE company_id = $${params.push(companyId)})`
    );
  } else if (role === 'delivery') {
    // PHASE 5: delivery solo ve pedidos asignados a él en estados operativos
    conditions.push(`o.delivery_id = $${params.push(myId)}`);
    conditions.push(
      `o.status = ANY($${params.push(DELIVERY_VISIBLE_STATUSES)}::varchar[])`
    );
  }

  // Filtros opcionales (solo admin puede aplicar todos)
  if (status)    conditions.push(`o.status = $${params.push(status)}`);
  if (clientId && role === 'admin')  conditions.push(`o.client_id  = $${params.push(parseInt(clientId))}`);
  if (advisorId && (role === 'admin' || allOrders)) conditions.push(`o.advisor_id = $${params.push(parseInt(advisorId))}`);
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
  const { role, id: myId, companyId, clientRole, sucursalId } = req.user;
  if (role === 'admin') return true;
  if (role === 'advisor') return req.user.allOrdersAccess || order.advisor_id === myId;
  if (role === 'delivery') {
    return order.delivery_id === myId &&
           DELIVERY_VISIBLE_STATUSES.includes(order.status);
  }
  if (role === 'client') {
    const { rows } = await pool.query(
      `SELECT company_id, sucursal_id FROM users WHERE id = $1`, [order.client_id]
    );
    if (!rows[0] || rows[0].company_id !== companyId) return false;
    // PHASE 3: supervisor solo ve pedidos de su sucursal;
    // admin_empresa y creador_pedidos ven toda la empresa.
    if (clientRole === 'supervisor') {
      return rows[0].sucursal_id === sucursalId;
    }
    return true;
  }
  return false;
}

// Handler reutilizable: regenera el PDF al vuelo con el template actual.
// Montado en /orders/:id/purchase-order.pdf y en /purchase-orders/:id/pdf.
// NO lee el archivo guardado en storage: pedidos historicos reflejan
// automaticamente cualquier cambio de diseno.
export async function purchaseOrderPdfHandler(req, res) {
  const orderId = req.params.id.toUpperCase();
  try {
    const { rows: head } = await pool.query(
      `SELECT id, client_id, advisor_id, delivery_id, status FROM orders WHERE id = $1`,
      [orderId]
    );
    if (!head[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (!(await canViewOrder(req, head[0]))) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { order, items } = await loadOrderContext(orderId);
    const buf = await renderPdfBuffer({ order, items });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="orden_compra_${orderId}.pdf"`);
    return res.send(buf);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error generando el PDF de la orden de compra' });
  }
}

router.get('/:id/purchase-order.pdf', purchaseOrderPdfHandler);

// GET /orders/:id/export.xlsx — Excel detallado de un pedido
router.get('/:id/export.xlsx', async (req, res) => {
  const orderId = req.params.id.toUpperCase();
  try {
    const { rows: head } = await pool.query(
      `SELECT id, client_id, advisor_id, delivery_id, status FROM orders WHERE id = $1`,
      [orderId]
    );
    if (!head[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (!(await canViewOrder(req, head[0]))) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { order, items } = await loadOrderContext(orderId);
    const buf = await buildOrderDetailXlsx({ order, items });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${orderId}.xlsx"`);
    return res.send(buf);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error generando el Excel del pedido' });
  }
});

// GET /orders/:id/pedido.pdf — PDF del pedido SIN marca (descarga del cliente).
// A diferencia de purchase-order.pdf: sin logo/nombre de empresa y disponible
// en cualquier estado del pedido.
router.get('/:id/pedido.pdf', async (req, res) => {
  const orderId = req.params.id.toUpperCase();
  try {
    const { rows: head } = await pool.query(
      `SELECT id, client_id, advisor_id, delivery_id, status FROM orders WHERE id = $1`,
      [orderId]
    );
    if (!head[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (!(await canViewOrder(req, head[0]))) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { order, items } = await loadOrderContext(orderId);
    const buf = await renderPdfBuffer({ order, items, plain: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="pedido_${orderId}.pdf"`);
    return res.send(buf);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error generando el PDF del pedido' });
  }
});

// GET /orders/:id/pedido.xlsx — Excel del pedido SIN marca (descarga del cliente).
router.get('/:id/pedido.xlsx', async (req, res) => {
  const orderId = req.params.id.toUpperCase();
  try {
    const { rows: head } = await pool.query(
      `SELECT id, client_id, advisor_id, delivery_id, status FROM orders WHERE id = $1`,
      [orderId]
    );
    if (!head[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (!(await canViewOrder(req, head[0]))) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const { order, items } = await loadOrderContext(orderId);
    const buf = await buildOrderDetailXlsx({ order, items, plain: true });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="pedido_${orderId}.xlsx"`);
    return res.send(buf);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error generando el Excel del pedido' });
  }
});

// GET /orders/:id/timeline (PHASE 6)
// Feed cronologico unificado: status changes + comments + attachments
router.get('/:id/timeline', async (req, res) => {
  const orderId = req.params.id.toUpperCase();

  try {
    const { rows: orderRows } = await pool.query(
      `SELECT id, client_id, advisor_id, delivery_id, status FROM orders WHERE id = $1`,
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

        UNION ALL

        SELECT
          'item_change'::text  AS event_type,
          oic.created_at       AS occurred_at,
          oic.changed_by       AS actor_id,
          u.name               AS actor_name,
          u.role               AS actor_role,
          jsonb_build_object(
            'productId',     oic.product_id,
            'productName',   oic.product_name,
            'sku',           oic.sku,
            'action',        oic.action,
            'prevQuantity',  oic.prev_quantity,
            'newQuantity',   oic.new_quantity,
            'prevUnitPrice', oic.prev_unit_price,
            'newUnitPrice',  oic.new_unit_price,
            'reason',        oic.reason
          ) AS payload
        FROM order_item_changes oic
        LEFT JOIN users u ON u.id = oic.changed_by
        WHERE oic.order_id = $1
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
  const orderId = req.params.id.toUpperCase();

  try {
    const { rows } = await pool.query(
      `SELECT o.*,
         uc.name AS client_name,
         uc.company_id,
         uc.sucursal_id AS client_sucursal_id,
         ua.name AS advisor_name,
         ud.name AS delivery_name,
         udb.name AS delivered_by_name
       FROM orders o
       JOIN users uc ON uc.id = o.client_id
       LEFT JOIN users ua  ON ua.id  = o.advisor_id
       LEFT JOIN users ud  ON ud.id  = o.delivery_id
       LEFT JOIN users udb ON udb.id = o.delivered_by
       WHERE o.id = $1`,
      [orderId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    const order = rows[0];

    // Control de acceso unificado
    if (!(await canViewOrder(req, order))) {
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

  // PHASE 3: admin_empresa es READ-ONLY (no crea pedidos)
  if (clientRole === 'admin_empresa') {
    return res.status(403).json({ error: 'admin_empresa no puede crear pedidos' });
  }

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

  // Status inicial segun clientRole. El supervisor se autoaprueba al crear
  // (no necesita esperar a otro supervisor), pero igual entra al flujo de
  // "Validar disponibilidad" del asesor -- igual que cualquier otro pedido
  // aprobado. 'Pendiente' quedo reservado como estado legacy (ver
  // VALID_TRANSITIONS): usarlo aqui dejaba el pedido fuera del alcance del
  // asesor, que solo puede validar disponibilidad de pedidos en ese estado.
  const initialStatus = (clientRole === 'supervisor' || clientRole === 'administrador_contrato')
    ? 'Validar disponibilidad' : 'Pendiente por aprobar';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Routing del pedido + cadena de fallback de listas
    const { priceListId: orderPriceListId, priceListChain, advisorId: orderAdvisorId } =
      await resolveOrderRouting(clientId, client);

    // Params para la query de precios: $1 = productId, $2..$N = chain
    const listIdParams = priceListChain.map((_, i) => `$${i + 2}`);
    const { select: priceSelect, join: priceJoin } = priceSqlFragmentChain({
      alias: 'p',
      listIdParams,
    });

    // Contrato vigente de la empresa del cliente -> restringe que SKUs se pueden pedir
    const contractProductIds = await resolveActiveContractProductIds(companyId, client);

    // Calcular total y armar snapshot frozen con precio BACKEND (con fallback chain)
    let total = 0;
    const itemsToInsert = [];
    const priceMismatches = [];

    for (const [idx, item] of items.entries()) {
      if (contractProductIds && !contractProductIds.has(item.productId)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `items[${idx}]: producto fuera del catalogo del contrato vigente (id=${item.productId})`,
        });
      }
      const { rows: productRows } = await client.query(
        `SELECT p.id, p.name, p.sku, p.unit, p.active,
                ${priceSelect} AS backend_price
         FROM products p
         ${priceJoin}
         WHERE p.id = $1`,
        [item.productId, ...priceListChain]
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

    // Discriminacion de IVA (listas de precio se cargan con IVA incluido)
    const { subtotal, iva } = splitIva(total);

    // Crear pedido. Pre-asignamos asesor segun routing (sucursal > company).
    // TODO: pre-asignar repartidor automaticamente cuando se implementen
    // las reglas de asignacion (round-robin, branches.delivery_id, carga, etc).
    await client.query(
      `INSERT INTO orders (id, client_id, advisor_id, status, notes, total, subtotal, iva)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newId, clientId, orderAdvisorId, initialStatus, notes || null, total, subtotal, iva]
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

    // PHASE 7: si el pedido nace ya aprobado (supervisor se autoaprueba),
    // generar la orden de compra igual que en la aprobacion via PUT /:id.
    if (initialStatus === 'Validar disponibilidad') {
      try {
        await ensurePurchaseOrderPdf(newId, clientId);
      } catch (pdfErr) {
        console.error(`[orders] No se pudo generar PDF de ${newId}:`, pdfErr);
      }
    }

    return res.status(201).json({
      id:          newId,
      status:      initialStatus,
      total,
      subtotal,
      iva,
      priceListId: orderPriceListId,
      advisorId:   orderAdvisorId,
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
  const { role, id: myId, companyId, sucursalId } = req.user;
  const clientRole = req.user.clientRole;
  const allOrders = role === 'advisor' && req.user.allOrdersAccess;
  const orderId = req.params.id.toUpperCase();
  const { status, carrier, advisorId, deliveryId, reason } = req.body;

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
        // Advisor solo puede tocar pedidos asignados a el (o sin asignar -> se auto-asigna).
        // Con cobertura total (Direccion Comercial) puede trabajar cualquier pedido.
        if (order.advisor_id && order.advisor_id !== myId && !allOrders) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Pedido asignado a otro asesor' });
        }
        allowedTransitions = VALID_TRANSITIONS.advisor[order.status] || [];
      } else if (role === 'client' && clientRole === 'supervisor') {
        if (order.client_company_id !== companyId) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'No autorizado para aprobar pedidos de otra empresa' });
        }
        // PHASE 3: supervisor solo aprueba pedidos de su sucursal
        const { rows: clientUser } = await client.query(
          `SELECT sucursal_id FROM users WHERE id = $1`, [order.client_id]
        );
        if (clientUser[0]?.sucursal_id !== sucursalId) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Pedido pertenece a otra sucursal' });
        }
        allowedTransitions = VALID_TRANSITIONS.supervisor[order.status] || [];
      } else if (role === 'client' && clientRole === 'administrador_contrato') {
        // Igual que supervisor pero sin restriccion de sucursal: ve/aprueba
        // pedidos de toda la empresa.
        if (order.client_company_id !== companyId) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'No autorizado para aprobar pedidos de otra empresa' });
        }
        allowedTransitions = VALID_TRANSITIONS.administrador_contrato[order.status] || [];
      } else if (role === 'delivery') {
        // PHASE 5: delivery solo opera transiciones de transporte y solo en sus pedidos
        if (order.delivery_id !== myId) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Pedido no asignado a este repartidor' });
        }
        allowedTransitions = VALID_TRANSITIONS.delivery[order.status] || [];

        // PHASE 4: el repartidor no puede marcar Entregado sin subir al menos
        // una evidencia (foto, firma, documento). Bloqueo temprano para mensaje claro.
        if (status === 'Entregado') {
          const { rows: ev } = await client.query(
            `SELECT 1 FROM order_attachments
             WHERE order_id = $1 AND type = 'evidence' LIMIT 1`,
            [orderId]
          );
          if (!ev[0]) {
            await client.query('ROLLBACK');
            return res.status(422).json({
              error: 'Sube al menos una evidencia (foto, firma o documento) antes de marcar como entregado',
            });
          }
        }
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

    // Pedido Entregado: bloquear cualquier cambio operativo (carrier, advisorId).
    if (order.status === 'Entregado') {
      if (carrier !== undefined || advisorId !== undefined) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'No se pueden modificar datos logisticos de un pedido entregado',
        });
      }
    }

    // Construir UPDATE dinamico
    const fields = [];
    const params = [];
    if (status   !== undefined) fields.push(`status    = $${params.push(status)}`);
    if (carrier  !== undefined) fields.push(`carrier   = $${params.push(carrier)}`);
    if (advisorId !== undefined && role === 'admin') fields.push(`advisor_id = $${params.push(advisorId)}`);

    // PHASE 4: persistir quién entregó y cuándo en columnas dedicadas.
    if (statusChanges && status === 'Entregado') {
      fields.push(`delivered_by = $${params.push(myId)}`);
      fields.push(`delivered_at = NOW()`);
    }

    // admin/advisor pueden asignar repartidor.
    // El backend valida que sea un usuario active con role=delivery (o null para desasignar).
    let deliveryAssignmentLog = null; // { name } | { unassigned: true }
    if (deliveryId !== undefined && (role === 'admin' || role === 'advisor')) {
      // Pedido Entregado: no se puede asignar/reasignar repartidor.
      if (order.status === 'Entregado') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'No se puede modificar el repartidor de un pedido ya entregado',
        });
      }
      const previousDeliveryId = order.delivery_id;
      if (deliveryId === null) {
        fields.push(`delivery_id = NULL`);
        if (previousDeliveryId) deliveryAssignmentLog = { unassigned: true };
      } else {
        const { rows: dRows } = await client.query(
          `SELECT id, name FROM users WHERE id = $1 AND role = 'delivery' AND active = true`,
          [deliveryId]
        );
        if (!dRows[0]) {
          await client.query('ROLLBACK');
          return res.status(422).json({ error: 'deliveryId invalido' });
        }
        fields.push(`delivery_id = $${params.push(deliveryId)}`);
        if (previousDeliveryId !== deliveryId) {
          deliveryAssignmentLog = { name: dRows[0].name };
        }
      }
    }

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

    // Registrar asignacion/desasignacion de repartidor en historial (como comentario sistema)
    if (deliveryAssignmentLog) {
      const text = deliveryAssignmentLog.unassigned
        ? '🚚 Repartidor desasignado'
        : `🚚 Repartidor asignado: ${deliveryAssignmentLog.name}`;
      await client.query(
        `INSERT INTO order_comments (order_id, author_id, text) VALUES ($1, $2, $3)`,
        [orderId, myId, text]
      );
    }

    await client.query('COMMIT');

    // PHASE 7: generar orden de compra (PDF) cuando se aprueba el pedido.
    // Aprobacion = transicion desde 'Pendiente por aprobar' al estado de
    // entrada al flujo operativo ('Validar disponibilidad' en flujo nuevo,
    // 'Pendiente' en legacy). Se ejecuta DESPUES del commit para no bloquear
    // la transaccion ni perder el cambio de estado si la generacion falla.
    let warnings;
    const isApproval =
      statusChanges &&
      order.status === 'Pendiente por aprobar' &&
      (status === 'Validar disponibilidad' || status === 'Pendiente');
    if (isApproval) {
      try {
        await ensurePurchaseOrderPdf(orderId, myId);
      } catch (pdfErr) {
        console.error(`[orders] No se pudo generar PDF de ${orderId}:`, pdfErr);
        warnings = ['No se pudo generar el documento de orden de compra'];
      }
    }

    return res.json(warnings ? { ...updated[0], warnings } : updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// Estados en los que un pedido todavia se puede editar (antes de Alistamiento).
const ITEM_EDITABLE_STATUSES = ['Pendiente por aprobar', 'Pendiente', 'Validar disponibilidad'];

// PUT /orders/:id/items
// Modificacion de items mientras el pedido no ha entrado a Alistamiento.
// Permite cambiar cantidades o eliminar items (no agregar productos nuevos).
// Autorizado para: admin/asesor (sin restriccion de scope, ademas del check
// de asesor asignado mas abajo), el gestor del pedido (solo el suyo),
// supervisor (su sucursal) y administrador_contrato (toda su empresa).
// Cada modificacion exige un comentario y queda en order_item_changes +
// order_comments. Recalcula total y regenera el PDF de orden de compra.
router.put('/:id/items', async (req, res) => {
  const { role, id: myId, clientRole, companyId, sucursalId } = req.user;
  const allOrders = role === 'advisor' && req.user.allOrdersAccess;
  const orderId = req.params.id.toUpperCase();
  const { items, reason } = req.body;

  if (!Array.isArray(items)) {
    return res.status(422).json({ error: 'items debe ser un array' });
  }
  const cleanReason = (reason || '').trim();
  if (!cleanReason) {
    return res.status(422).json({ error: 'Debes indicar el motivo de la modificacion' });
  }
  if (cleanReason.length > 1000) {
    return res.status(422).json({ error: 'reason no puede superar 1000 caracteres' });
  }

  // Validar payload de items
  const desiredByProduct = new Map(); // productId -> quantity
  for (const [idx, it] of items.entries()) {
    const pid = Number(it?.productId);
    const qty = Math.trunc(Number(it?.quantity));
    if (!Number.isInteger(pid) || pid <= 0) {
      return res.status(422).json({ error: `items[${idx}].productId invalido` });
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(422).json({ error: `items[${idx}].quantity debe ser entero positivo` });
    }
    if (desiredByProduct.has(pid)) {
      return res.status(422).json({ error: `productId duplicado: ${pid}` });
    }
    desiredByProduct.set(pid, qty);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock de pedido y validaciones de scope
    const { rows: orderRows } = await client.query(
      `SELECT o.* FROM orders o WHERE o.id = $1 FOR UPDATE`, [orderId]
    );
    const order = orderRows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
    if (!ITEM_EDITABLE_STATUSES.includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Solo se pueden modificar items antes de que el pedido entre a Alistamiento',
      });
    }

    // Autorizacion por scope segun rol/clientRole
    let authorized = false;
    if (role === 'admin' || role === 'advisor') {
      authorized = true;
    } else if (role === 'client' && clientRole === 'creador_pedidos') {
      authorized = order.client_id === myId;
    } else if (role === 'client' && clientRole === 'supervisor') {
      const { rows: cu } = await client.query(
        `SELECT company_id, sucursal_id FROM users WHERE id = $1`, [order.client_id]
      );
      authorized = cu[0]?.company_id === companyId && cu[0]?.sucursal_id === sucursalId;
    } else if (role === 'client' && clientRole === 'administrador_contrato') {
      const { rows: cu } = await client.query(
        `SELECT company_id FROM users WHERE id = $1`, [order.client_id]
      );
      authorized = cu[0]?.company_id === companyId;
    }
    if (!authorized) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No tiene permiso para modificar items de este pedido' });
    }

    if (role === 'advisor' && order.advisor_id && order.advisor_id !== myId && !allOrders) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Pedido asignado a otro asesor' });
    }

    // Snapshot actual (frozen prices: NO se cambia el unit_price aqui)
    const { rows: existing } = await client.query(
      `SELECT * FROM order_items WHERE order_id = $1`, [orderId]
    );

    const existingByProduct = new Map();
    for (const it of existing) existingByProduct.set(it.product_id, it);

    // Validar que solo se modifiquen/eliminen items existentes (no se agregan nuevos)
    for (const pid of desiredByProduct.keys()) {
      if (!existingByProduct.has(pid)) {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: `productId ${pid} no pertenece al pedido` });
      }
    }

    // Calcular cambios (updates y removes)
    const changes = [];
    let newTotal = 0;

    for (const it of existing) {
      const desiredQty = desiredByProduct.get(it.product_id);
      const unitPrice = Number(it.unit_price);
      if (desiredQty === undefined) {
        // Eliminado
        changes.push({
          action: 'removed',
          productId: it.product_id,
          productName: it.product_name,
          sku: it.sku,
          prevQuantity: it.quantity,
          newQuantity: null,
          prevUnitPrice: unitPrice,
          newUnitPrice: null,
        });
      } else if (desiredQty !== it.quantity) {
        // Cambio de cantidad
        changes.push({
          action: 'updated',
          productId: it.product_id,
          productName: it.product_name,
          sku: it.sku,
          prevQuantity: it.quantity,
          newQuantity: desiredQty,
          prevUnitPrice: unitPrice,
          newUnitPrice: unitPrice,
        });
        newTotal += unitPrice * desiredQty;
      } else {
        newTotal += unitPrice * it.quantity;
      }
    }

    if (!changes.length) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'No hay cambios para guardar' });
    }

    // Validar que quede al menos un item en el pedido
    const remainingItems = existing.filter(it => desiredByProduct.has(it.product_id)).length;
    if (remainingItems === 0) {
      await client.query('ROLLBACK');
      return res.status(422).json({
        error: 'No puedes eliminar todos los productos. Si el pedido no es viable, rechazalo o cancelalo segun el flujo.',
      });
    }

    // Aplicar cambios en order_items
    for (const ch of changes) {
      if (ch.action === 'removed') {
        await client.query(
          `DELETE FROM order_items WHERE order_id = $1 AND product_id = $2`,
          [orderId, ch.productId]
        );
      } else {
        await client.query(
          `UPDATE order_items SET quantity = $1
           WHERE order_id = $2 AND product_id = $3`,
          [ch.newQuantity, orderId, ch.productId]
        );
      }

      await client.query(
        `INSERT INTO order_item_changes
           (order_id, product_id, product_name, sku, action,
            prev_quantity, new_quantity, prev_unit_price, new_unit_price,
            reason, changed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          orderId, ch.productId, ch.productName, ch.sku || null, ch.action,
          ch.prevQuantity, ch.newQuantity, ch.prevUnitPrice, ch.newUnitPrice,
          cleanReason, myId,
        ]
      );
    }

    // Recalcular total + discriminacion de IVA
    const { subtotal: newSubtotal, iva: newIva } = splitIva(newTotal);
    await client.query(
      `UPDATE orders SET total = $1, subtotal = $2, iva = $3 WHERE id = $4`,
      [newTotal, newSubtotal, newIva, orderId]
    );

    // Comentario sistema con el motivo (queda en timeline)
    const summary = changes.map(c =>
      c.action === 'removed'
        ? `eliminado: ${c.productName}`
        : `${c.productName}: ${c.prevQuantity} -> ${c.newQuantity}`
    ).join('; ');
    await client.query(
      `INSERT INTO order_comments (order_id, author_id, text)
       VALUES ($1, $2, $3)`,
      [orderId, myId, `[Validacion] ${summary}. Motivo: ${cleanReason}`]
    );

    await client.query('COMMIT');

    // Regenerar PO PDF (fuera de la transaccion para no bloquear)
    let warnings;
    try {
      await ensurePurchaseOrderPdf(orderId, myId, pool, { regenerate: true });
    } catch (pdfErr) {
      console.error(`[orders] No se pudo regenerar PDF tras edicion de items en ${orderId}:`, pdfErr);
      warnings = ['No se pudo regenerar la orden de compra'];
    }

    return res.json({
      orderId,
      total: newTotal,
      subtotal: newSubtotal,
      iva: newIva,
      changes,
      ...(warnings ? { warnings } : {}),
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

export default router;
