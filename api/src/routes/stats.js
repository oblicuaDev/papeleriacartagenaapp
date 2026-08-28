import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildCsv, buildXlsx } from '../lib/orderExport.js';

const router = Router();
router.use(requireAuth);

// Construye el filtro WHERE de pedidos segun el rol del request.
// Devuelve { conditions, params } para componer en queries posteriores.
// Lanza un Error con .status para errores de autorizacion.
function buildScopeFilter(req) {
  const { role, id, companyId, clientRole, sucursalId } = req.user;
  const {
    dateFrom, dateTo, status,
    companyId: qCompanyId, sucursalId: qSucursalId,
    userId: qUserId, categoryId: qCategoryId, granCategoriaId: qGranCategoriaId,
  } = req.query;

  const params = [];
  const conds = [];

  if (role === 'admin') {
    if (qCompanyId) conds.push(`uc.company_id = $${params.push(parseInt(qCompanyId))}`);
    if (qSucursalId) conds.push(`uc.sucursal_id = $${params.push(parseInt(qSucursalId))}`);
  } else if (role === 'advisor') {
    conds.push(`o.advisor_id = $${params.push(id)}`);
  } else if (role === 'client' && clientRole === 'creador_pedidos') {
    conds.push(`o.client_id = $${params.push(id)}`);
  } else if (role === 'client' && clientRole === 'supervisor') {
    // Supervisor solo ve su sucursal
    conds.push(`uc.company_id = $${params.push(companyId)}`);
    conds.push(`uc.sucursal_id = $${params.push(sucursalId ?? null)}`);
  } else if (role === 'client' && (clientRole === 'admin_empresa' || clientRole === 'administrador_contrato')) {
    // admin_empresa/administrador_contrato ven toda su empresa, opcionalmente filtrado por sucursal
    conds.push(`uc.company_id = $${params.push(companyId)}`);
    if (qSucursalId) conds.push(`uc.sucursal_id = $${params.push(parseInt(qSucursalId))}`);
  } else {
    const e = new Error('No autorizado');
    e.status = 403;
    throw e;
  }

  // Usuario gestor: solo tiene sentido en vistas agregadas de cliente
  // (supervisor/admin_empresa/administrador_contrato). uc.id ya viene acotado
  // por company_id/sucursal_id arriba, asi que agregar este filtro nunca
  // permite ver usuarios fuera del scope ya resuelto.
  if (qUserId && role === 'client' && (clientRole === 'supervisor' || clientRole === 'admin_empresa' || clientRole === 'administrador_contrato')) {
    conds.push(`uc.id = $${params.push(parseInt(qUserId))}`);
  }

  conds.push(`o.status <> 'Borrador'`);
  if (status)   conds.push(`o.status = $${params.push(status)}`);
  if (dateFrom) conds.push(`o.created_at >= $${params.push(dateFrom)}`);
  if (dateTo)   conds.push(`o.created_at <= $${params.push(dateTo + ' 23:59:59')}`);

  // Linea de producto: categoria (chica) o gran categoria (grande), mutuamente excluyentes.
  // EXISTS en vez de JOIN para no multiplicar filas de orders (rompería los SUM agregados).
  if (qCategoryId) {
    conds.push(`EXISTS (
      SELECT 1 FROM order_items oi JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id AND p.category_id = $${params.push(parseInt(qCategoryId))}
    )`);
  } else if (qGranCategoriaId) {
    conds.push(`EXISTS (
      SELECT 1 FROM order_items oi JOIN products p ON p.id = oi.product_id
      JOIN categories c ON c.id = p.category_id
      WHERE oi.order_id = o.id AND c.gran_categoria_id = $${params.push(parseInt(qGranCategoriaId))}
    )`);
  }

  return { conditions: conds, params };
}

// GET /stats/admin
router.get('/admin', requireRole('admin'), async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  const rangeParams = [];
  // Los borradores nunca cuentan en indicadores.
  const rangeConds = [`o.status <> 'Borrador'`];
  if (dateFrom) rangeConds.push(`o.created_at >= $${rangeParams.push(dateFrom)}`);
  if (dateTo)   rangeConds.push(`o.created_at <= $${rangeParams.push(dateTo + ' 23:59:59')}`);
  // rangeWhere: para queries con FROM orders o (WHERE independiente).
  // rangeWhereAnd: para queries que ya traen su propio WHERE (ej. status NOT IN...).
  const rangeWhere    = 'WHERE ' + rangeConds.join(' AND ');
  const rangeWhereAnd = 'AND ' + rangeConds.join(' AND ');

  try {
    const [
      { rows: totalRows },
      { rows: monthRows },
      { rows: statusRows },
      { rows: revenueRows },
      { rows: clientRows },
      { rows: productRows },
      { rows: topProdRows },
      { rows: deliveredUnitRows },
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(o.subtotal), 0) AS subtotal,
                COALESCE(SUM(o.iva), 0) AS iva,
                COALESCE(SUM(o.iva_19), 0) AS iva19,
                COALESCE(SUM(o.iva_5), 0) AS iva5,
                COALESCE(SUM(o.iva_exento_base), 0) AS exento_base,
                COALESCE(SUM(o.total), 0) AS revenue
         FROM orders o ${rangeWhere}`,
        rangeParams
      ),
      pool.query(`
        SELECT COUNT(*) AS total,
               COALESCE(SUM(subtotal), 0) AS subtotal,
               COALESCE(SUM(iva), 0) AS iva,
               COALESCE(SUM(total), 0) AS revenue
        FROM orders
        WHERE status <> 'Borrador'
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`),
      pool.query(`
        SELECT status, COUNT(*) AS count
        FROM orders
        WHERE status NOT IN ('Borrador', 'Pendiente por aprobar', 'Rechazado')
        GROUP BY status`),
      pool.query(
        `SELECT TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM') AS month,
                COALESCE(SUM(o.subtotal), 0) AS subtotal,
                COALESCE(SUM(o.iva), 0) AS iva,
                COALESCE(SUM(o.total), 0) AS revenue
         FROM orders o
         ${rangeWhere}
         GROUP BY 1
         ORDER BY 1 DESC
         LIMIT 12`,
        rangeParams
      ),
      pool.query(`SELECT COUNT(*) AS count FROM users WHERE role = 'client' AND active = true`),
      pool.query(`SELECT COUNT(*) AS count FROM products WHERE active = true`),
      pool.query(
        `SELECT oi.product_id, oi.product_name, oi.sku,
                SUM(oi.quantity)::int AS quantity
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status NOT IN ('Pendiente por aprobar', 'Rechazado') ${rangeWhereAnd}
         GROUP BY oi.product_id, oi.product_name, oi.sku
         ORDER BY quantity DESC
         LIMIT 10`,
        rangeParams
      ),
      pool.query(
        `SELECT COALESCE(SUM(oi.quantity), 0)::int AS units
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status = 'Entregado' ${rangeWhereAnd}`,
        rangeParams
      ),
    ]);

    const ordersByStatus = {};
    for (const row of statusRows) ordersByStatus[row.status] = parseInt(row.count);

    const pendingOrders = statusRows
      .filter(r => ['Pendiente', 'Validar disponibilidad', 'Alistamiento', 'En Ruta'].includes(r.status))
      .reduce((acc, r) => acc + parseInt(r.count), 0);

    return res.json({
      totalOrders:      parseInt(totalRows[0].total),
      ordersThisMonth:  parseInt(monthRows[0].total),
      totalSubtotal:    parseFloat(totalRows[0].subtotal),
      totalIva:         parseFloat(totalRows[0].iva),
      totalIva19:       parseFloat(totalRows[0].iva19),
      totalIva5:        parseFloat(totalRows[0].iva5),
      totalExentoBase:  parseFloat(totalRows[0].exento_base),
      totalRevenue:     parseFloat(totalRows[0].revenue),
      subtotalThisMonth:parseFloat(monthRows[0].subtotal),
      ivaThisMonth:     parseFloat(monthRows[0].iva),
      revenueThisMonth: parseFloat(monthRows[0].revenue),
      pendingOrders,
      activeClients:    parseInt(clientRows[0].count),
      activeProducts:   parseInt(productRows[0].count),
      ordersByStatus,
      revenueByMonth:   revenueRows.reverse(),
      topProducts:      topProdRows,
      deliveredUnits:   parseInt(deliveredUnitRows[0].units),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /stats/advisor
router.get('/advisor', requireRole('advisor'), async (req, res) => {
  const advisorId = req.user.id;
  const { dateFrom, dateTo, companyId } = req.query;

  // Filtro de rango/empresa reutilizado en las queries agregadas de items.
  // (las de total/mes/status se dejan como estaban, sin filtro de periodo,
  // para no cambiar el significado de "mis pedidos" ya usado en otras vistas)
  const rangeParams = [advisorId];
  const rangeConds = [`o.advisor_id = $1`, `o.status <> 'Borrador'`];
  if (companyId) rangeConds.push(`uc.company_id = $${rangeParams.push(parseInt(companyId))}`);
  if (dateFrom)  rangeConds.push(`o.created_at >= $${rangeParams.push(dateFrom)}`);
  if (dateTo)    rangeConds.push(`o.created_at <= $${rangeParams.push(dateTo + ' 23:59:59')}`);
  const rangeWhere = rangeConds.join(' AND ');

  try {
    const [
      { rows: totalRows },
      { rows: monthRows },
      { rows: statusRows },
      { rows: topProdRows },
      { rows: deliveredUnitRows },
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(o.subtotal), 0) AS subtotal,
                COALESCE(SUM(o.iva), 0) AS iva,
                COALESCE(SUM(o.iva_19), 0) AS iva19,
                COALESCE(SUM(o.iva_5), 0) AS iva5,
                COALESCE(SUM(o.iva_exento_base), 0) AS exento_base,
                COALESCE(SUM(o.total), 0) AS revenue
         FROM orders o
         JOIN users uc ON uc.id = o.client_id
         WHERE ${rangeWhere}`,
        rangeParams
      ),
      pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(subtotal), 0) AS subtotal,
                COALESCE(SUM(iva), 0) AS iva,
                COALESCE(SUM(total), 0) AS revenue
         FROM orders
         WHERE advisor_id = $1 AND status <> 'Borrador'
           AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
        [advisorId]
      ),
      pool.query(
        `SELECT status, COUNT(*) AS count FROM orders
         WHERE advisor_id = $1 AND status <> 'Borrador' GROUP BY status`,
        [advisorId]
      ),
      pool.query(
        `SELECT oi.product_id, oi.product_name, oi.sku,
                SUM(oi.quantity)::int AS quantity
         FROM orders o
         JOIN users uc ON uc.id = o.client_id
         JOIN order_items oi ON oi.order_id = o.id
         WHERE ${rangeWhere} AND o.status NOT IN ('Pendiente por aprobar', 'Rechazado')
         GROUP BY oi.product_id, oi.product_name, oi.sku
         ORDER BY quantity DESC
         LIMIT 10`,
        rangeParams
      ),
      pool.query(
        `SELECT COALESCE(SUM(oi.quantity), 0)::int AS units
         FROM orders o
         JOIN users uc ON uc.id = o.client_id
         JOIN order_items oi ON oi.order_id = o.id
         WHERE ${rangeWhere} AND o.status = 'Entregado'`,
        rangeParams
      ),
    ]);

    const ordersByStatus = {};
    for (const row of statusRows) ordersByStatus[row.status] = parseInt(row.count);

    const pendingForMe = (ordersByStatus['Pendiente'] || 0) +
                         (ordersByStatus['Validar disponibilidad'] || 0);

    return res.json({
      myOrders:         parseInt(totalRows[0].total),
      myOrdersThisMonth:parseInt(monthRows[0].total),
      mySubtotal:       parseFloat(totalRows[0].subtotal),
      myIva:            parseFloat(totalRows[0].iva),
      myIva19:          parseFloat(totalRows[0].iva19),
      myIva5:           parseFloat(totalRows[0].iva5),
      myExentoBase:     parseFloat(totalRows[0].exento_base),
      myRevenue:        parseFloat(totalRows[0].revenue),
      subtotalThisMonth:parseFloat(monthRows[0].subtotal),
      ivaThisMonth:     parseFloat(monthRows[0].iva),
      revenueThisMonth: parseFloat(monthRows[0].revenue),
      pendingForMe,
      ordersByStatus,
      topProducts:      topProdRows,
      deliveredUnits:   parseInt(deliveredUnitRows[0].units),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /stats/client (PHASE 8)
//   - supervisor: stats agregadas de toda la empresa
//   - creador_pedidos: stats de sus propios pedidos
router.get('/client', requireRole('client'), async (req, res) => {
  const { id: myId, companyId, clientRole, sucursalId } = req.user;
  const {
    sucursalId: qSucursalId, userId: qUserId,
    categoryId: qCategoryId, granCategoriaId: qGranCategoriaId,
  } = req.query;
  let { dateFrom, dateTo } = req.query;

  // Default: ultimos 6 meses si no se especifica dateFrom, para no cargar
  // todo el historico cuando el frontend no manda filtro explicito.
  if (!dateFrom) {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    dateFrom = d.toISOString().slice(0, 10);
  }

  //   creador_pedidos:        ve sus propios pedidos
  //   supervisor:             ve los pedidos de su sucursal
  //   admin_empresa:          ve los pedidos de toda la empresa (filtro opcional por sucursalId), solo lectura
  //   administrador_contrato: igual que admin_empresa para lectura/dashboard, pero puede aprobar/editar
  const isCompanyWide = clientRole === 'admin_empresa' || clientRole === 'administrador_contrato';
  const isSupervisor  = clientRole === 'supervisor';

  let where;
  let params;
  if (isCompanyWide) {
    if (qSucursalId) {
      where  = `uc.company_id = $1 AND uc.sucursal_id = $2`;
      params = [companyId, parseInt(qSucursalId)];
    } else {
      where  = `uc.company_id = $1`;
      params = [companyId];
    }
  } else if (isSupervisor) {
    where  = `uc.company_id = $1 AND uc.sucursal_id = $2`;
    params = [companyId, sucursalId ?? null];
  } else {
    where  = `o.client_id = $1`;
    params = [myId];
  }

  // Usuario gestor: solo en vistas agregadas (supervisor/admin_empresa). uc.id ya
  // queda acotado por company_id/sucursal_id arriba, no hay fuga de scope posible.
  if (qUserId && (isSupervisor || isCompanyWide)) {
    where += ` AND uc.id = $${params.push(parseInt(qUserId))}`;
  }

  // Los borradores no cuentan en estadisticas.
  where += ` AND o.status <> 'Borrador'`;

  // Rango de fechas (aplica a totalRows/statusRows/monthlyRows/topProdRows/topUserRows,
  // que comparten `where`; monthRows agrega ademas su propio filtro de mes calendario).
  where += ` AND o.created_at >= $${params.push(dateFrom)}`;
  if (dateTo) where += ` AND o.created_at <= $${params.push(dateTo + ' 23:59:59')}`;

  // Linea de producto: categoria (chica) o gran categoria (grande), mutuamente excluyentes.
  if (qCategoryId) {
    where += ` AND EXISTS (
      SELECT 1 FROM order_items oi JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id AND p.category_id = $${params.push(parseInt(qCategoryId))}
    )`;
  } else if (qGranCategoriaId) {
    where += ` AND EXISTS (
      SELECT 1 FROM order_items oi JOIN products p ON p.id = oi.product_id
      JOIN categories c ON c.id = p.category_id
      WHERE oi.order_id = o.id AND c.gran_categoria_id = $${params.push(parseInt(qGranCategoriaId))}
    )`;
  }

  const fromJoin = `FROM orders o JOIN users uc ON uc.id = o.client_id`;

  try {
    const [
      { rows: totalRows },
      { rows: monthRows },
      { rows: statusRows },
      { rows: monthlyRows },
      { rows: topProdRows },
      { rows: topUserRows },
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(o.subtotal) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0) AS subtotal,
                COALESCE(SUM(o.iva) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0) AS iva,
                COALESCE(SUM(o.iva_19) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0) AS iva19,
                COALESCE(SUM(o.iva_5) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0) AS iva5,
                COALESCE(SUM(o.iva_exento_base) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0) AS exento_base,
                COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0) AS revenue
         ${fromJoin} WHERE ${where}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(o.subtotal) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0) AS subtotal,
                COALESCE(SUM(o.iva) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0) AS iva,
                COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0) AS revenue
         ${fromJoin}
         WHERE ${where}
           AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NOW())`,
        params
      ),
      pool.query(
        `SELECT o.status, COUNT(*) AS count
         ${fromJoin} WHERE ${where}
         GROUP BY o.status`,
        params
      ),
      pool.query(
        `SELECT TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM') AS month,
                COUNT(*)::int AS orders,
                COALESCE(SUM(o.subtotal) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0)::float AS subtotal,
                COALESCE(SUM(o.iva) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0)::float AS iva,
                COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0)::float AS revenue
         ${fromJoin} WHERE ${where}
         GROUP BY 1
         ORDER BY 1 DESC
         LIMIT 12`,
        params
      ),
      pool.query(
        `SELECT oi.product_id, oi.product_name, oi.sku,
                SUM(oi.quantity)::int AS quantity,
                SUM(oi.quantity * oi.unit_price)::float AS revenue
         ${fromJoin}
         JOIN order_items oi ON oi.order_id = o.id
         WHERE ${where}
           AND o.status NOT IN ('Rechazado', 'Pendiente por aprobar')
         GROUP BY oi.product_id, oi.product_name, oi.sku
         ORDER BY quantity DESC
         LIMIT 10`,
        params
      ),
      // Top users solo es relevante en vistas agregadas (supervisor / admin_empresa).
      (isSupervisor || isCompanyWide)
        ? pool.query(
            `SELECT uc.id AS user_id, uc.name AS user_name,
                    COUNT(*)::int AS orders,
                    COALESCE(SUM(o.subtotal) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0)::float AS subtotal,
                    COALESCE(SUM(o.iva) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0)::float AS iva,
                    COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('Rechazado', 'Pendiente por aprobar')), 0)::float AS revenue
             ${fromJoin}
             WHERE ${where}
             GROUP BY uc.id, uc.name
             ORDER BY orders DESC
             LIMIT 10`,
            params
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const ordersByStatus = {};
    for (const row of statusRows) ordersByStatus[row.status] = parseInt(row.count);

    // Presupuesto anual: solo aplica al scope de empresa (admin_empresa).
    // Gasto real = SUM(total) de pedidos ENTREGADOS de la empresa en el anio actual.
    let annualBudget = null;
    let budgetSpent = 0;
    if (isCompanyWide) {
      const [{ rows: cRows }, { rows: sRows }] = await Promise.all([
        pool.query(`SELECT annual_budget FROM companies WHERE id = $1`, [companyId]),
        pool.query(
          `SELECT COALESCE(SUM(o.total), 0) AS spent
           FROM orders o
           JOIN users uc ON uc.id = o.client_id
           WHERE uc.company_id = $1
             AND o.status = 'Entregado'
             AND DATE_PART('year', o.delivered_at) = DATE_PART('year', NOW())`,
          [companyId]
        ),
      ]);
      annualBudget = cRows[0]?.annual_budget != null ? parseFloat(cRows[0].annual_budget) : null;
      budgetSpent = parseFloat(sRows[0].spent);
    }

    return res.json({
      scope: isCompanyWide ? 'company' : isSupervisor ? 'sucursal' : 'self',
      appliedDateFrom:  dateFrom,
      appliedDateTo:    dateTo || null,
      totalOrders:      parseInt(totalRows[0].total),
      ordersThisMonth:  parseInt(monthRows[0].total),
      totalSubtotal:    parseFloat(totalRows[0].subtotal),
      totalIva:         parseFloat(totalRows[0].iva),
      totalIva19:       parseFloat(totalRows[0].iva19),
      totalIva5:        parseFloat(totalRows[0].iva5),
      totalExentoBase:  parseFloat(totalRows[0].exento_base),
      totalSpent:       parseFloat(totalRows[0].revenue),
      subtotalThisMonth:parseFloat(monthRows[0].subtotal),
      ivaThisMonth:     parseFloat(monthRows[0].iva),
      spentThisMonth:   parseFloat(monthRows[0].revenue),
      ordersByStatus,
      monthly:          monthlyRows.reverse(),
      topProducts:      topProdRows,
      topUsers:         topUserRows,
      annualBudget,
      budgetSpent,
      budgetAvailable:  annualBudget != null ? Math.max(0, annualBudget - budgetSpent) : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /stats/orders/export?format=csv|xlsx (PHASE 8)
// Aplica el mismo scope por rol que GET /orders.
router.get('/orders/export', async (req, res) => {
  const format = (req.query.format || 'csv').toLowerCase();
  if (!['csv', 'xlsx'].includes(format)) {
    return res.status(422).json({ error: 'format debe ser csv o xlsx' });
  }

  let scope;
  try {
    scope = buildScopeFilter(req);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }

  const where = scope.conditions.length ? 'WHERE ' + scope.conditions.join(' AND ') : '';

  try {
    const { rows } = await pool.query(
      `SELECT o.id,
              o.status,
              TO_CHAR(o.created_at, 'YYYY-MM-DD') AS created_at,
              c.name  AS company,
              s.name  AS sucursal,
              uc.name AS client,
              ua.name AS advisor,
              o.subtotal::float AS subtotal,
              o.iva::float AS iva,
              o.total::float AS total,
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id)::int AS items
         FROM orders o
         JOIN users uc           ON uc.id = o.client_id
         LEFT JOIN companies c   ON c.id  = uc.company_id
         LEFT JOIN sucursales s  ON s.id  = uc.sucursal_id
         LEFT JOIN users ua      ON ua.id = o.advisor_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT 10000`,
      scope.params
    );

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `pedidos_${stamp}.${format}`;

    if (format === 'csv') {
      const csv = buildCsv(rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(csv);
    } else {
      const buf = await buildXlsx(rows);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buf);
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
