// purchaseOrderPdf.js — Generador de Orden de Compra (PDF) para PHASE 7
//
// Se invoca cuando un pedido transiciona a 'Pendiente' (aprobado) y persiste
// el resultado como un order_attachments con type='purchase_order'.
//
// La generacion del PDF y el INSERT del adjunto se hacen DESPUES del COMMIT
// del UPDATE de status, asi que un fallo aqui no rompe la aprobacion del
// pedido, solo deja un warning.

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import pool from '../config/db.js';

const STORAGE_DIR  = process.env.STORAGE_LOCAL_PATH || '/var/www/papeleria-cartagena/uploads';
const STORAGE_URL  = process.env.STORAGE_BASE_URL   || 'http://localhost:3000/uploads';

function formatCOP(amount) {
  if (amount == null || isNaN(amount)) return '$0';
  return '$' + Math.round(Number(amount)).toLocaleString('es-CO');
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// Carga toda la data necesaria para el PDF en una sola pasada.
async function loadOrderContext(orderId, db = pool) {
  const { rows: orderRows } = await db.query(
    `SELECT o.*,
            uc.name        AS client_name,
            uc.email       AS client_email,
            uc.phone       AS client_phone,
            uc.contact_name AS client_contact,
            ua.name        AS advisor_name,
            c.name         AS company_name,
            c.nit          AS company_nit,
            c.email        AS company_email,
            c.phone        AS company_phone,
            c.address      AS company_address,
            s.name         AS sucursal_name,
            s.city         AS sucursal_city,
            s.address      AS sucursal_address
       FROM orders o
       JOIN users uc           ON uc.id = o.client_id
       LEFT JOIN users ua      ON ua.id = o.advisor_id
       LEFT JOIN companies c   ON c.id  = uc.company_id
       LEFT JOIN sucursales s  ON s.id  = uc.sucursal_id
      WHERE o.id = $1`,
    [orderId]
  );
  if (!orderRows[0]) throw new Error(`Pedido ${orderId} no encontrado`);

  const { rows: items } = await db.query(
    `SELECT product_name, sku, quantity, unit_price, unit
       FROM order_items
      WHERE order_id = $1
      ORDER BY id`,
    [orderId]
  );

  return { order: orderRows[0], items };
}

// Construye el PDF y lo escribe en disco. Promesa resuelve con metadata.
function renderPdf({ order, items, outputPath }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    stream.on('error', reject);
    stream.on('finish', () => resolve());
    doc.pipe(stream);

    // ── Header ───────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(20)
       .text('ORDEN DE COMPRA', { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(12)
       .text(order.id, { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9)
       .text(`Generada: ${formatDate(new Date())}`, { align: 'center' });
    doc.moveDown(1.5);

    // ── Bloque cliente ──────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(11).text('CLIENTE');
    doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    if (order.company_name) doc.text(`Empresa: ${order.company_name}`);
    if (order.company_nit)  doc.text(`NIT: ${order.company_nit}`);
    if (order.sucursal_name) {
      const loc = [order.sucursal_name, order.sucursal_city].filter(Boolean).join(' - ');
      doc.text(`Sucursal: ${loc}`);
    }
    if (order.sucursal_address) doc.text(`Direccion: ${order.sucursal_address}`);
    doc.text(`Solicitante: ${order.client_name}`);
    if (order.client_email) doc.text(`Email: ${order.client_email}`);
    if (order.client_phone) doc.text(`Telefono: ${order.client_phone}`);
    doc.moveDown(1);

    // ── Bloque pedido ───────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(11).text('DETALLES DEL PEDIDO');
    doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    doc.text(`Fecha de creacion: ${formatDate(order.created_at)}`);
    doc.text(`Estado: ${order.status}`);
    if (order.advisor_name) doc.text(`Asesor: ${order.advisor_name}`);
    doc.moveDown(1);

    // ── Items table ─────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(11).text('PRODUCTOS');
    doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.3);

    const colX = { sku: 50, name: 130, qty: 360, price: 410, total: 490 };
    const colW = { sku: 70,  name: 220, qty: 40,  price: 70,  total: 70  };

    let y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('SKU',       colX.sku,   y, { width: colW.sku });
    doc.text('Producto',  colX.name,  y, { width: colW.name });
    doc.text('Cant',      colX.qty,   y, { width: colW.qty,   align: 'right' });
    doc.text('P. Unit',   colX.price, y, { width: colW.price, align: 'right' });
    doc.text('Subtotal',  colX.total, y, { width: colW.total, align: 'right' });
    y += 14;
    doc.moveTo(50, y).lineTo(562, y).strokeColor('#999999').stroke();
    y += 4;

    doc.font('Helvetica').fontSize(9);
    let computedTotal = 0;
    for (const it of items) {
      const subtotal = Number(it.unit_price) * Number(it.quantity);
      computedTotal += subtotal;

      // Saltar de pagina si quedamos sin espacio
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      doc.text(it.sku ?? '',      colX.sku,   y, { width: colW.sku });
      doc.text(it.product_name,   colX.name,  y, { width: colW.name });
      doc.text(String(it.quantity), colX.qty,   y, { width: colW.qty,   align: 'right' });
      doc.text(formatCOP(it.unit_price), colX.price, y, { width: colW.price, align: 'right' });
      doc.text(formatCOP(subtotal),      colX.total, y, { width: colW.total, align: 'right' });

      // Avanzar segun la altura del nombre (puede ocupar varias lineas)
      const lineCount = Math.max(1, Math.ceil(doc.widthOfString(it.product_name) / colW.name));
      y += 14 * lineCount;
    }

    // ── Total ───────────────────────────────────────────────
    y += 8;
    doc.moveTo(360, y).lineTo(562, y).strokeColor('#000000').stroke();
    y += 6;
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('TOTAL',                      colX.price - 10, y, { width: 80, align: 'right' });
    doc.text(formatCOP(order.total ?? computedTotal), colX.total, y, { width: colW.total, align: 'right' });
    y += 20;

    // ── Notas ───────────────────────────────────────────────
    if (order.notes) {
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(11).text('OBSERVACIONES');
      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#cccccc').stroke();
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).text(order.notes, { width: 512 });
    }

    // ── Footer ──────────────────────────────────────────────
    doc.font('Helvetica').fontSize(8).fillColor('#888888');
    doc.text(`Documento generado automaticamente por Papeleria Cartagena`,
             50, 760, { width: 512, align: 'center' });

    doc.end();
  });
}

/**
 * Genera el PDF de la orden de compra y lo registra como adjunto.
 * Idempotente: si ya existe un adjunto purchase_order para el pedido, no hace nada.
 *
 * @returns {Promise<{ created: boolean, attachmentId?: number, fileUrl?: string }>}
 */
export async function ensurePurchaseOrderPdf(orderId, generatedBy, db = pool) {
  // Idempotencia: si ya existe un PDF de orden de compra, no regeneramos
  const { rows: existing } = await db.query(
    `SELECT id, file_url FROM order_attachments
     WHERE order_id = $1 AND type = 'purchase_order'
     LIMIT 1`,
    [orderId]
  );
  if (existing[0]) {
    return { created: false, attachmentId: existing[0].id, fileUrl: existing[0].file_url };
  }

  const { order, items } = await loadOrderContext(orderId, db);

  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const safeId   = orderId.replace(/[^a-z0-9_-]/gi, '_');
  const filename = `orden_compra_${safeId}_${Date.now()}.pdf`;
  const filePath = path.join(STORAGE_DIR, filename);

  await renderPdf({ order, items, outputPath: filePath });
  const stat = fs.statSync(filePath);

  const fileUrl = `${STORAGE_URL}/${filename}`;
  const { rows } = await db.query(
    `INSERT INTO order_attachments
       (order_id, file_name, file_size, mime_type, file_url, type, uploaded_by)
     VALUES ($1, $2, $3, 'application/pdf', $4, 'purchase_order', $5)
     RETURNING id`,
    [orderId, `Orden de compra ${orderId}.pdf`, stat.size, fileUrl, generatedBy]
  );

  return { created: true, attachmentId: rows[0].id, fileUrl };
}
