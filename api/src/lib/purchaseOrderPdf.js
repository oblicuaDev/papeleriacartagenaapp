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
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
import { uploadBuffer } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ruta absoluta al logo embebido en los exports.
// LOGO_PATH (env) puede sobre-escribirla; por defecto vive en api/assets/.
export const LOGO_PATH =
  process.env.LOGO_PATH ||
  path.resolve(__dirname, '../../assets/logo-cartagena.jpg');

const COMPANY_NAME = 'Papelería Cartagena';
const COMPANY_TAGLINE = 'Suministros de papelería y oficina';

function formatCOP(amount) {
  if (amount == null || isNaN(amount)) return '$0';
  return '$' + Math.round(Number(amount)).toLocaleString('es-CO');
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// Carga toda la data necesaria para el PDF/Excel en una sola pasada.
// Exportada para que otros generadores (Excel detallado) reusen la query.
export async function loadOrderContext(orderId, db = pool) {
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

// Construye el PDF en memoria y devuelve un Buffer.
// Exportado para que el endpoint GET /orders/:id/purchase-order.pdf
// pueda regenerar historicos contra el template actual sin depender
// del archivo guardado en storage.
export function renderPdfBuffer({ order, items }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // ── Header con logo + nombre empresa ─────────────────────
    const headerTop = doc.y;
    let logoEmbedded = false;
    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, 50, headerTop, { fit: [70, 50] });
        logoEmbedded = true;
      }
    } catch (e) {
      // Si el logo falla, seguimos sin él para no romper el PDF.
      console.warn('[purchaseOrderPdf] no se pudo embeber el logo:', e.message);
    }

    const titleX = logoEmbedded ? 130 : 50;
    const titleW = 562 - titleX;
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1E40AF')
      .text(COMPANY_NAME, titleX, headerTop + 4, { width: titleW });
    doc.font('Helvetica').fontSize(9).fillColor('#666666')
      .text(COMPANY_TAGLINE, titleX, doc.y, { width: titleW });
    doc.fillColor('#000000');

    // Línea separadora bajo el header
    const headerBottom = headerTop + 60;
    doc.moveTo(50, headerBottom).lineTo(562, headerBottom)
      .strokeColor('#1E40AF').lineWidth(1.2).stroke();
    doc.lineWidth(1).strokeColor('#000000');
    doc.y = headerBottom + 12;

    // ── Título del documento ─────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(18)
      .text('ORDEN DE COMPRA', { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(12)
      .text(order.id, { align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).fillColor('#666666')
      .text(`Generada: ${formatDate(new Date())}`, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(1.2);

    // ── Bloque cliente ──────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(11).text('CLIENTE');
    doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10);
    if (order.company_name) doc.text(`Empresa: ${order.company_name}`);
    if (order.company_nit) doc.text(`NIT: ${order.company_nit}`);
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
    const colW = { sku: 70, name: 220, qty: 40, price: 70, total: 70 };

    let y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('SKU', colX.sku, y, { width: colW.sku });
    doc.text('Producto', colX.name, y, { width: colW.name });
    doc.text('Cant', colX.qty, y, { width: colW.qty, align: 'right' });
    doc.text('P. Unit', colX.price, y, { width: colW.price, align: 'right' });
    doc.text('Subtotal', colX.total, y, { width: colW.total, align: 'right' });
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

      doc.text(it.sku ?? '', colX.sku, y, { width: colW.sku });
      doc.text(it.product_name, colX.name, y, { width: colW.name });
      doc.text(String(it.quantity), colX.qty, y, { width: colW.qty, align: 'right' });
      doc.text(formatCOP(it.unit_price), colX.price, y, { width: colW.price, align: 'right' });
      doc.text(formatCOP(subtotal), colX.total, y, { width: colW.total, align: 'right' });

      // Avanzar segun la altura del nombre (puede ocupar varias lineas)
      const lineCount = Math.max(1, Math.ceil(doc.widthOfString(it.product_name) / colW.name));
      y += 14 * lineCount;
    }

    // ── Total ───────────────────────────────────────────────
    y += 8;
    doc.moveTo(360, y).lineTo(562, y).strokeColor('#000000').stroke();
    y += 6;
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('TOTAL', 360, y, { width: 100, align: 'right' });
    doc.text(formatCOP(order.total ?? computedTotal), colX.total, y, { width: colW.total, align: 'right' });
    y += 20;

    // ── Notas ───────────────────────────────────────────────
    // ── Notas ───────────────────────────────────────────────
    if (order.notes) {
      y += 20;

      // Reiniciar posicion X/Y correctamente
      doc.x = 50;
      doc.y = y;

      doc.font('Helvetica-Bold')
        .fontSize(11)
        .text('OBSERVACIONES', 50, y);

      y = doc.y + 2;

      doc.moveTo(50, y)
        .lineTo(562, y)
        .strokeColor('#cccccc')
        .stroke();

      y += 8;

      doc.font('Helvetica')
        .fontSize(10)
        .fillColor('#000000')
        .text(order.notes, 50, y, {
          width: 512,
          align: 'left'
        });

      y = doc.y;
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
  const safeId = orderId.replace(/[^a-z0-9_-]/gi, '_');
  const fileName = `orden_compra_${safeId}_${Date.now()}.pdf`;

  const buffer = await renderPdfBuffer({ order, items });
  const { url: fileUrl, size } = await uploadBuffer({
    buffer,
    originalName: fileName,
    mimeType: 'application/pdf',
    prefix: `orders/${orderId}`,
  });

  const { rows } = await db.query(
    `INSERT INTO order_attachments
       (order_id, file_name, file_size, mime_type, file_url, type, uploaded_by)
     VALUES ($1, $2, $3, 'application/pdf', $4, 'purchase_order', $5)
     RETURNING id`,
    [orderId, `Orden de compra ${orderId}.pdf`, size, fileUrl, generatedBy]
  );

  return { created: true, attachmentId: rows[0].id, fileUrl };
}
