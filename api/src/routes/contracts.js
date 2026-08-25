import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

function parseDate(value, field) {
  if (!value || typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const e = new Error(`${field} debe ser una fecha valida (YYYY-MM-DD)`);
    e.status = 422;
    throw e;
  }
  return value;
}

function parseAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    const e = new Error('amount debe ser un numero >= 0');
    e.status = 422;
    throw e;
  }
  return n;
}

function parseProductIds(value) {
  if (!Array.isArray(value)) {
    const e = new Error('productIds debe ser un array');
    e.status = 422;
    throw e;
  }
  const ids = value.map(v => parseInt(v)).filter(v => Number.isInteger(v) && v > 0);
  return [...new Set(ids)];
}

// GET /contracts — lista con nombre de empresa y conteo de SKUs
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, comp.name AS company_name,
              COUNT(cp.product_id)::int AS product_count
         FROM contracts c
         JOIN companies comp ON comp.id = c.company_id
         LEFT JOIN contract_products cp ON cp.contract_id = c.id
        GROUP BY c.id, comp.name
        ORDER BY c.date_from DESC`
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /contracts/:id — detalle con lista de productos incluidos
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      `SELECT c.*, comp.name AS company_name
         FROM contracts c
         JOIN companies comp ON comp.id = c.company_id
        WHERE c.id = $1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Contrato no encontrado' });

    const { rows: products } = await pool.query(
      `SELECT p.id, p.sku, p.name
         FROM contract_products cp
         JOIN products p ON p.id = cp.product_id
        WHERE cp.contract_id = $1
        ORDER BY p.name`,
      [id]
    );

    return res.json({ ...rows[0], products });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /contracts
router.post('/', async (req, res) => {
  const { companyId, dateFrom, dateTo, amount, productIds } = req.body;
  const client = await pool.connect();
  try {
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return res.status(422).json({ error: 'companyId invalido' });
    }
    const from = parseDate(dateFrom, 'dateFrom');
    const to = parseDate(dateTo, 'dateTo');
    if (to < from) return res.status(422).json({ error: 'dateTo no puede ser anterior a dateFrom' });
    const amt = parseAmount(amount);
    const ids = parseProductIds(productIds);

    await client.query('BEGIN');

    const { rows: companyRows } = await client.query(`SELECT id FROM companies WHERE id = $1`, [companyId]);
    if (!companyRows[0]) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'companyId no existe' });
    }

    const { rows } = await client.query(
      `INSERT INTO contracts (company_id, date_from, date_to, amount)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [companyId, from, to, amt]
    );
    const contract = rows[0];

    for (const productId of ids) {
      await client.query(
        `INSERT INTO contract_products (contract_id, product_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [contract.id, productId]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ ...contract, productCount: ids.length });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// PUT /contracts/:id
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { companyId, dateFrom, dateTo, amount, active, productIds } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(`SELECT * FROM contracts WHERE id = $1 FOR UPDATE`, [id]);
    if (!existing[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    const fields = [];
    const params = [];
    if (companyId !== undefined) {
      if (!Number.isInteger(companyId) || companyId <= 0) {
        await client.query('ROLLBACK');
        return res.status(422).json({ error: 'companyId invalido' });
      }
      fields.push(`company_id = $${params.push(companyId)}`);
    }
    if (dateFrom !== undefined) fields.push(`date_from = $${params.push(parseDate(dateFrom, 'dateFrom'))}`);
    if (dateTo   !== undefined) fields.push(`date_to   = $${params.push(parseDate(dateTo, 'dateTo'))}`);
    if (amount   !== undefined) fields.push(`amount    = $${params.push(parseAmount(amount))}`);
    if (active   !== undefined) fields.push(`active    = $${params.push(!!active)}`);

    let contract = existing[0];
    if (fields.length) {
      params.push(id);
      const { rows: updated } = await client.query(
        `UPDATE contracts SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
      );
      contract = updated[0];
    }

    if (new Date(contract.date_to) < new Date(contract.date_from)) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'dateTo no puede ser anterior a dateFrom' });
    }

    if (productIds !== undefined) {
      const ids = parseProductIds(productIds);
      await client.query(`DELETE FROM contract_products WHERE contract_id = $1`, [id]);
      for (const productId of ids) {
        await client.query(
          `INSERT INTO contract_products (contract_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, productId]
        );
      }
    }

    await client.query('COMMIT');
    return res.json(contract);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// DELETE /contracts/:id
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { rowCount } = await pool.query(`DELETE FROM contracts WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ error: 'Contrato no encontrado' });
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
