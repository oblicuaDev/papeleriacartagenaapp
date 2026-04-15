import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole, requireAdminOrSupervisor } from '../middleware/auth.js';

// Montado en /companies/:companyId/sucursales
const router = Router({ mergeParams: true });
router.use(requireAuth);

function canAccessCompany(req, res) {
  const { role, companyId } = req.user;
  const targetId = parseInt(req.params.companyId);
  if (role !== 'admin' && companyId !== targetId) {
    res.status(403).json({ error: 'No autorizado para esta empresa' });
    return false;
  }
  return true;
}

// GET /companies/:companyId/sucursales
router.get('/', requireAdminOrSupervisor, async (req, res) => {
  if (!canAccessCompany(req, res)) return;
  const companyId = parseInt(req.params.companyId);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM sucursales WHERE company_id = $1 ORDER BY name`, [companyId]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /companies/:companyId/sucursales
router.post('/', requireAdminOrSupervisor, async (req, res) => {
  if (!canAccessCompany(req, res)) return;
  const companyId = parseInt(req.params.companyId);
  const { name, city, address, active = true } = req.body;
  if (!name) return res.status(422).json({ error: 'name es requerido' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO sucursales (company_id, name, city, address, active)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [companyId, name, city || null, address || null, active]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /companies/:companyId/sucursales/:sucursalId
router.put('/:sucursalId', requireAdminOrSupervisor, async (req, res) => {
  if (!canAccessCompany(req, res)) return;
  const companyId   = parseInt(req.params.companyId);
  const sucursalId  = parseInt(req.params.sucursalId);
  const { name, city, address, active } = req.body;
  try {
    const fields = [];
    const params = [];
    if (name    !== undefined) fields.push(`name    = $${params.push(name)}`);
    if (city    !== undefined) fields.push(`city    = $${params.push(city)}`);
    if (address !== undefined) fields.push(`address = $${params.push(address)}`);
    if (active  !== undefined) fields.push(`active  = $${params.push(active)}`);
    if (!fields.length) return res.status(422).json({ error: 'No hay campos para actualizar' });

    params.push(sucursalId, companyId);
    const { rows } = await pool.query(
      `UPDATE sucursales SET ${fields.join(', ')}
       WHERE id = $${params.length - 1} AND company_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Sucursal no encontrada' });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /companies/:companyId/sucursales/:sucursalId
router.delete('/:sucursalId', requireAdminOrSupervisor, async (req, res) => {
  if (!canAccessCompany(req, res)) return;
  const companyId   = parseInt(req.params.companyId);
  const sucursalId  = parseInt(req.params.sucursalId);
  try {
    const { rows: users } = await pool.query(
      `SELECT id FROM users WHERE sucursal_id = $1 AND active = true LIMIT 1`, [sucursalId]
    );
    if (users.length) return res.status(409).json({ error: 'No se puede eliminar: la sucursal tiene usuarios asociados' });

    const { rowCount } = await pool.query(
      `UPDATE sucursales SET active = false WHERE id = $1 AND company_id = $2`,
      [sucursalId, companyId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Sucursal no encontrada' });
    return res.json({ message: 'Sucursal eliminada correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
