// claimsPurge.js — Política de retención de adjuntos de reclamos.
// Los adjuntos iniciales (kind='initial', subidos por el cliente) se eliminan
// a los CLAIM_ATTACHMENT_TTL_DAYS días de creado el reclamo. Los adjuntos de
// cierre (kind='closure') se conservan siempre.

import pool from '../config/db.js';
import { deleteObject } from './storage.js';

export const CLAIM_ATTACHMENT_TTL_DAYS = 60;

export async function purgeExpiredClaimAttachments() {
  const { rows } = await pool.query(
    `SELECT a.id, a.file_url
       FROM claim_attachments a
       JOIN claims c ON c.id = a.claim_id
      WHERE a.kind = 'initial'
        AND a.deleted_at IS NULL
        AND c.created_at < NOW() - ($1 || ' days')::interval`,
    [String(CLAIM_ATTACHMENT_TTL_DAYS)]
  );

  let purged = 0;
  for (const att of rows) {
    try {
      await deleteObject(att.file_url);
      await pool.query(`UPDATE claim_attachments SET deleted_at = NOW() WHERE id = $1`, [att.id]);
      purged++;
    } catch (err) {
      console.warn(`[claims] No se pudo purgar el adjunto ${att.id}:`, err.message);
    }
  }
  return purged;
}

// Corre al arrancar y luego cada 6 horas.
export function scheduleClaimAttachmentPurge() {
  const run = () =>
    purgeExpiredClaimAttachments()
      .then(n => { if (n) console.log(`[claims] ${n} adjunto(s) vencido(s) eliminado(s)`); })
      .catch(err => console.error('[claims] Error en la purga de adjuntos:', err.message));
  run();
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref?.();
}
