import jwt from 'jsonwebtoken';
import { tokenBlacklist } from '../lib/tokenBlacklist.js';
import { isUserActive } from '../lib/userStatus.js';

// Verifica el token JWT y adjunta el payload al request.
// Además exige que la cuenta siga activa: un usuario desactivado pierde el
// acceso de inmediato aunque su token no haya expirado.
export async function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = header.slice(7);
  if (tokenBlacklist.has(token)) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  try {
    if (!(await isUserActive(payload.id))) {
      return res.status(401).json({
        error: 'Tu cuenta fue desactivada. Comunícate con el administrador.',
        code: 'ACCOUNT_DISABLED',
      });
    }
  } catch (err) {
    console.error('requireAuth: no se pudo validar el estado del usuario', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
  req.user = payload;
  next();
}

// Restringe el acceso a roles específicos
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No autorizado para este recurso' });
    }
    next();
  };
}

// Verifica que sea admin O supervisor O admin_empresa
export function requireAdminOrSupervisor(req, res, next) {
  const { role, clientRole } = req.user;
  if (role === 'admin') return next();
  if (role === 'client' && (clientRole === 'supervisor' || clientRole === 'admin_empresa' || clientRole === 'administrador_contrato')) {
    return next();
  }
  return res.status(403).json({ error: 'Se requiere rol admin, supervisor, admin_empresa o administrador_contrato' });
}
