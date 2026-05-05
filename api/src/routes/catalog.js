import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { resolvePriceListId, priceSqlFragment } from '../lib/pricing.js';

const router = Router();
router.use(requireAuth, requireRole('client'));

// GET /catalog
router.get('/', async (req, res) => {
  const { id: userId, companyId } = req.user;
  const { categoryId, search, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  try {
    // Lista aplicable: sucursal > company > user. Si no hay lista, usamos base_price.
    const priceListId = await resolvePriceListId({ companyId, userId });

    let priceListName = null;
    if (priceListId) {
      const { rows: plRows } = await pool.query(
        `SELECT name FROM price_lists WHERE id = $1`,
        [priceListId]
      );
      priceListName = plRows[0]?.name ?? null;
    }

    // params: [priceListId, ...condParams, limit, offset]
    const params = [priceListId];
    const conditions = [
      'p.active = true',
      'c.active = true'
    ];

    if (categoryId) conditions.push(`p.category_id = $${params.push(parseInt(categoryId))}`);
    if (search) {
      const s = '%' + search + '%';
      conditions.push(
        `(p.name ILIKE $${params.push(s)} OR p.sku ILIKE $${params.push(s)})`
      );
    }

    const where = 'WHERE ' + conditions.join(' AND ');
    const condParamCount = params.length; // antes de limit/offset

    const { select: priceSelect, join: priceJoin } = priceSqlFragment({
      alias: 'p',
      listIdParam: '$1',
    });

    const { rows } = await pool.query(
      `SELECT
         p.id, p.name, p.sku, p.category_id,
         c.name AS category_name,
         p.description,
         ${priceSelect} AS price,
         p.stock, p.unit, p.image_url,
         COALESCE(
           ARRAY(SELECT complementary_id FROM product_complementaries WHERE product_id = p.id),
           '{}'
         ) AS complementary_ids
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ${priceJoin}
       ${where}
       ORDER BY p.name
       LIMIT $${params.push(limitNum)} OFFSET $${params.push(offset)}`,
      params
    );

    // Count: la condicion no usa $1 (priceListId), pero los placeholders
    // siguen alineados porque condParams ocupan $2..$N.
    // Reusamos params[0..condParamCount] para el count.
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM products p ${where}`,
      params.slice(0, condParamCount)
    );

    return res.json({
      priceListId,
      priceListName,
      data: rows,
      total: parseInt(countRows[0].count),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
