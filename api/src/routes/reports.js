// reports.js — Generador dinamico de reportes (solo admin).
//
// El admin arma el reporte: elige el dataset, que columnas, rango de fechas
// DESDE/HASTA y cuantos registros. Cada dataset se define abajo con su FROM,
// su whitelist de columnas (key -> { header, sql, numFmt? }) y sus filtros
// permitidos. Nada de esto se interpola sin parametrizar.

import { Router } from 'express';
import pool from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildReportCsv, buildReportXlsx } from '../lib/reportExport.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const MONEY = '"$"#,##0';

// Helpers de filtro: reciben (valor, paramsArray) y devuelven el fragmento SQL.
const eqInt = (col) => (v, p) => `${col} = $${p.push(parseInt(v, 10))}`;
const eqText = (col) => (v, p) => `${col} = $${p.push(String(v))}`;
const eqBool = (col) => (v, p) => `${col} = $${p.push(v === 'true' || v === '1')}`;
const existsCategory = (v, p) => `EXISTS (
  SELECT 1 FROM order_items oi JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id = o.id AND p.category_id = $${p.push(parseInt(v, 10))})`;
const existsGranCategoria = (v, p) => `EXISTS (
  SELECT 1 FROM order_items oi JOIN products p ON p.id = oi.product_id
  JOIN categories c ON c.id = p.category_id
  WHERE oi.order_id = o.id AND c.gran_categoria_id = $${p.push(parseInt(v, 10))})`;

const DATASETS = {
  orders: {
    sheet: 'Pedidos',
    title: 'Reporte de pedidos',
    from: `FROM orders o
      JOIN users uc          ON uc.id = o.client_id
      LEFT JOIN companies c  ON c.id  = uc.company_id
      LEFT JOIN sucursales s ON s.id  = uc.sucursal_id
      LEFT JOIN users ua     ON ua.id = o.advisor_id
      LEFT JOIN users ud     ON ud.id = o.delivery_id`,
    dateColumn: 'o.created_at',
    columns: {
      id:           { header: 'ID',          sql: 'o.id' },
      status:       { header: 'Estado',      sql: 'o.status' },
      created_at:   { header: 'Fecha',       sql: `TO_CHAR(o.created_at, 'YYYY-MM-DD')` },
      delivered_at: { header: 'Entregado',   sql: `TO_CHAR(o.delivered_at, 'YYYY-MM-DD')` },
      company:      { header: 'Empresa',     sql: 'c.name' },
      sucursal:     { header: 'Sucursal',    sql: 's.name' },
      client:       { header: 'Cliente',     sql: 'uc.name' },
      advisor:      { header: 'Asesor',      sql: 'ua.name' },
      delivery:     { header: 'Repartidor',  sql: 'ud.name' },
      carrier:      { header: 'Transportadora', sql: 'o.carrier' },
      items_count:  { header: 'Items',       sql: '(SELECT COUNT(*) FROM order_items WHERE order_id = o.id)::int' },
      subtotal:     { header: 'Subtotal (COP)', sql: 'o.subtotal::float', numFmt: MONEY },
      iva:          { header: 'IVA (COP)',   sql: 'o.iva::float', numFmt: MONEY },
      iva_19:       { header: 'IVA 19% (COP)', sql: 'o.iva_19::float', numFmt: MONEY },
      iva_5:        { header: 'IVA 5% (COP)', sql: 'o.iva_5::float', numFmt: MONEY },
      iva_exento_base: { header: 'Base exenta (COP)', sql: 'o.iva_exento_base::float', numFmt: MONEY },
      total:        { header: 'Total (COP)', sql: 'o.total::float', numFmt: MONEY },
      notes:        { header: 'Notas',       sql: 'o.notes' },
    },
    filters: {
      status:         eqText('o.status'),
      advisorId:      eqInt('o.advisor_id'),
      companyId:      eqInt('uc.company_id'),
      sucursalId:     eqInt('uc.sucursal_id'),
      categoryId:     existsCategory,
      granCategoriaId: existsGranCategoria,
    },
  },

  order_items: {
    sheet: 'Items de pedido',
    title: 'Reporte de items de pedido',
    from: `FROM order_items oi
      JOIN orders o           ON o.id  = oi.order_id
      JOIN users uc           ON uc.id = o.client_id
      LEFT JOIN companies c   ON c.id  = uc.company_id
      LEFT JOIN sucursales s  ON s.id  = uc.sucursal_id
      LEFT JOIN products p    ON p.id  = oi.product_id
      LEFT JOIN categories cat ON cat.id = p.category_id
      LEFT JOIN gran_categorias gc ON gc.id = cat.gran_categoria_id`,
    dateColumn: 'o.created_at',
    columns: {
      order_id:       { header: 'Pedido',      sql: 'oi.order_id' },
      order_status:   { header: 'Estado pedido', sql: 'o.status' },
      order_date:     { header: 'Fecha pedido', sql: `TO_CHAR(o.created_at, 'YYYY-MM-DD')` },
      company:        { header: 'Empresa',     sql: 'c.name' },
      sucursal:       { header: 'Sucursal',    sql: 's.name' },
      sku:            { header: 'SKU',         sql: 'oi.sku' },
      product_name:   { header: 'Producto',    sql: 'oi.product_name' },
      category:       { header: 'Categoría',   sql: 'cat.name' },
      gran_categoria: { header: 'Gran categoría', sql: 'gc.name' },
      quantity:       { header: 'Cantidad',    sql: 'oi.quantity' },
      unit:           { header: 'Unidad',      sql: 'oi.unit' },
      iva_rate:       { header: 'IVA %',       sql: 'oi.iva_rate::float' },
      unit_price:     { header: 'P. Unit (COP)', sql: 'oi.unit_price::float', numFmt: MONEY },
      line_total:     { header: 'Total línea (COP)', sql: '(oi.unit_price * oi.quantity)::float', numFmt: MONEY },
    },
    filters: {
      status:         eqText('o.status'),
      advisorId:      eqInt('o.advisor_id'),
      companyId:      eqInt('uc.company_id'),
      sucursalId:     eqInt('uc.sucursal_id'),
      categoryId:     eqInt('p.category_id'),
      granCategoriaId: eqInt('cat.gran_categoria_id'),
    },
  },

  products: {
    sheet: 'Productos',
    title: 'Reporte de catálogo',
    from: `FROM products p
      LEFT JOIN categories cat ON cat.id = p.category_id
      LEFT JOIN gran_categorias gc ON gc.id = cat.gran_categoria_id`,
    dateColumn: 'p.created_at',
    columns: {
      sku:            { header: 'SKU',         sql: 'p.sku' },
      name:           { header: 'Nombre',      sql: 'p.name' },
      category:       { header: 'Categoría',   sql: 'cat.name' },
      gran_categoria: { header: 'Gran categoría', sql: 'gc.name' },
      unit:           { header: 'Unidad',      sql: 'p.unit' },
      price:          { header: 'Precio base (COP)', sql: 'p.base_price::float', numFmt: MONEY },
      iva_rate:       { header: 'IVA %',       sql: 'p.iva_rate::float' },
      stock:          { header: 'Stock',       sql: 'p.stock' },
      active:         { header: 'Activo',      sql: `CASE WHEN p.active THEN 'Sí' ELSE 'No' END` },
      created_at:     { header: 'Creado',      sql: `TO_CHAR(p.created_at, 'YYYY-MM-DD')` },
    },
    filters: {
      categoryId:     eqInt('p.category_id'),
      granCategoriaId: eqInt('cat.gran_categoria_id'),
      active:         eqBool('p.active'),
    },
  },

  users: {
    sheet: 'Usuarios',
    title: 'Reporte de usuarios',
    from: `FROM users u
      LEFT JOIN companies c  ON c.id = u.company_id
      LEFT JOIN sucursales s ON s.id = u.sucursal_id`,
    dateColumn: 'u.created_at',
    columns: {
      name:        { header: 'Nombre',    sql: 'u.name' },
      email:       { header: 'Email',     sql: 'u.email' },
      role:        { header: 'Rol',       sql: 'u.role' },
      client_role: { header: 'Sub-rol',   sql: 'u.client_role' },
      company:     { header: 'Empresa',   sql: 'c.name' },
      sucursal:    { header: 'Sucursal',  sql: 's.name' },
      active:      { header: 'Activo',    sql: `CASE WHEN u.active THEN 'Sí' ELSE 'No' END` },
      created_at:  { header: 'Creado',    sql: `TO_CHAR(u.created_at, 'YYYY-MM-DD')` },
    },
    filters: {
      role:       eqText('u.role'),
      companyId:  eqInt('u.company_id'),
      sucursalId: eqInt('u.sucursal_id'),
      active:     eqBool('u.active'),
    },
  },
};

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 50000;

// Construye { where, params, columns[] } comun a count y export.
function buildQuery(ds, query) {
  const params = [];
  const conds = [];

  for (const [key, fn] of Object.entries(ds.filters)) {
    const val = query[key];
    if (val !== undefined && val !== '' && val !== null) {
      conds.push(fn(val, params));
    }
  }

  if (query.dateFrom) conds.push(`${ds.dateColumn} >= $${params.push(query.dateFrom)}`);
  if (query.dateTo)   conds.push(`${ds.dateColumn} <= $${params.push(query.dateTo + ' 23:59:59')}`);

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  // Columnas: interseccion con la whitelist, preservando el orden del dataset.
  const requested = String(query.columns || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allKeys = Object.keys(ds.columns);
  const keys = requested.length
    ? allKeys.filter((k) => requested.includes(k))
    : allKeys;

  return { where, params, keys };
}

// GET /reports/:dataset
//   ?count=1                       -> { count: N }
//   ?format=xlsx|csv&columns=a,b   -> archivo
router.get('/:dataset', async (req, res) => {
  const ds = DATASETS[req.params.dataset];
  if (!ds) return res.status(422).json({ error: 'dataset desconocido' });

  const { where, params, keys } = buildQuery(ds, req.query);

  try {
    if (req.query.count === '1' || req.query.count === 'true') {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS count ${ds.from} ${where}`, params);
      return res.json({ count: rows[0].count });
    }

    if (keys.length === 0) {
      return res.status(422).json({ error: 'Selecciona al menos una columna' });
    }

    const format = (req.query.format || 'xlsx').toLowerCase();
    if (!['csv', 'xlsx'].includes(format)) {
      return res.status(422).json({ error: 'format debe ser csv o xlsx' });
    }

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
    limit = Math.min(MAX_LIMIT, limit);

    const select = keys.map((k) => `${ds.columns[k].sql} AS "${k}"`).join(', ');
    const { rows } = await pool.query(
      `SELECT ${select} ${ds.from} ${where} ORDER BY ${ds.dateColumn} DESC LIMIT $${params.push(limit)}`,
      params
    );

    const columns = keys.map((k) => ({
      key: k,
      header: ds.columns[k].header,
      numFmt: ds.columns[k].numFmt,
    }));

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `reporte_${req.params.dataset}_${stamp}.${format}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buildReportCsv({ rows, columns }));
    }

    const buf = await buildReportXlsx({ rows, columns, sheetName: ds.sheet, title: ds.title });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buf);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /reports  -> metadata para que el frontend arme el formulario
router.get('/', (_req, res) => {
  const meta = Object.fromEntries(
    Object.entries(DATASETS).map(([key, ds]) => [
      key,
      {
        label: ds.sheet,
        columns: Object.entries(ds.columns).map(([k, c]) => ({ key: k, header: c.header })),
        filters: Object.keys(ds.filters),
      },
    ])
  );
  res.json(meta);
});

export default router;
