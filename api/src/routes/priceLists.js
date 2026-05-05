import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

// GET /price-lists
// Devuelve cada lista con conteo de items y empresas asignadas.
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pl.*,
              (SELECT COUNT(*) FROM price_list_items pli WHERE pli.price_list_id = pl.id)::int AS item_count,
              (SELECT COUNT(*) FROM companies c WHERE c.price_list_id = pl.id)::int            AS company_count
       FROM price_lists pl
       ORDER BY pl.name`
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /price-lists/:id/items
// Devuelve TODOS los productos activos con su precio en esta lista (si existe).
router.get('/:id/items', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows: list } = await pool.query(`SELECT id FROM price_lists WHERE id = $1`, [id]);
    if (!list[0]) return res.status(404).json({ error: 'Lista no encontrada' });

    const { rows } = await pool.query(
      `SELECT p.id AS product_id, p.name, p.sku, p.unit, p.base_price, p.active,
              c.name AS category_name,
              pli.price AS list_price,
              pli.currency
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN price_list_items pli
         ON pli.product_id = p.id AND pli.price_list_id = $1
       WHERE p.active = true
       ORDER BY p.name`,
      [id]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /price-lists/:id/items
// Bulk upsert: body = { items: [{ productId, price }] }
//   - price > 0 → upsert
//   - price === null o 0 → elimina el override (volverá a base_price)
router.put('/:id/items', async (req, res) => {
  const id = parseInt(req.params.id);
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(422).json({ error: 'items[] es requerido' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: list } = await client.query(`SELECT id FROM price_lists WHERE id = $1`, [id]);
    if (!list[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lista no encontrada' });
    }

    for (const it of items) {
      if (!Number.isInteger(it?.productId)) continue;
      const price = Number(it.price);
      if (!Number.isFinite(price) || price <= 0) {
        await client.query(
          `DELETE FROM price_list_items WHERE price_list_id = $1 AND product_id = $2`,
          [id, it.productId]
        );
      } else {
        await client.query(
          `INSERT INTO price_list_items (product_id, price_list_id, price)
           VALUES ($1, $2, $3)
           ON CONFLICT (product_id, price_list_id)
           DO UPDATE SET price = EXCLUDED.price`,
          [it.productId, id, price]
        );
      }
    }
    await client.query('COMMIT');
    return res.json({ id, updated: items.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// GET /price-lists/:id/companies — empresas que tienen esta lista asignada
router.get('/:id/companies', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `SELECT id, name, nit FROM companies WHERE price_list_id = $1 ORDER BY name`,
      [id]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /price-lists/:id/companies
// body = { companyIds: number[] }
// Asigna ESTAS empresas a la lista; las que ya estaban y no aparecen quedan sin lista.
router.put('/:id/companies', async (req, res) => {
  const id = parseInt(req.params.id);
  const { companyIds } = req.body;
  if (!Array.isArray(companyIds)) return res.status(422).json({ error: 'companyIds[] es requerido' });

  const ids = companyIds
    .map(v => parseInt(v))
    .filter(v => Number.isInteger(v) && v > 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: list } = await client.query(`SELECT id FROM price_lists WHERE id = $1`, [id]);
    if (!list[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lista no encontrada' });
    }

    // Quitar lista a empresas que la tenían y ya no están en el set
    await client.query(
      `UPDATE companies SET price_list_id = NULL
       WHERE price_list_id = $1
         AND ($2::int[] IS NULL OR id <> ALL($2::int[]))`,
      [id, ids.length ? ids : null]
    );

    // Asignar lista a las del set
    if (ids.length) {
      await client.query(
        `UPDATE companies SET price_list_id = $1 WHERE id = ANY($2::int[])`,
        [id, ids]
      );
    }

    await client.query('COMMIT');
    return res.json({ id, companyIds: ids });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// POST /price-lists
// multiplier es opcional (default 1.0) — el modelo principal es precio fijo por producto
// vía price_list_items.
router.post('/', async (req, res) => {
  const { name, description, multiplier } = req.body;
  if (!name) return res.status(422).json({ error: 'name es requerido' });
  const mult = multiplier === undefined || multiplier === null ? 1.0 : Number(multiplier);
  if (!Number.isFinite(mult) || mult <= 0 || mult > 2) {
    return res.status(422).json({ error: 'multiplier debe estar entre 0 y 2' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO price_lists (name, description, multiplier) VALUES ($1,$2,$3) RETURNING *`,
      [name, description || null, mult]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una lista con ese nombre' });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /price-lists/:id
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description, multiplier } = req.body;
  try {
    const fields = [];
    const params = [];
    if (name        !== undefined) fields.push(`name        = $${params.push(name)}`);
    if (description !== undefined) fields.push(`description = $${params.push(description)}`);
    if (multiplier  !== undefined) fields.push(`multiplier  = $${params.push(multiplier)}`);
    if (!fields.length) return res.status(422).json({ error: 'No hay campos para actualizar' });

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE price_lists SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`, params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Lista no encontrada' });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /price-lists/:id
// Bloqueado si está asignada a empresas, sucursales o usuarios activos.
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows: companies } = await pool.query(
      `SELECT id FROM companies WHERE price_list_id = $1 LIMIT 1`, [id]
    );
    if (companies.length) {
      return res.status(409).json({ error: 'La lista está asignada a empresas' });
    }
    const { rows: sucursales } = await pool.query(
      `SELECT id FROM sucursales WHERE price_list_id = $1 LIMIT 1`, [id]
    );
    if (sucursales.length) {
      return res.status(409).json({ error: 'La lista está asignada a sucursales' });
    }
    const { rows: users } = await pool.query(
      `SELECT id FROM users WHERE price_list_id = $1 AND active = true LIMIT 1`, [id]
    );
    if (users.length) {
      return res.status(409).json({ error: 'La lista está asignada a usuarios activos' });
    }
    // price_list_items se borran por ON DELETE CASCADE
    await pool.query(`DELETE FROM price_lists WHERE id = $1`, [id]);
    return res.json({ message: 'Lista eliminada' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
