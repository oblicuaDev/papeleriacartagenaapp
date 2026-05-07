import { Router } from 'express';
import multer from 'multer';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { resolvePriceListChain, priceSqlFragmentChain } from '../lib/pricing.js';
import { uploadBuffer, deleteObject } from '../lib/storage.js';

const router = Router();
router.use(requireAuth);

// ── Image upload (multer en memoria → GCS) ──────────────────
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const IMAGE_MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const uploadProductImage = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: IMAGE_MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Tipo de imagen no permitido'));
  },
});

// Resuelve la cadena de listas aplicable al request:
//   admin/advisor con ?priceListId  -> override explicito (lista unica)
//   client                          -> [sucursal, company, user] sin nulls
async function resolveChainForRequest(req) {
  const { role, id: userId, companyId } = req.user;
  const override =
    (role === 'admin' || role === 'advisor') ? req.query.priceListId : undefined;
  return resolvePriceListChain({ companyId, userId, override });
}

// GET /products
router.get('/', async (req, res) => {
  const { categoryId, active, search, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  // condParams indexa desde $1 y se reutiliza igual en la count query.
  // multiplier, limit y offset se appenden al final para no desplazar los índices WHERE.
  const condParams = [];
  const conditions = [];

  if (active !== undefined) conditions.push(`p.active = $${condParams.push(active === 'true')}`);
  if (categoryId) conditions.push(`p.category_id = $${condParams.push(parseInt(categoryId))}`);
  if (search) {
    const s = '%' + search + '%';
    conditions.push(
      `(p.name        ILIKE $${condParams.push(s)}
        OR p.sku       ILIKE $${condParams.push(s)}
        OR p.description ILIKE $${condParams.push(s)})`
    );
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const chain = await resolveChainForRequest(req);
    const priceListId = chain[0] || null;

    // Params: [...condParams, ...chain, limit, offset]
    const chainStart = condParams.length + 1;
    const listIdParams = chain.map((_, i) => `$${chainStart + i}`);
    const primaryListSqlValue = chain.length ? listIdParams[0] : 'NULL';
    const limitIdx  = condParams.length + chain.length + 1;
    const offsetIdx = condParams.length + chain.length + 2;
    const mainParams = [...condParams, ...chain, limitNum, offset];

    const { select: priceSelect, join: priceJoin } = priceSqlFragmentChain({
      alias: 'p',
      listIdParams,
    });

    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category_name,
         ${priceSelect} AS price,
         ${primaryListSqlValue}::int AS price_list_id,
         COALESCE(
           ARRAY(
             SELECT complementary_id FROM product_complementaries
             WHERE product_id = p.id
           ), '{}'
         ) AS complementary_ids
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ${priceJoin}
       ${where}
       ORDER BY p.name
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      mainParams
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM products p ${where}`, condParams
    );

    return res.json({
      data: rows,
      total: parseInt(countRows[0].count),
      page: pageNum,
      limit: limitNum,
      priceListId,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /products/:id
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const chain = await resolveChainForRequest(req);
    const priceListId = chain[0] || null;
    const listIdParams = chain.map((_, i) => `$${i + 1}`);
    const idParamIdx = chain.length + 1;
    const primaryListSqlValue = chain.length ? listIdParams[0] : 'NULL';

    const { select: priceSelect, join: priceJoin } = priceSqlFragmentChain({
      alias: 'p',
      listIdParams,
    });

    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category_name,
         ${priceSelect} AS price,
         ${primaryListSqlValue}::int AS price_list_id
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ${priceJoin}
       WHERE p.id = $${idParamIdx}`,
      [...chain, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });

    const compFrag = priceSqlFragmentChain({ alias: 'p2', listIdParams });
    const { rows: comps } = await pool.query(
      `SELECT p2.id, p2.name, p2.sku,
              ${compFrag.select} AS price
       FROM product_complementaries pc
       JOIN products p2 ON p2.id = pc.complementary_id
       ${compFrag.join}
       WHERE pc.product_id = $${idParamIdx} AND p2.active = true`,
      [...chain, id]
    );

    return res.json({ ...rows[0], complementaries: comps });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /products
router.post('/', requireRole('admin'), async (req, res) => {
  const { name, sku, categoryId, description, basePrice, stock = 0, unit, active = true, complementaryIds = [], imageUrl } = req.body;
  if (!name || !sku || !categoryId || typeof basePrice !== 'number' || basePrice < 0 || !unit) {
    return res.status(422).json({ error: 'name, sku, categoryId, basePrice (válido y >= 0) y unit son requeridos' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: catRows } = await client.query(`SELECT id FROM categories WHERE id = $1`, [categoryId]);
    if (!catRows[0]) return res.status(404).json({ error: 'Categoría no encontrada' });

    const { rows } = await client.query(
      `INSERT INTO products (name, sku, category_id, description, base_price, stock, unit, image_url, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, sku, categoryId, description || null, basePrice, stock, unit, imageUrl || null, active]
    );
    const product = rows[0];

    // Relaciones complementarias bidireccionales
    if (complementaryIds.length) {
      for (const cId of complementaryIds) {
        await client.query(
          `INSERT INTO product_complementaries (product_id, complementary_id) VALUES ($1,$2),($2,$1)
           ON CONFLICT DO NOTHING`,
          [product.id, cId]
        );
      }
    }

    await client.query('COMMIT');
    return res.status(201).json({ ...product, complementaryIds });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'SKU ya registrado' });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// PUT /products/:id
router.put('/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, categoryId, description, basePrice, stock, unit, active, complementaryIds, imageUrl } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const fields = [];
    const params = [];
    if (name !== undefined) fields.push(`name        = $${params.push(name)}`);
    if (categoryId !== undefined) fields.push(`category_id = $${params.push(categoryId)}`);
    if (description !== undefined) fields.push(`description = $${params.push(description)}`);
    if (basePrice !== undefined) fields.push(`base_price  = $${params.push(basePrice)}`);
    if (stock !== undefined) fields.push(`stock       = $${params.push(stock)}`);
    if (unit !== undefined) fields.push(`unit        = $${params.push(unit)}`);
    if (active !== undefined) fields.push(`active      = $${params.push(active)}`);
    if (imageUrl !== undefined) fields.push(`image_url   = $${params.push(imageUrl)}`);

    if (fields.length) {
      params.push(id);
      const { rows } = await client.query(
        `UPDATE products SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`, params
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Producto no encontrado' });
      }
    }

    // Actualizar complementarios si se envían
    if (complementaryIds !== undefined) {
      await client.query(`DELETE FROM product_complementaries WHERE product_id = $1 OR complementary_id = $1`, [id]);
      for (const cId of complementaryIds) {
        await client.query(
          `INSERT INTO product_complementaries (product_id, complementary_id) VALUES ($1,$2),($2,$1)
           ON CONFLICT DO NOTHING`,
          [id, cId]
        );
      }
    }

    await client.query('COMMIT');

    const { rows: updated } = await pool.query(`SELECT * FROM products WHERE id = $1`, [id]);
    return res.json(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// POST /products/:id/image — subir/reemplazar imagen del producto
router.post('/:id/image', requireRole('admin'), (req, res) => {
  const id = parseInt(req.params.id);
  uploadProductImage.single('image')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Imagen demasiado grande. Máximo 5 MB' });
      return res.status(415).json({ error: 'Tipo de imagen no permitido' });
    }
    if (err) return res.status(500).json({ error: 'Error al subir la imagen' });
    if (!req.file) return res.status(422).json({ error: 'image es requerido' });

    try {
      const { rows: prod } = await pool.query(`SELECT image_url FROM products WHERE id = $1`, [id]);
      if (!prod[0]) return res.status(404).json({ error: 'Producto no encontrado' });

      const { url: newUrl } = await uploadBuffer({
        buffer:       req.file.buffer,
        originalName: req.file.originalname,
        mimeType:     req.file.mimetype,
        prefix:       'products',
      });

      await pool.query(`UPDATE products SET image_url = $1 WHERE id = $2`, [newUrl, id]);

      // Borrar imagen anterior si vivía en nuestro bucket
      try { await deleteObject(prod[0].image_url); } catch (e) { console.warn('GCS delete:', e.message); }

      return res.json({ id, imageUrl: newUrl });
    } catch (dbErr) {
      console.error(dbErr);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  });
});

// DELETE /products/:id/image — quitar imagen del producto
router.delete('/:id/image', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(`SELECT image_url FROM products WHERE id = $1`, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });

    const oldUrl = rows[0].image_url;
    await pool.query(`UPDATE products SET image_url = NULL WHERE id = $1`, [id]);
    try { await deleteObject(oldUrl); } catch (e) { console.warn('GCS delete:', e.message); }
    return res.json({ id, imageUrl: null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /products/:id — hard delete con validacion estricta
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: prod } = await client.query(`SELECT image_url FROM products WHERE id = $1`, [id]);
    if (!prod[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // order_items.product_id es ON DELETE RESTRICT — no puede borrarse si aparece en pedidos
    const { rows: refs } = await client.query(
      `SELECT 1 FROM order_items WHERE product_id = $1 LIMIT 1`, [id]
    );
    if (refs.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'El producto aparece en pedidos. No puede eliminarse para preservar el historial.',
      });
    }

    // product_complementaries y price_list_items son ON DELETE CASCADE
    await client.query(`DELETE FROM products WHERE id = $1`, [id]);
    await client.query('COMMIT');

    // Limpieza best-effort de la imagen en GCS
    if (prod[0].image_url) {
      try { await deleteObject(prod[0].image_url); } catch (e) { console.warn('GCS delete:', e.message); }
    }
    return res.json({ message: 'Producto eliminado definitivamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') {
      return res.status(409).json({ error: 'El producto tiene registros vinculados en el sistema' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

export default router;
