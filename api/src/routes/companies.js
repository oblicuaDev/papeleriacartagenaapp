import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole, requireAdminOrSupervisor } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /companies
router.get('/', requireAdminOrSupervisor, async (req, res) => {
  try {
    const { active, search } = req.query;
    const { role, companyId } = req.user;
    const params = [];
    const conditions = [];

    // Supervisor solo ve su propia empresa
    if (role === 'client') {
      conditions.push(`c.id = $${params.push(companyId)}`);
    }
    if (active !== undefined) {
      conditions.push(`c.active = $${params.push(active === 'true')}`);
    }
    if (search) {
      conditions.push(`(c.name ILIKE $${params.push('%' + search + '%')} OR c.nit ILIKE $${params.push('%' + search + '%')})`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT c.*,
        COALESCE(json_agg(s ORDER BY s.name) FILTER (WHERE s.id IS NOT NULL), '[]') AS sucursales
       FROM companies c
       LEFT JOIN sucursales s ON s.company_id = c.id AND s.active = true
       ${where}
       GROUP BY c.id
       ORDER BY c.name`,
      params
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /companies
router.post('/', requireRole('admin'), async (req, res) => {
  const { name, nit, email, phone, address, active = true } = req.body;
  if (!name) return res.status(422).json({ error: 'name es requerido' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO companies (name, nit, email, phone, address, active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, nit || null, email || null, phone || null, address || null, active]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'NIT ya registrado' });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /companies/:id
router.get('/:id', requireAdminOrSupervisor, async (req, res) => {
  const { role, companyId } = req.user;
  const id = parseInt(req.params.id);
  if (role === 'client' && companyId !== id) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
        COALESCE(json_agg(s ORDER BY s.name) FILTER (WHERE s.id IS NOT NULL), '[]') AS sucursales
       FROM companies c
       LEFT JOIN sucursales s ON s.company_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /companies/:id
router.put('/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, nit, email, phone, address, active } = req.body;
  try {
    const fields = [];
    const params = [];
    if (name    !== undefined) fields.push(`name    = $${params.push(name)}`);
    if (nit     !== undefined) fields.push(`nit     = $${params.push(nit)}`);
    if (email   !== undefined) fields.push(`email   = $${params.push(email)}`);
    if (phone   !== undefined) fields.push(`phone   = $${params.push(phone)}`);
    if (address !== undefined) fields.push(`address = $${params.push(address)}`);
    if (active  !== undefined) fields.push(`active  = $${params.push(active)}`);
    if (!fields.length) return res.status(422).json({ error: 'No hay campos para actualizar' });

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE companies SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'NIT ya registrado' });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /companies/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows: users } = await pool.query(
      `SELECT id FROM users WHERE company_id = $1 AND active = true LIMIT 1`, [id]
    );
    if (users.length) return res.status(409).json({ error: 'No se puede eliminar: la empresa tiene usuarios activos' });

    await pool.query(`UPDATE companies SET active = false WHERE id = $1`, [id]);
    return res.json({ message: 'Empresa eliminada correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
