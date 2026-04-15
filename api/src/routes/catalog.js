import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('client'));

// GET /catalog
router.get('/', async (req, res) => {
  const { id: userId } = req.user;
  const { categoryId, search, page = 1, limit = 20 } = req.query;
  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset   = (pageNum - 1) * limitNum;

  try {
    // Obtener datos de lista de precios del usuario
    const { rows: userRows } = await pool.query(
      `SELECT u.price_list_id, pl.name AS price_list_name, pl.multiplier
       FROM users u
       JOIN price_lists pl ON pl.id = u.price_list_id
       WHERE u.id = $1`,
      [userId]
    );
    if (!userRows[0]) return res.status(422).json({ error: 'El usuario no tiene lista de precios asignada' });

    const { price_list_id, price_list_name, multiplier } = userRows[0];

    const params = [multiplier];
    const conditions = ['p.active = true'];

    if (categoryId) conditions.push(`p.category_id = $${params.push(parseInt(categoryId))}`);
    if (search) {
      conditions.push(
        `(p.name ILIKE $${params.push('%' + search + '%')} OR p.sku ILIKE $${params.push('%' + search + '%')})`
      );
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    const { rows } = await pool.query(
      `SELECT
         p.id, p.name, p.sku, p.category_id,
         c.name AS category_name,
         p.description,
         ROUND(p.base_price * $1)::int AS price,
         p.stock, p.unit, p.image_url,
         COALESCE(
           ARRAY(SELECT complementary_id FROM product_complementaries WHERE product_id = p.id),
           '{}'
         ) AS complementary_ids
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ${where}
       ORDER BY p.name
       LIMIT $${params.push(limitNum)} OFFSET $${params.push(offset)}`,
      params
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM products p ${where}`,
      params.slice(0, params.length - 2)
    );

    return res.json({
      priceListId:   price_list_id,
      priceListName: price_list_name,
      data:          rows,
      total:         parseInt(countRows[0].count),
      page:          pageNum,
      limit:         limitNum,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
