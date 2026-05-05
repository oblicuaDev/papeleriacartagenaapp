import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';
import { tokenBlacklist } from '../lib/tokenBlacklist.js';

const router = Router();

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(422).json({ error: 'email y password son requeridos' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, password_hash, role, client_role,
              company_id, sucursal_id, price_list_id, branch_id, initials, active
       FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const payload = {
      sub:        user.id,
      id:         user.id,
      email:      user.email,
      role:       user.role,
      clientRole: user.client_role,
      companyId:  user.company_id,
      sucursalId: user.sucursal_id,
      branchId:   user.branch_id,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

    return res.json({
      token,
      user: {
        id:          user.id,
        name:        user.name,
        email:       user.email,
        role:        user.role,
        clientRole:  user.client_role,
        companyId:   user.company_id,
        sucursalId:  user.sucursal_id,
        priceListId: user.price_list_id,
        branchId:    user.branch_id,
        initials:    user.initials,
      },
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /auth/logout
router.post('/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization'].slice(7);
  tokenBlacklist.add(token);
  return res.json({ message: 'Sesión cerrada correctamente' });
});

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, role, client_role, company_id,
              sucursal_id, price_list_id, branch_id, initials, active
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    return res.json({
      id:          user.id,
      name:        user.name,
      email:       user.email,
      role:        user.role,
      clientRole:  user.client_role,
      companyId:   user.company_id,
      sucursalId:  user.sucursal_id,
      priceListId: user.price_list_id,
      branchId:    user.branch_id,
      initials:    user.initials,
      active:      user.active,
    });
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
