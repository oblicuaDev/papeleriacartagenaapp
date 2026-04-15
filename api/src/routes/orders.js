import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

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
};

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
router.post('/', requireRole('client'), async (req, res) => {
  const { id: clientId, clientRole, companyId } = req.user;
  const { notes, items } = req.body;

  if (!items || items.length === 0) {
    return res.status(422).json({ error: 'El pedido debe tener al menos un producto' });
  }

  // Status inicial según clientRole
  const initialStatus = clientRole === 'supervisor' ? 'Pendiente' : 'Pendiente por aprobar';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generar ID
    const orderId = await client.query(`SELECT fn_generate_order_id() AS id`);
    const newId = orderId.rows[0].id;

    // Calcular total y armar snapshot de items
    let total = 0;
    const itemsToInsert = [];

    for (const item of items) {
      const { rows: productRows } = await client.query(
        `SELECT p.*, ROUND(p.base_price * pl.multiplier) AS effective_price
         FROM products p
         JOIN users u ON u.id = $2
         JOIN price_lists pl ON pl.id = u.price_list_id
         WHERE p.id = $1 AND p.active = true`,
        [item.productId, clientId]
      );
      if (!productRows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Producto no encontrado: id=${item.productId}` });
      }
      const product = productRows[0];
      const unitPrice = item.unitPrice ?? Number(product.effective_price);
      total += unitPrice * item.quantity;

      itemsToInsert.push({
        productId:   product.id,
        productName: product.name,
        sku:         product.sku,
        quantity:    item.quantity,
        unitPrice,
        unit:        product.unit,
      });
    }

    // Crear pedido
    await client.query(
      `INSERT INTO orders (id, client_id, status, notes, total)
       VALUES ($1, $2, $3, $4, $5)`,
      [newId, clientId, initialStatus, notes || null, total]
    );

    // Insertar items (snapshot)
    for (const it of itemsToInsert) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, sku, quantity, unit_price, unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [newId, it.productId, it.productName, it.sku, it.quantity, it.unitPrice, it.unit]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({
      id:        newId,
      status:    initialStatus,
      total,
      createdAt: new Date().toISOString(),
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
router.put('/:id', async (req, res) => {
  const { role, id: myId, companyId } = req.user;
  const clientRole = req.user.clientRole;
  const orderId = req.params.id.toUpperCase();
  const { status, carrier, advisorId } = req.body;

  try {
    const { rows } = await pool.query(
      `SELECT o.*, uc.company_id AS client_company_id
       FROM orders o
       JOIN users uc ON uc.id = o.client_id
       WHERE o.id = $1`,
      [orderId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    const order = rows[0];

    // Validar transición de estado
    if (status && status !== order.status) {
      let allowedTransitions = [];
      if (role === 'admin') allowedTransitions = VALID_TRANSITIONS.admin[order.status] || [];
      else if (role === 'advisor') allowedTransitions = VALID_TRANSITIONS.advisor[order.status] || [];
      else if (role === 'client' && clientRole === 'supervisor') {
        // Supervisor solo puede aprobar pedidos de su empresa
        if (order.client_company_id !== companyId) {
          return res.status(403).json({ error: 'No autorizado para aprobar pedidos de otra empresa' });
        }
        allowedTransitions = VALID_TRANSITIONS.supervisor[order.status] || [];
      } else {
        return res.status(403).json({ error: 'No autorizado para cambiar este estado' });
      }

      if (!allowedTransitions.includes(status)) {
        return res.status(422).json({ error: `Transición de estado inválida: ${order.status} → ${status}` });
      }
    }

    const fields = [];
    const params = [];
    if (status   !== undefined) fields.push(`status    = $${params.push(status)}`);
    if (carrier  !== undefined) fields.push(`carrier   = $${params.push(carrier)}`);
    if (advisorId !== undefined && role === 'admin') fields.push(`advisor_id = $${params.push(advisorId)}`);

    // Auto-asignar advisor si es la primera vez que toca el pedido
    if (role === 'advisor' && !order.advisor_id) {
      fields.push(`advisor_id = $${params.push(myId)}`);
    }

    if (!fields.length) return res.status(422).json({ error: 'No hay campos para actualizar' });

    params.push(orderId);
    const { rows: updated } = await pool.query(
      `UPDATE orders SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`, params
    );
    return res.json(updated[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
