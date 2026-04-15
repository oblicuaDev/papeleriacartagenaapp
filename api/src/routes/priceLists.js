import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

// GET /price-lists
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM price_lists ORDER BY name`);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /price-lists
router.post('/', async (req, res) => {
  const { name, description, multiplier } = req.body;
  if (!name || multiplier === undefined) return res.status(422).json({ error: 'name y multiplier son requeridos' });
  if (multiplier <= 0 || multiplier > 2) return res.status(422).json({ error: 'multiplier debe estar entre 0 y 2' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO price_lists (name, description, multiplier) VALUES ($1,$2,$3) RETURNING *`,
      [name, description || null, multiplier]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
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
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `SELECT id FROM users WHERE price_list_id = $1 AND active = true LIMIT 1`, [id]
    );
    if (rows.length) return res.status(409).json({ error: 'La lista está asignada a usuarios activos' });
    await pool.query(`DELETE FROM price_lists WHERE id = $1`, [id]);
    return res.json({ message: 'Lista eliminada' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
