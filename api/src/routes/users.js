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
  active, created_at, all_orders_access
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
  const { role: myRole, companyId: myCompanyId, clientRole: myClientRole, sucursalId: mySucursalId } = req.user;
  const { role, companyId, sucursalId, active, search } = req.query;

  const params = [];
  const conditions = [];

  // admin_empresa/administrador_contrato ven toda su empresa; supervisor
  // solo su propia sucursal (usuarios bajo su responsabilidad).
  if (myRole === 'client') {
    conditions.push(`u.company_id = $${params.push(myCompanyId)}`);
    if (myClientRole === 'supervisor') {
      conditions.push(`u.sucursal_id = $${params.push(mySucursalId ?? null)}`);
    }
  } else if (companyId) {
    conditions.push(`u.company_id = $${params.push(parseInt(companyId))}`);
  }

  if (role) conditions.push(`u.role = $${params.push(role)}`);
  // El supervisor ya queda acotado a su sucursal arriba; ignorar cualquier
  // intento de override via query para no permitirle salirse de su sede.
  if (sucursalId && myClientRole !== 'supervisor') {
    conditions.push(`u.sucursal_id = $${params.push(parseInt(sucursalId))}`);
  }
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
  const { role, companyId, sucursalId: mySucursalId, clientRole: myClientRole, id: myId } = req.user;
  const targetId = parseInt(req.params.id);

  try {
    const { rows } = await pool.query(
      `SELECT ${publicUserFields} FROM users WHERE id = $1`, [targetId]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Solo puede ver si es admin, su propia cuenta, administrador_contrato de la
    // misma empresa, o supervisor de la misma empresa Y sucursal (usuarios bajo su responsabilidad).
    const isSelf = myId === targetId;
    const isCompanyManagerSameCompany = role === 'client' &&
      user.company_id === companyId &&
      (myClientRole === 'administrador_contrato' ||
        (myClientRole === 'supervisor' && user.sucursal_id === mySucursalId));
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
  const { role: myRole, companyId: myCompanyId, clientRole: myClientRole, sucursalId: mySucursalId } = req.user;
  const {
    name, email, password, role, clientRole,
    companyId, sucursalId, branchId,
    contactName, phone, address, active = true, initials,
    allOrdersAccess = false,
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
    // El supervisor solo gestiona creadores de pedidos de su propia sucursal.
    if (myClientRole === 'supervisor') {
      if (clientRole && clientRole !== 'creador_pedidos') {
        return res.status(403).json({ error: 'El supervisor solo puede crear usuarios Creador de pedidos' });
      }
      if (sucursalId && parseInt(sucursalId) !== mySucursalId) {
        return res.status(403).json({ error: 'Solo puede crear usuarios de su propia sucursal' });
      }
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
          price_list_id, branch_id, contact_name, phone, address, initials, active,
          all_orders_access)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING ${publicUserFields}`,
      [
        name,
        email.toLowerCase().trim(),
        hash,
        role,
        role === 'client' ? clientRole || null : null,
        role === 'client' ? (companyId || myCompanyId) : null,
        role === 'client' ? (myClientRole === 'supervisor' ? mySucursalId : (sucursalId || null)) : null,
        // price_list_id siempre null en alta — se hereda en runtime via resolveOrderRouting
        null,
        (role === 'advisor' || role === 'delivery') ? branchId || null : null,
        contactName || null,
        phone || null,
        address || null,
        initials || null,
        active,
        role === 'advisor' ? !!allOrdersAccess : false,
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
  const { role: myRole, companyId: myCompanyId, clientRole: myClientRole, sucursalId: mySucursalId, id: myId } = req.user;
  const targetId = parseInt(req.params.id);

  // Verificar permisos
  const { rows: targetRows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [targetId]);
  const target = targetRows[0];
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

  const isSupervisor = myClientRole === 'supervisor';
  const isSelf = myId === targetId;
  const isCompanyManagerSameCompany = myRole === 'client' &&
    target.company_id === myCompanyId &&
    (myClientRole === 'administrador_contrato' || (isSupervisor && target.sucursal_id === mySucursalId));
  if (myRole !== 'admin' && !isSelf && !isCompanyManagerSameCompany) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const {
    name, email, password, clientRole, sucursalId,
    priceListId, branchId, contactName, phone, address, active,
    allOrdersAccess,
  } = req.body;

  // El supervisor no puede sacar al usuario de su sucursal ni cambiarle el rol
  // a algo distinto de creador_pedidos (solo gestiona creadores de su sede).
  if (isSupervisor && !isSelf) {
    if (clientRole !== undefined && clientRole !== 'creador_pedidos') {
      return res.status(403).json({ error: 'El supervisor solo puede gestionar usuarios Creador de pedidos' });
    }
    if (sucursalId !== undefined && parseInt(sucursalId) !== mySucursalId) {
      return res.status(403).json({ error: 'No puede asignar el usuario a otra sucursal' });
    }
  }

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
    if (allOrdersAccess !== undefined && myRole === 'admin') fields.push(`all_orders_access = $${params.push(!!allOrdersAccess)}`);
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
  const { id: myId, companyId: myCompanyId, role: myRole, clientRole: myClientRole, sucursalId: mySucursalId } = req.user;
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

    if (myRole === 'client') {
      if (target.company_id !== myCompanyId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No autorizado' });
      }
      // El supervisor solo elimina usuarios de su propia sucursal.
      if (myClientRole === 'supervisor' && target.sucursal_id !== mySucursalId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No autorizado' });
      }
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
