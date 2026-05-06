import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /categories
router.get('/', async (req, res) => {
  const { active } = req.query;
  const params = [];
  const conditions = [];
  if (active !== undefined) conditions.push(`active = $${params.push(active === 'true')}`);
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  try {
    const { rows } = await pool.query(`SELECT * FROM categories ${where} ORDER BY name`, params);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /categories
router.post('/', requireRole('admin'), async (req, res) => {
  const { name, description, active = true } = req.body;
  if (!name) return res.status(422).json({ error: 'name es requerido' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO categories (name, description, active) VALUES ($1,$2,$3) RETURNING *`,
      [name, description || null, active]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /categories/:id
router.put('/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description, active } = req.body;
  try {
    const fields = [];
    const params = [];
    if (name !== undefined) fields.push(`name        = $${params.push(name)}`);
    if (description !== undefined) fields.push(`description = $${params.push(description)}`);
    if (active !== undefined) fields.push(`active      = $${params.push(active)}`);
    if (!fields.length) return res.status(422).json({ error: 'No hay campos para actualizar' });

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE categories SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`, params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Categoría no encontrada' });
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /categories/:id — hard delete con validacion
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    // products.category_id es ON DELETE RESTRICT
    const { rows } = await pool.query(
      `SELECT id FROM products WHERE category_id = $1 LIMIT 1`, [id]
    );
    if (rows.length) {
      return res.status(409).json({
        error: 'La categoría tiene productos asociados. Reasigna o elimina los productos antes.',
      });
    }

    const result = await pool.query(`DELETE FROM categories WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    return res.json({ message: 'Categoría eliminada definitivamente' });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'La categoría tiene productos vinculados' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
