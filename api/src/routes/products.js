import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Calcula el precio con el multiplier del usuario autenticado
async function resolveMultiplier(req) {
  const { role, companyId } = req.user;
  const priceListId = req.query.priceListId;

  // Admin/advisor pueden pedir una lista específica
  if ((role === 'admin' || role === 'advisor') && priceListId) {
    const { rows } = await pool.query(`SELECT multiplier FROM price_lists WHERE id = $1`, [priceListId]);
    return rows[0]?.multiplier ?? 1;
  }
  // Cliente usa su lista de precios asignada
  if (role === 'client') {
    const { rows } = await pool.query(
      `SELECT pl.multiplier FROM users u
       JOIN price_lists pl ON pl.id = u.price_list_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    return rows[0]?.multiplier ?? 1;
  }
  return 1;
}

// GET /products
router.get('/', async (req, res) => {
  const { categoryId, active, search, page = 1, limit = 20 } = req.query;
  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const offset   = (pageNum - 1) * limitNum;

  // condParams indexa desde $1 y se reutiliza igual en la count query.
  // multiplier, limit y offset se appenden al final para no desplazar los índices WHERE.
  const condParams = [];
  const conditions = ['p.active = true'];

  if (active !== undefined)  conditions[0] = `p.active = $${condParams.push(active === 'true')}`;
  if (categoryId) conditions.push(`p.category_id = $${condParams.push(parseInt(categoryId))}`);
  if (search) {
    const s = '%' + search + '%';
    conditions.push(
      `(p.name        ILIKE $${condParams.push(s)}
        OR p.sku       ILIKE $${condParams.push(s)}
        OR p.description ILIKE $${condParams.push(s)})`
    );
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  try {
    const multiplier = await resolveMultiplier(req);

    // Params order: [...condParams, limitNum, offset, multiplier]
    const mainParams  = [...condParams, limitNum, offset, multiplier];
    const limitIdx    = condParams.length + 1;
    const offsetIdx   = condParams.length + 2;
    const multIdx     = condParams.length + 3;

    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category_name,
         ROUND(p.base_price * $${multIdx}) AS price,
         COALESCE(
           ARRAY(
             SELECT complementary_id FROM product_complementaries
             WHERE product_id = p.id
           ), '{}'
         ) AS complementary_ids
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ${where}
       ORDER BY p.name
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      mainParams
    );

    // Count usa solo condParams (mismos índices $1...$N)
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM products p ${where}`, condParams
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

// GET /products/:id
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const multiplier = await resolveMultiplier(req);

    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category_name,
         ROUND(p.base_price * $1) AS price
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.id = $2`,
      [multiplier, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });

    // Complementarios expandidos
    const { rows: comps } = await pool.query(
      `SELECT p2.id, p2.name, p2.sku, ROUND(p2.base_price * $1) AS price
       FROM product_complementaries pc
       JOIN products p2 ON p2.id = pc.complementary_id
       WHERE pc.product_id = $2 AND p2.active = true`,
      [multiplier, id]
    );

    return res.json({ ...rows[0], complementaries: comps });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /products
router.post('/', requireRole('admin'), async (req, res) => {
  const { name, sku, categoryId, description, basePrice, stock = 0, unit, active = true, complementaryIds = [] } = req.body;
  if (!name || !sku || !categoryId || basePrice === undefined || !unit) {
    return res.status(422).json({ error: 'name, sku, categoryId, basePrice y unit son requeridos' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: catRows } = await client.query(`SELECT id FROM categories WHERE id = $1`, [categoryId]);
    if (!catRows[0]) return res.status(404).json({ error: 'Categoría no encontrada' });

    const { rows } = await client.query(
      `INSERT INTO products (name, sku, category_id, description, base_price, stock, unit, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, sku, categoryId, description || null, basePrice, stock, unit, active]
    );
    const product = rows[0];

    // Relaciones complementarias bidireccionales
    if (complementaryIds.length) {
      for (const cId of complementaryIds) {
        await client.query(
          `INSERT INTO product_complementaries (product_id, complementary_id) VALUES ($1,$2),($2,$1)
           ON CONFLICT DO NOTHING`,
          [product.id, cId]
        );
      }
    }

    await client.query('COMMIT');
    return res.status(201).json({ ...product, complementaryIds });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'SKU ya registrado' });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// PUT /products/:id
router.put('/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, categoryId, description, basePrice, stock, unit, active, complementaryIds } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const fields = [];
    const params = [];
    if (name        !== undefined) fields.push(`name        = $${params.push(name)}`);
    if (categoryId  !== undefined) fields.push(`category_id = $${params.push(categoryId)}`);
    if (description !== undefined) fields.push(`description = $${params.push(description)}`);
    if (basePrice   !== undefined) fields.push(`base_price  = $${params.push(basePrice)}`);
    if (stock       !== undefined) fields.push(`stock       = $${params.push(stock)}`);
    if (unit        !== undefined) fields.push(`unit        = $${params.push(unit)}`);
    if (active      !== undefined) fields.push(`active      = $${params.push(active)}`);

    if (fields.length) {
      params.push(id);
      const { rows } = await client.query(
        `UPDATE products SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`, params
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
    }

    // Actualizar complementarios si se envían
    if (complementaryIds !== undefined) {
      await client.query(`DELETE FROM product_complementaries WHERE product_id = $1 OR complementary_id = $1`, [id]);
      for (const cId of complementaryIds) {
        await client.query(
          `INSERT INTO product_complementaries (product_id, complementary_id) VALUES ($1,$2),($2,$1)
           ON CONFLICT DO NOTHING`,
          [id, cId]
        );
      }
    }

    await client.query('COMMIT');

    const { rows: updated } = await pool.query(`SELECT * FROM products WHERE id = $1`, [id]);
    return res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// DELETE /products/:id — soft delete
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `SELECT oi.id FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.product_id = $1
         AND o.status NOT IN ('Entregado', 'Rechazado')
       LIMIT 1`,
      [id]
    );
    if (rows.length) return res.status(409).json({ error: 'El producto aparece en pedidos activos' });
    await pool.query(`UPDATE products SET active = false WHERE id = $1`, [id]);
    return res.json({ message: 'Producto desactivado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
