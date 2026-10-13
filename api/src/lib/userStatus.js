import pool from '../config/db.js';

// Estado activo/inactivo de los usuarios, consultado en cada petición
// autenticada para que un usuario desactivado pierda el acceso aunque su JWT
// siga vigente. Caché corta en memoria para no consultar la BD en cada request;
// al cambiar el estado se invalida explícitamente (invalidateUserStatus).
const TTL_MS = 30 * 1000;
const cache = new Map(); // userId -> { active, at }

export async function isUserActive(userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.active;

  const { rows } = await pool.query(`SELECT active FROM users WHERE id = $1`, [userId]);
  const active = rows[0]?.active === true; // usuario eliminado = sin acceso
  cache.set(userId, { active, at: Date.now() });
  return active;
}

export function invalidateUserStatus(userId) {
  cache.delete(userId);
}
