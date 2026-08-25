import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { resolvePriceListChain, priceSqlFragmentChain } from '../lib/pricing.js';
import { resolveActiveContractProductIds } from '../lib/contracts.js';

const router = Router();
router.use(requireAuth, requireRole('client'));

// GET /catalog
router.get('/', async (req, res) => {
  const { id: userId, companyId } = req.user;
  const { categoryId, granCategoriaId, search, page = 1, limit = 20 } = req.query;
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

    // Cliente con contrato vigente -> catalogo restringido a esos SKUs.
    const contractProductIds = await resolveActiveContractProductIds(companyId);
    if (contractProductIds) {
      conditions.push(`p.id = ANY($${params.push([...contractProductIds])}::int[])`);
    }

    if (categoryId) conditions.push(`p.category_id = $${params.push(parseInt(categoryId))}`);

    if (granCategoriaId) conditions.push(`c.gran_categoria_id = $${params.push(parseInt(granCategoriaId))}`);

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

// GET /catalog/related?productId=N&limit=6
// Devuelve productos sugeridos a partir de las categorias relacionadas con la
// categoria del producto. Si no hay relaciones (o no alcanzan el limite),
// completa con productos aleatorios de la misma categoria. Excluye el propio
// producto y prioriza activos/disponibles.
router.get('/related', async (req, res) => {
  const { id: userId, companyId } = req.user;
  const productId = parseInt(req.query.productId);
  const limit = Math.min(24, Math.max(1, parseInt(req.query.limit) || 6));

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(422).json({ error: 'productId invalido' });
  }

  try {
    const { rows: pRows } = await pool.query(
      `SELECT id, category_id FROM products WHERE id = $1`, [productId]
    );
    if (!pRows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
    const categoryId = pRows[0].category_id;

    const chain = await resolvePriceListChain({ companyId, userId });
    const listIdParams = chain.map((_, i) => `$${i + 1}`);
    const { select: priceSelect, join: priceJoin } = priceSqlFragmentChain({
      alias: 'p',
      listIdParams,
    });

    // Cliente con contrato vigente -> sugeridos tambien restringidos a esos SKUs.
    const contractProductIds = await resolveActiveContractProductIds(companyId);

    async function pickFrom(categoryIds, exclude, n) {
      if (!categoryIds.length || n <= 0) return [];
      if (contractProductIds && contractProductIds.size === 0) return [];
      const params = [...chain];
      const catIdx = params.length + 1;
      params.push(categoryIds);
      const excludeIdx = params.length + 1;
      params.push(exclude);
      let contractCond = '';
      if (contractProductIds) {
        const contractIdx = params.length + 1;
        params.push([...contractProductIds]);
        contractCond = `AND p.id = ANY($${contractIdx}::int[])`;
      }
      const limitIdx = params.length + 1;
      params.push(n);
      const { rows } = await pool.query(
        `SELECT p.id, p.name, p.sku,
                p.category_id AS "categoryId",
                c.name AS "categoryName",
                ${priceSelect} AS price,
                p.stock, p.unit,
                p.image_url AS "imageUrl"
         FROM products p
         JOIN categories c ON c.id = p.category_id
         ${priceJoin}
         WHERE p.active = true
           AND c.active = true
           AND p.category_id = ANY($${catIdx}::int[])
           AND NOT (p.id = ANY($${excludeIdx}::int[]))
           ${contractCond}
         ORDER BY (p.stock > 0) DESC, RANDOM()
         LIMIT $${limitIdx}`,
        params
      );
      return rows;
    }

    const { rows: relCatRows } = await pool.query(
      `SELECT related_category_id FROM category_relations WHERE category_id = $1`,
      [categoryId]
    );
    const relatedCatIds = relCatRows.map(r => r.related_category_id);

    const exclude = [productId];
    let result = [];
    if (relatedCatIds.length) {
      result = await pickFrom(relatedCatIds, exclude, limit);
      exclude.push(...result.map(r => r.id));
    }

    if (result.length < limit) {
      const remaining = limit - result.length;
      const fallback = await pickFrom([categoryId], exclude, remaining);
      result = result.concat(fallback);
    }

    return res.json({ data: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;