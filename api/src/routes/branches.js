import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /branches
router.get('/', requireRole('admin', 'advisor'), async (req, res) => {
  const { active } = req.query;
  const params = [];
  const conditions = [];
  if (active !== undefined) conditions.push(`active = $${params.push(active === 'true')}`);
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  try {
    const { rows } = await pool.query(`SELECT * FROM branches ${where} ORDER BY name`, params);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /branches
router.post('/', requireRole('admin'), async (req, res) => {
  const { name, city, address, phone, active = true } = req.body;
  if (!name) return res.status(422).json({ error: 'name es requerido' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO branches (name, city, address, phone, active)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, city || null, address || null, phone || null, active]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /branches/:id
router.put('/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, city, address, phone, active } = req.body;
  try {
    const fields = [];
    const params = [];
    if (name    !== undefined) fields.push(`name    = $${params.push(name)}`);
    if (city    !== undefined) fields.push(`city    = $${params.push(city)}`);
    if (address !== undefined) fields.push(`address = $${params.push(address)}`);
    if (phone   !== undefined) fields.push(`phone   = $${params.push(phone)}`);
    if (active  !== undefined) fields.push(`active  = $${params.push(active)}`);
    if (!fields.length) return res.status(422).json({ error: 'No hay campos para actualizar' });

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE branches SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`, params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Sede no encontrada' });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /branches/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `SELECT id FROM users WHERE branch_id = $1 AND active = true LIMIT 1`, [id]
    );
    if (rows.length) return res.status(409).json({ error: 'La sede tiene asesores asignados' });
    await pool.query(`UPDATE branches SET active = false WHERE id = $1`, [id]);
    return res.json({ message: 'Sede eliminada' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
