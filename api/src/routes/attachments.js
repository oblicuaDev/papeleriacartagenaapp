import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// Montado en /orders/:orderId/attachments
const router = Router({ mergeParams: true });
router.use(requireAuth);

const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = process.env.STORAGE_LOCAL_PATH || '/var/www/papeleria-cartagena/uploads';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Tipo de archivo no permitido'));
    }
  },
});

const ALLOWED_ATTACH_TYPES = ['general', 'evidence', 'invoice', 'receipt'];

// POST /orders/:orderId/attachments
// PHASE 6:
//   - Acepta `type` en form-data (general | evidence | invoice | receipt).
//   - delivery solo puede subir 'evidence'.
//   - Devuelve `mimeType` y `type` (semantico) por separado.
router.post('/', requireRole('admin', 'advisor', 'delivery'), (req, res) => {
  const orderId = req.params.orderId.toUpperCase();
  const { role } = req.user;

  upload.single('file')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Archivo demasiado grande. Máximo 10 MB' });
      return res.status(415).json({ error: 'Tipo de archivo no permitido' });
    }
    if (err) return res.status(500).json({ error: 'Error al subir el archivo' });
    if (!req.file) return res.status(422).json({ error: 'file es requerido' });

    // Validar `type` despues de multer (multer pobla req.body con campos no-file)
    const attachType = (req.body.type || 'general').toLowerCase();
    if (!ALLOWED_ATTACH_TYPES.includes(attachType)) {
      return res.status(422).json({
        error: `type invalido. Permitidos: ${ALLOWED_ATTACH_TYPES.join(', ')}`,
      });
    }
    if (role === 'delivery' && attachType !== 'evidence') {
      return res.status(403).json({ error: 'delivery solo puede subir adjuntos tipo evidence' });
    }

    try {
      const { rows: orderRows } = await pool.query(`SELECT id FROM orders WHERE id = $1`, [orderId]);
      if (!orderRows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });

      const baseUrl = process.env.STORAGE_BASE_URL || 'http://localhost:3000/uploads';
      const fileUrl = `${baseUrl}/${req.file.filename}`;

      const { rows } = await pool.query(
        `INSERT INTO order_attachments
           (order_id, file_name, file_size, mime_type, file_url, type, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [orderId, req.file.originalname, req.file.size, req.file.mimetype, fileUrl, attachType, req.user.id]
      );

      const { rows: userRows } = await pool.query(`SELECT name FROM users WHERE id = $1`, [req.user.id]);

      return res.status(201).json({
        id:         rows[0].id,
        orderId:    rows[0].order_id,
        name:       rows[0].file_name,
        size:       rows[0].file_size,
        mimeType:   rows[0].mime_type,
        type:       rows[0].type,
        url:        rows[0].file_url,
        uploadedBy: userRows[0].name,
        uploadedAt: rows[0].uploaded_at,
      });
    } catch (dbErr) {
      console.error(dbErr);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  });
});

// GET /orders/:orderId/attachments/:attachmentId/download
router.get('/:attachmentId/download', async (req, res) => {
  const { role, id: myId, companyId } = req.user;
  const orderId      = req.params.orderId.toUpperCase();
  const attachmentId = parseInt(req.params.attachmentId);

  try {
    // Verificar acceso al pedido si es cliente
    if (role === 'client') {
      const { rows } = await pool.query(
        `SELECT o.client_id, u.company_id
         FROM orders o JOIN users u ON u.id = o.client_id
         WHERE o.id = $1`,
        [orderId]
      );
      if (!rows[0] || rows[0].company_id !== companyId) {
        return res.status(403).json({ error: 'No autorizado' });
      }
    }

    const { rows } = await pool.query(
      `SELECT * FROM order_attachments WHERE id = $1 AND order_id = $2`,
      [attachmentId, orderId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Adjunto no encontrado' });

    return res.json({ url: rows[0].file_url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /orders/:orderId/attachments/:attachmentId
router.delete('/:attachmentId', requireRole('admin', 'advisor'), async (req, res) => {
  const { id: myId, role } = req.user;
  const orderId      = req.params.orderId.toUpperCase();
  const attachmentId = parseInt(req.params.attachmentId);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM order_attachments WHERE id = $1 AND order_id = $2`,
      [attachmentId, orderId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Adjunto no encontrado' });

    if (role !== 'admin' && rows[0].uploaded_by !== myId) {
      return res.status(403).json({ error: 'Solo el autor o admin puede eliminar este adjunto' });
    }

    // Eliminar archivo físico si existe
    const localPath = process.env.STORAGE_LOCAL_PATH || '/var/www/papeleria-cartagena/uploads';
    const filename  = path.basename(rows[0].file_url);
    const filePath  = path.join(localPath, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query(`DELETE FROM order_attachments WHERE id = $1`, [attachmentId]);
    return res.json({ message: 'Adjunto eliminado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
