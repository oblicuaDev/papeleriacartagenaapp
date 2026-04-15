import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /stats/admin
router.get('/admin', requireRole('admin'), async (_req, res) => {
  try {
    const [
      { rows: totalRows },
      { rows: monthRows },
      { rows: statusRows },
      { rows: revenueRows },
      { rows: clientRows },
      { rows: productRows },
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COALESCE(SUM(total), 0) AS revenue FROM orders`),
      pool.query(`
        SELECT COUNT(*) AS total, COALESCE(SUM(total), 0) AS revenue
        FROM orders
        WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`),
      pool.query(`
        SELECT status, COUNT(*) AS count
        FROM orders
        WHERE status NOT IN ('Pendiente por aprobar', 'Rechazado')
        GROUP BY status`),
      pool.query(`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
               COALESCE(SUM(total), 0) AS revenue
        FROM orders
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 12`),
      pool.query(`SELECT COUNT(*) AS count FROM users WHERE role = 'client' AND active = true`),
      pool.query(`SELECT COUNT(*) AS count FROM products WHERE active = true`),
    ]);

    const ordersByStatus = {};
    for (const row of statusRows) ordersByStatus[row.status] = parseInt(row.count);

    const pendingOrders = statusRows
      .filter(r => ['Pendiente', 'Validar disponibilidad', 'Alistamiento', 'En Ruta'].includes(r.status))
      .reduce((acc, r) => acc + parseInt(r.count), 0);

    return res.json({
      totalOrders:      parseInt(totalRows[0].total),
      ordersThisMonth:  parseInt(monthRows[0].total),
      totalRevenue:     parseFloat(totalRows[0].revenue),
      revenueThisMonth: parseFloat(monthRows[0].revenue),
      pendingOrders,
      activeClients:    parseInt(clientRows[0].count),
      activeProducts:   parseInt(productRows[0].count),
      ordersByStatus,
      revenueByMonth:   revenueRows.reverse(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /stats/advisor
router.get('/advisor', requireRole('advisor'), async (req, res) => {
  const advisorId = req.user.id;
  try {
    const [
      { rows: totalRows },
      { rows: monthRows },
      { rows: statusRows },
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total, COALESCE(SUM(total), 0) AS revenue
         FROM orders WHERE advisor_id = $1`,
        [advisorId]
      ),
      pool.query(
        `SELECT COUNT(*) AS total FROM orders
         WHERE advisor_id = $1
           AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
        [advisorId]
      ),
      pool.query(
        `SELECT status, COUNT(*) AS count FROM orders
         WHERE advisor_id = $1 GROUP BY status`,
        [advisorId]
      ),
    ]);

    const ordersByStatus = {};
    for (const row of statusRows) ordersByStatus[row.status] = parseInt(row.count);

    const pendingForMe = (ordersByStatus['Pendiente'] || 0) +
                         (ordersByStatus['Validar disponibilidad'] || 0);

    return res.json({
      myOrders:         parseInt(totalRows[0].total),
      myOrdersThisMonth:parseInt(monthRows[0].total),
      myRevenue:        parseFloat(totalRows[0].revenue),
      pendingForMe,
      ordersByStatus,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
