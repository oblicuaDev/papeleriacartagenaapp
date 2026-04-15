import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

// Montado en /orders/:orderId/comments
const router = Router({ mergeParams: true });
router.use(requireAuth);

// POST /orders/:orderId/comments
router.post('/', requireRole('admin', 'advisor'), async (req, res) => {
  const orderId  = req.params.orderId.toUpperCase();
  const authorId = req.user.id;
  const { text } = req.body;

  if (!text?.trim()) return res.status(422).json({ error: 'text es requerido' });

  try {
    const { rows: orderRows } = await pool.query(`SELECT id FROM orders WHERE id = $1`, [orderId]);
    if (!orderRows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });

    const { rows } = await pool.query(
      `INSERT INTO order_comments (order_id, author_id, text)
       VALUES ($1, $2, $3) RETURNING *`,
      [orderId, authorId, text.trim()]
    );
    const comment = rows[0];

    const { rows: authorRows } = await pool.query(
      `SELECT name, role FROM users WHERE id = $1`, [authorId]
    );

    return res.status(201).json({
      id:         comment.id,
      orderId:    comment.order_id,
      authorId:   comment.author_id,
      authorName: authorRows[0].name,
      authorRole: authorRows[0].role,
      text:       comment.text,
      createdAt:  comment.created_at,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /orders/:orderId/comments/:commentId
router.delete('/:commentId', requireRole('admin', 'advisor'), async (req, res) => {
  const orderId   = req.params.orderId.toUpperCase();
  const commentId = parseInt(req.params.commentId);
  const { id: myId, role } = req.user;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM order_comments WHERE id = $1 AND order_id = $2`,
      [commentId, orderId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Comentario no encontrado' });

    if (role !== 'admin' && rows[0].author_id !== myId) {
      return res.status(403).json({ error: 'Solo el autor o admin puede eliminar este comentario' });
    }

    await pool.query(`DELETE FROM order_comments WHERE id = $1`, [commentId]);
    return res.json({ message: 'Comentario eliminado' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
