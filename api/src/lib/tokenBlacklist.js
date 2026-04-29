// Token blacklist en memoria. En producción reemplazar por Redis con TTL.
// Los tokens se invalidan en logout; se limpian al reiniciar el proceso.
export const tokenBlacklist = new Set();
