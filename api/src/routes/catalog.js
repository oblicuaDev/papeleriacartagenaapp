import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { resolvePriceListChain, priceSqlFragmentChain } from '../lib/pricing.js';

const router = Router();
router.use(requireAuth, requireRole('client'));

// GET /catalog
router.get('/', async (req, res) => {
  const { id: userId, companyId } = req.user;
  const { categoryId, search, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  try {
    const chain = await resolvePriceListChain({ companyId, userId });
    const priceListId = chain[0] || null;

    let priceListName = null;
    if (priceListId) {
      const { rows: plRows } = await pool.query(
        `SELECT name FROM price_lists WHERE id = $1`,
        [priceListId]
      );
      priceListName = plRows[0]?.name ?? null;
    }

    // Lista IDs como primeros params (uno por nivel de la cadena)
    const params = [...chain];
    const listIdParams = chain.map((_, i) => `$${i + 1}`);
    const conditions = [
      'p.active = true',
      'c.active = true'
    ];

    if (categoryId) conditions.push(`p.category_id = $${params.push(parseInt(categoryId))}`);

    if (search) {
      const s = '%' + search + '%';
      params.push(s);
      const sIndex = params.length;
      conditions.push(`(p.name ILIKE $${sIndex} OR p.sku ILIKE $${sIndex})`);
    }

    const where = 'WHERE ' + conditions.join(' AND ');
    const condParamCount = params.length;

    const { select: priceSelect, join: priceJoin } = priceSqlFragmentChain({
      alias: 'p',
      listIdParams,
    });

    // Se asignan ALIAS en camelCase para que el frontend los lea correctamente
    const { rows } = await pool.query(
      `SELECT
         p.id, p.name, p.sku, 
         p.category_id AS "categoryId",
         c.name AS "categoryName",
         p.description,
         ${priceSelect} AS price,
         p.stock, p.unit, 
         p.image_url AS "imageUrl",
         COALESCE(
           ARRAY(SELECT complementary_id FROM product_complementaries WHERE product_id = p.id),
           '{}'
         ) AS "complementaryIds"
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ${priceJoin}
       ${where}
       ORDER BY p.name
       LIMIT $${params.push(limitNum)} OFFSET $${params.push(offset)}`,
      params
    );

    // DEBUG OBLIGATORIO: Rows encontradas
    console.log("CATALOG ROWS:", rows.length);

    // CORRECCIÓN: Se agrega ${priceJoin} al COUNT para mantener alineado 
    // el parámetro $1 y evitar el error 08P01 de PostgreSQL.
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM products p 
       JOIN categories c ON c.id = p.category_id 
       ${priceJoin}
       ${where}`,
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