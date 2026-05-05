// storage.js — Adapter para Google Cloud Storage
// Reemplaza el almacenamiento en disco local; expone uploadBuffer / deleteObject.

import { Storage } from '@google-cloud/storage';
import path from 'path';
import { randomUUID } from 'crypto';

const BUCKET_NAME = process.env.GCS_BUCKET || 'papeleria-uploads';
const PUBLIC_BASE = `https://storage.googleapis.com/${BUCKET_NAME}`;

const storage = new Storage();
const bucket  = storage.bucket(BUCKET_NAME);

// Genera un nombre único: <prefix>/<timestamp>_<uuid8>.<ext>
function buildObjectName(originalName, prefix = '') {
  const ext = path.extname(originalName || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  const id  = `${Date.now()}_${randomUUID().slice(0, 8)}`;
  const safe = `${id}${ext}`;
  return prefix ? `${prefix.replace(/^\/|\/$/g, '')}/${safe}` : safe;
}

/**
 * Sube un buffer al bucket configurado y devuelve metadata pública.
 * @param {object} args
 * @param {Buffer} args.buffer
 * @param {string} args.originalName
 * @param {string} args.mimeType
 * @param {string} [args.prefix]      ej: "orders", "products"
 * @returns {Promise<{ objectName: string, url: string, size: number, mimeType: string }>}
 */
export async function uploadBuffer({ buffer, originalName, mimeType, prefix = '' }) {
  if (!buffer?.length) throw new Error('buffer vacío');
  const objectName = buildObjectName(originalName, prefix);
  const file = bucket.file(objectName);

  await file.save(buffer, {
    contentType: mimeType,
    resumable: false,
    metadata: {
      contentType: mimeType,
      cacheControl: 'public, max-age=3600',
    },
  });

  return {
    objectName,
    url:      `${PUBLIC_BASE}/${objectName}`,
    size:     buffer.length,
    mimeType,
  };
}

/**
 * Elimina un objeto del bucket dado su URL pública (no-op si no pertenece al bucket).
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function deleteObject(url) {
  if (!url || !url.startsWith(`${PUBLIC_BASE}/`)) return false;
  const objectName = url.slice(PUBLIC_BASE.length + 1);
  await bucket.file(objectName).delete({ ignoreNotFound: true });
  return true;
}

export const STORAGE_PUBLIC_BASE = PUBLIC_BASE;
export const STORAGE_BUCKET_NAME = BUCKET_NAME;
