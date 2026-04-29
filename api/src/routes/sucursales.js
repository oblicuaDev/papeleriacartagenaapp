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

// PHASE 9: validacion de overrides
function httpError(status, message) {
  const e = new Error(message); e.status = status; return e;
}
async function assertAdvisorOrNull(advisorId) {
  if (advisorId === null || advisorId === undefined) return;
  const { rows } = await pool.query(`SELECT role, active FROM users WHERE id = $1`, [advisorId]);
  if (!rows[0])                  throw httpError(422, 'advisorId no existe');
  if (rows[0].role !== 'advisor') throw httpError(422, 'advisorId debe ser un usuario con role=advisor');
  if (!rows[0].active)           throw httpError(422, 'advisorId esta inactivo');
}
async function assertPriceListOrNull(priceListId) {
  if (priceListId === null || priceListId === undefined) return;
  const { rows } = await pool.query(`SELECT id FROM price_lists WHERE id = $1`, [priceListId]);
  if (!rows[0]) throw httpError(422, 'priceListId no existe');
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
  const { name, city, address, active = true, advisorId, priceListId } = req.body;
  if (!name) return res.status(422).json({ error: 'name es requerido' });

  // Solo admin puede setear overrides; supervisor los ignora
  const isAdmin = req.user.role === 'admin';
  const advisorOverride   = isAdmin ? (advisorId   ?? null) : null;
  const priceListOverride = isAdmin ? (priceListId ?? null) : null;

  try {
    if (isAdmin) {
      await assertAdvisorOrNull(advisorOverride);
      await assertPriceListOrNull(priceListOverride);
    }

    const { rows } = await pool.query(
      `INSERT INTO sucursales (company_id, name, city, address, active, advisor_id, price_list_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [companyId, name, city || null, address || null, active, advisorOverride, priceListOverride]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /companies/:companyId/sucursales/:sucursalId
router.put('/:sucursalId', requireAdminOrSupervisor, async (req, res) => {
  if (!canAccessCompany(req, res)) return;
  const companyId   = parseInt(req.params.companyId);
  const sucursalId  = parseInt(req.params.sucursalId);
  const { name, city, address, active, advisorId, priceListId } = req.body;
  const isAdmin = req.user.role === 'admin';

  try {
    if (isAdmin && advisorId   !== undefined) await assertAdvisorOrNull(advisorId);
    if (isAdmin && priceListId !== undefined) await assertPriceListOrNull(priceListId);

    const fields = [];
    const params = [];
    if (name    !== undefined) fields.push(`name    = $${params.push(name)}`);
    if (city    !== undefined) fields.push(`city    = $${params.push(city)}`);
    if (address !== undefined) fields.push(`address = $${params.push(address)}`);
    if (active  !== undefined) fields.push(`active  = $${params.push(active)}`);
    if (isAdmin && advisorId   !== undefined) fields.push(`advisor_id    = $${params.push(advisorId)}`);
    if (isAdmin && priceListId !== undefined) fields.push(`price_list_id = $${params.push(priceListId)}`);
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
    if (err.status) return res.status(err.status).json({ error: err.message });
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
