import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /gran-categorias
router.get('/', async (req, res) => {
  const { active } = req.query;
  const params = [];
  const conditions = [];
  if (active !== undefined) conditions.push(`active = $${params.push(active === 'true')}`);
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  try {
    const { rows } = await pool.query(`SELECT * FROM gran_categorias ${where} ORDER BY name`, params);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /gran-categorias
router.post('/', requireRole('admin'), async (req, res) => {
  const { name, active = true } = req.body;
  if (!name) return res.status(422).json({ error: 'name es requerido' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO gran_categorias (name, active) VALUES ($1,$2) RETURNING *`,
      [name, active]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una gran categoría con ese nombre' });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /gran-categorias/:id
router.put('/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, active } = req.body;
  try {
    const fields = [];
    const params = [];
    if (name !== undefined) fields.push(`name   = $${params.push(name)}`);
    if (active !== undefined) fields.push(`active = $${params.push(active)}`);
    if (!fields.length) return res.status(422).json({ error: 'No hay campos para actualizar' });

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE gran_categorias SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`, params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Gran categoría no encontrada' });
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una gran categoría con ese nombre' });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /gran-categorias/:id/categories — subcategorias asignadas
router.get('/:id/categories', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `SELECT id, name FROM categories WHERE gran_categoria_id = $1 ORDER BY name`,
      [id]
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /gran-categorias/:id/categories — reemplaza el set de subcategorias asignadas
// body: { categoryIds: number[] }
router.put('/:id/categories', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { categoryIds } = req.body;
  if (!Array.isArray(categoryIds)) {
    return res.status(422).json({ error: 'categoryIds debe ser un array' });
  }
  const ids = [...new Set(categoryIds.map(Number))].filter(
    (n) => Number.isInteger(n) && n > 0
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: gcRows } = await client.query(`SELECT id FROM gran_categorias WHERE id = $1`, [id]);
    if (!gcRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Gran categoría no encontrada' });
    }
    await client.query(
      `UPDATE categories SET gran_categoria_id = NULL WHERE gran_categoria_id = $1`, [id]
    );
    if (ids.length) {
      await client.query(
        `UPDATE categories SET gran_categoria_id = $1 WHERE id = ANY($2::int[])`,
        [id, ids]
      );
    }
    await client.query('COMMIT');
    const { rows } = await pool.query(
      `SELECT id, name FROM categories WHERE gran_categoria_id = $1 ORDER BY name`, [id]
    );
    return res.json({ granCategoriaId: id, categories: rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// DELETE /gran-categorias/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `SELECT id FROM categories WHERE gran_categoria_id = $1 LIMIT 1`, [id]
    );
    if (rows.length) {
      return res.status(409).json({
        error: 'La gran categoría tiene subcategorías asociadas. Reasígnalas antes de eliminar.',
      });
    }
    const result = await pool.query(`DELETE FROM gran_categorias WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Gran categoría no encontrada' });
    }
    return res.json({ message: 'Gran categoría eliminada definitivamente' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
