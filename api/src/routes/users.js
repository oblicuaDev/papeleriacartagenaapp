import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import { requireAuth, requireRole, requireAdminOrSupervisor } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const BCRYPT_ROUNDS = 12;

const publicUserFields = `
  id, name, email, role, client_role, company_id, sucursal_id,
  branch_id, price_list_id, contact_name, phone, address, initials,
  active, created_at
`;

// GET /users
router.get('/', requireAdminOrSupervisor, async (req, res) => {
  const { role: myRole, companyId: myCompanyId } = req.user;
  const { role, companyId, sucursalId, active, search } = req.query;

  const params = [];
  const conditions = [];

  // Supervisor solo ve su empresa
  if (myRole === 'client') {
    conditions.push(`u.company_id = $${params.push(myCompanyId)}`);
  } else if (companyId) {
    conditions.push(`u.company_id = $${params.push(parseInt(companyId))}`);
  }

  if (role)       conditions.push(`u.role = $${params.push(role)}`);
  if (sucursalId) conditions.push(`u.sucursal_id = $${params.push(parseInt(sucursalId))}`);
  if (active !== undefined) conditions.push(`u.active = $${params.push(active === 'true')}`);
  if (search) {
    conditions.push(
      `(u.name ILIKE $${params.push('%' + search + '%')} OR u.email ILIKE $${params.push('%' + search + '%')})`
    );
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  try {
    const { rows } = await pool.query(
      `SELECT ${publicUserFields} FROM users u ${where} ORDER BY u.name`, params
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /users/:id
router.get('/:id', async (req, res) => {
  const { role, companyId, id: myId } = req.user;
  const targetId = parseInt(req.params.id);

  try {
    const { rows } = await pool.query(
      `SELECT ${publicUserFields} FROM users WHERE id = $1`, [targetId]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Solo puede ver si es admin, su propia cuenta, o supervisor de la misma empresa
    const isSelf = myId === targetId;
    const isSupervisorSameCompany = role === 'client' && req.user.clientRole === 'supervisor' && user.company_id === companyId;
    if (role !== 'admin' && !isSelf && !isSupervisorSameCompany) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /users
router.post('/', requireAdminOrSupervisor, async (req, res) => {
  const { role: myRole, companyId: myCompanyId, clientRole: myClientRole } = req.user;
  const {
    name, email, password, role, clientRole,
    companyId, sucursalId, priceListId, branchId,
    contactName, phone, address, active = true,
  } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(422).json({ error: 'name, email, password y role son requeridos' });
  }
  if (password.length < 6) {
    return res.status(422).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  // Supervisor solo puede crear clientes de su propia empresa
  if (myRole === 'client') {
    if (role !== 'client') return res.status(403).json({ error: 'No autorizado para crear este tipo de usuario' });
    if (companyId && parseInt(companyId) !== myCompanyId) {
      return res.status(403).json({ error: 'Solo puede crear usuarios de su empresa' });
    }
  }

  if (role === 'client' && !clientRole) {
    return res.status(422).json({ error: 'clientRole es requerido para usuarios tipo client' });
  }

  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { rows } = await pool.query(
      `INSERT INTO users
         (name, email, password_hash, role, client_role, company_id, sucursal_id,
          price_list_id, branch_id, contact_name, phone, address, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING ${publicUserFields}`,
      [
        name,
        email.toLowerCase().trim(),
        hash,
        role,
        role === 'client' ? clientRole || null : null,
        role === 'client' ? (companyId || myCompanyId) : null,
        role === 'client' ? sucursalId || null : null,
        role === 'client' ? priceListId || null : null,
        (role === 'advisor' || role === 'delivery') ? branchId || null : null,
        contactName || null,
        phone || null,
        address || null,
        active,
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El email ya está registrado' });
    if (err.code === '23514') return res.status(422).json({ error: 'Datos de usuario inválidos: ' + err.message });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /users/:id
router.put('/:id', async (req, res) => {
  const { role: myRole, companyId: myCompanyId, id: myId } = req.user;
  const targetId = parseInt(req.params.id);

  // Verificar permisos
  const { rows: targetRows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [targetId]);
  const target = targetRows[0];
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

  const isSelf = myId === targetId;
  const isSupervisorSameCompany = myRole === 'client' && req.user.clientRole === 'supervisor' && target.company_id === myCompanyId;
  if (myRole !== 'admin' && !isSelf && !isSupervisorSameCompany) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const {
    name, email, password, clientRole, sucursalId,
    priceListId, branchId, contactName, phone, address, active,
  } = req.body;

  try {
    const fields = [];
    const params = [];
    if (name        !== undefined) fields.push(`name          = $${params.push(name)}`);
    if (email       !== undefined) fields.push(`email         = $${params.push(email.toLowerCase().trim())}`);
    if (clientRole  !== undefined) fields.push(`client_role   = $${params.push(clientRole)}`);
    if (sucursalId  !== undefined) fields.push(`sucursal_id   = $${params.push(sucursalId)}`);
    if (priceListId !== undefined) fields.push(`price_list_id = $${params.push(priceListId)}`);
    if (branchId    !== undefined) fields.push(`branch_id     = $${params.push(branchId)}`);
    if (contactName !== undefined) fields.push(`contact_name  = $${params.push(contactName)}`);
    if (phone       !== undefined) fields.push(`phone         = $${params.push(phone)}`);
    if (address     !== undefined) fields.push(`address       = $${params.push(address)}`);
    if (active      !== undefined && myRole === 'admin') fields.push(`active = $${params.push(active)}`);
    if (password) {
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      fields.push(`password_hash = $${params.push(hash)}`);
    }
    if (!fields.length) return res.status(422).json({ error: 'No hay campos para actualizar' });

    params.push(targetId);
    const { rows } = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${params.length}
       RETURNING ${publicUserFields}`,
      params
    );
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El email ya está registrado' });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /users/:id
router.delete('/:id', requireAdminOrSupervisor, async (req, res) => {
  const { id: myId, companyId: myCompanyId, role: myRole } = req.user;
  const targetId = parseInt(req.params.id);

  if (myId === targetId) return res.status(409).json({ error: 'No se puede eliminar el propio usuario' });

  try {
    const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [targetId]);
    const target = rows[0];
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (myRole === 'client' && target.company_id !== myCompanyId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await pool.query(`UPDATE users SET active = false WHERE id = $1`, [targetId]);
    return res.json({ message: 'Usuario eliminado correctamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
