import jwt from 'jsonwebtoken';

// Verifica el token JWT y adjunta el payload al request
export function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
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

// Verifica que sea admin O supervisor
export function requireAdminOrSupervisor(req, res, next) {
  const { role, clientRole } = req.user;
  if (role === 'admin' || (role === 'client' && clientRole === 'supervisor')) {
    return next();
  }
  return res.status(403).json({ error: 'Se requiere rol admin o supervisor' });
}
