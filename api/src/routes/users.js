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
// Permitido para admin, supervisor/admin_empresa (limitado a su empresa)
// y advisor (necesita listar repartidores y clientes para gestionar pedidos).
router.get('/', (req, res, next) => {
  const { role, clientRole } = req.user;
  if (role === 'admin' || role === 'advisor') return next();
  if (role === 'client' && (clientRole === 'supervisor' || clientRole === 'admin_empresa' || clientRole === 'administrador_contrato')) return next();
  return res.status(403).json({ error: 'No autorizado' });
}, async (req, res) => {
  const { role: myRole, companyId: myCompanyId } = req.user;
  const { role, companyId, sucursalId, active, search } = req.query;

  const params = [];
  const conditions = [];

  // Supervisor/admin_empresa solo ve su empresa
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

    // Solo puede ver si es admin, su propia cuenta, o supervisor/administrador_contrato de la misma empresa
    const isSelf = myId === targetId;
    const isCompanyManagerSameCompany = role === 'client' &&
      (req.user.clientRole === 'supervisor' || req.user.clientRole === 'administrador_contrato') &&
      user.company_id === companyId;
    if (role !== 'admin' && !isSelf && !isCompanyManagerSameCompany) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /users
// Para clients la lista de precios NO se solicita: se hereda automaticamente
// de sucursal > company en el momento del pedido (resolveOrderRouting).
router.post('/', requireAdminOrSupervisor, async (req, res) => {
  const { role: myRole, companyId: myCompanyId } = req.user;
  const {
    name, email, password, role, clientRole,
    companyId, sucursalId, branchId,
    contactName, phone, address, active = true, initials,
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
          price_list_id, branch_id, contact_name, phone, address, initials, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING ${publicUserFields}`,
      [
        name,
        email.toLowerCase().trim(),
        hash,
        role,
        role === 'client' ? clientRole || null : null,
        role === 'client' ? (companyId || myCompanyId) : null,
        role === 'client' ? sucursalId || null : null,
        // price_list_id siempre null en alta — se hereda en runtime via resolveOrderRouting
        null,
        (role === 'advisor' || role === 'delivery') ? branchId || null : null,
        contactName || null,
        phone || null,
        address || null,
        initials || null,
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
  const isCompanyManagerSameCompany = myRole === 'client' &&
    (req.user.clientRole === 'supervisor' || req.user.clientRole === 'administrador_contrato') &&
    target.company_id === myCompanyId;
  if (myRole !== 'admin' && !isSelf && !isCompanyManagerSameCompany) {
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

// DELETE /users/:id — hard delete con validacion de dependencias
router.delete('/:id', requireAdminOrSupervisor, async (req, res) => {
  const { id: myId, companyId: myCompanyId, role: myRole } = req.user;
  const targetId = parseInt(req.params.id);

  if (myId === targetId) return res.status(409).json({ error: 'No se puede eliminar el propio usuario' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [targetId]);
    const target = rows[0];
    if (!target) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (myRole === 'client' && target.company_id !== myCompanyId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Dependencias bloqueantes (orders.client_id tiene ON DELETE RESTRICT)
    const { rows: clientOrders } = await client.query(
      `SELECT id FROM orders WHERE client_id = $1 LIMIT 1`, [targetId]
    );
    if (clientOrders.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'El usuario tiene pedidos creados. No puede eliminarse para preservar el historial.',
      });
    }

    // companies.advisor_id, sucursales.advisor_id, orders.advisor_id, orders.delivery_id, orders.delivered_by
    // tienen ON DELETE SET NULL → se limpian automaticamente.
    // order_status_log.changed_by tambien es SET NULL.

    await client.query(`DELETE FROM users WHERE id = $1`, [targetId]);
    await client.query('COMMIT');
    return res.json({ message: 'Usuario eliminado definitivamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar: el usuario tiene registros vinculados en el sistema',
      });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

export default router;
