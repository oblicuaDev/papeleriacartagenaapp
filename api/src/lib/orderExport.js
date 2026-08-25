// orderExport.js — Serializadores CSV / XLSX para listas de pedidos (PHASE 8)
//
// Recibe filas planas y produce el archivo. La construccion del SQL y el
// scope por rol vive en routes/stats.js para no duplicar la matriz de
// permisos.

import ExcelJS from 'exceljs';
import fs from 'fs';
import { LOGO_PATH } from './purchaseOrderPdf.js';
import { splitIva } from './iva.js';

const COMPANY_NAME = 'Papelería Cartagena';

// Inserta el logo en la esquina superior izquierda de la hoja.
// Devuelve el número de filas que ocupó el header (para empujar el contenido).
function embedHeaderLogo(wb, ws, { rowSpan = 4 } = {}) {
  if (!fs.existsSync(LOGO_PATH)) return 0;
  try {
    const ext = LOGO_PATH.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    const imageId = wb.addImage({ filename: LOGO_PATH, extension: ext });
    // Logo contenido en columna A (≈ 90px) para no invadir el merge del título.
    ws.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 88, height: 60 },
      editAs: 'oneCell',
    });
    // Columna A más ancha para dar espacio visual al logo.
    if ((ws.getColumn(1).width || 0) < 14) ws.getColumn(1).width = 14;
    for (let r = 1; r <= rowSpan; r++) {
      ws.getRow(r).height = 18;
    }
    return rowSpan;
  } catch (e) {
    console.warn('[orderExport] no se pudo embeber el logo:', e.message);
    return 0;
  }
}

export const ORDER_EXPORT_COLUMNS = [
  { header: 'ID',           key: 'id',         width: 14 },
  { header: 'Estado',       key: 'status',     width: 22 },
  { header: 'Fecha',        key: 'created_at', width: 12 },
  { header: 'Empresa',      key: 'company',    width: 30 },
  { header: 'Sucursal',     key: 'sucursal',   width: 22 },
  { header: 'Cliente',      key: 'client',     width: 25 },
  { header: 'Asesor',       key: 'advisor',    width: 25 },
  { header: 'Items',        key: 'items',      width: 8  },
  { header: 'Subtotal (COP)', key: 'subtotal', width: 15 },
  { header: 'IVA (COP)',    key: 'iva',        width: 13 },
  { header: 'Total (COP)',  key: 'total',      width: 14 },
];

function csvField(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function buildCsv(rows) {
  const headers = ORDER_EXPORT_COLUMNS.map(c => csvField(c.header)).join(',');
  const body = rows
    .map(r => ORDER_EXPORT_COLUMNS.map(c => csvField(r[c.key])).join(','))
    .join('\r\n');
  // BOM al inicio para que Excel detecte UTF-8 correctamente
  return '﻿' + headers + '\r\n' + body;
}

export async function buildXlsx(rows, sheetName = 'Pedidos') {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY_NAME;
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName);

  // Anchos sin auto-cabecera (no usamos ws.columns para controlar la fila inicial)
  ORDER_EXPORT_COLUMNS.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });

  // ── Branded header (logo + nombre + subtítulo) ────────────
  const logoRows = embedHeaderLogo(wb, ws, { rowSpan: 4 });

  ws.mergeCells('B1:I1');
  ws.getCell('B1').value = COMPANY_NAME;
  ws.getCell('B1').font = { bold: true, size: 16, color: { argb: 'FF1E40AF' } };
  ws.getCell('B1').alignment = { vertical: 'middle' };

  ws.mergeCells('B2:I2');
  ws.getCell('B2').value =
    `Listado de pedidos · Generado: ${new Date().toLocaleString('es-CO')}`;
  ws.getCell('B2').font = { size: 10, color: { argb: 'FF6B7280' } };

  // Fila de cabecera de la tabla (deja espacio para el logo)
  const tableHeaderRow = Math.max(logoRows, 2) + 2;

  const headerRow = ws.getRow(tableHeaderRow);
  ORDER_EXPORT_COLUMNS.forEach((c, i) => {
    headerRow.getCell(i + 1).value = c.header;
  });
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 22;

  // Datos
  const totalIdx    = ORDER_EXPORT_COLUMNS.findIndex(c => c.key === 'total') + 1;
  const subtotalIdx = ORDER_EXPORT_COLUMNS.findIndex(c => c.key === 'subtotal') + 1;
  const ivaIdx      = ORDER_EXPORT_COLUMNS.findIndex(c => c.key === 'iva') + 1;
  const itemsIdx    = ORDER_EXPORT_COLUMNS.findIndex(c => c.key === 'items') + 1;

  rows.forEach((r, i) => {
    const dataRow = ws.getRow(tableHeaderRow + 1 + i);
    ORDER_EXPORT_COLUMNS.forEach((c, j) => {
      dataRow.getCell(j + 1).value = r[c.key] ?? '';
    });
    dataRow.getCell(totalIdx).numFmt = '"$"#,##0';
    dataRow.getCell(totalIdx).alignment = { horizontal: 'right' };
    dataRow.getCell(subtotalIdx).numFmt = '"$"#,##0';
    dataRow.getCell(subtotalIdx).alignment = { horizontal: 'right' };
    dataRow.getCell(ivaIdx).numFmt = '"$"#,##0';
    dataRow.getCell(ivaIdx).alignment = { horizontal: 'right' };
    dataRow.getCell(itemsIdx).alignment = { horizontal: 'center' };
  });

  ws.views = [{ state: 'frozen', ySplit: tableHeaderRow }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Excel detallado de UN pedido: header + tabla de items + total.
 * @param {object} cfg
 * @param {object} cfg.order  fila de orders enriquecida con company/sucursal/client/advisor
 * @param {Array}  cfg.items  filas de order_items
 */
export async function buildOrderDetailXlsx({ order, items }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY_NAME;
  wb.created = new Date();
  const ws = wb.addWorksheet(`Pedido ${order.id}`);

  // ── Branded header con logo ───────────────────────────────
  const logoRows = embedHeaderLogo(wb, ws, { rowSpan: 4 });

  ws.mergeCells('B1:F1');
  ws.getCell('B1').value = COMPANY_NAME;
  ws.getCell('B1').font = { bold: true, size: 18, color: { argb: 'FF1E40AF' } };
  ws.getCell('B1').alignment = { vertical: 'middle' };

  ws.mergeCells('B2:F2');
  ws.getCell('B2').value = `ORDEN DE COMPRA — ${order.id}`;
  ws.getCell('B2').font = { bold: true, size: 13, color: { argb: 'FF111827' } };

  ws.mergeCells('B3:F3');
  ws.getCell('B3').value = `Generada: ${new Date().toLocaleString('es-CO')}`;
  ws.getCell('B3').font = { size: 10, color: { argb: 'FF6B7280' } };

  const meta = [
    ['Estado',     order.status],
    ['Fecha',      order.created_at_formatted || order.created_at],
    ['Empresa',    order.company_name || ''],
    ['NIT',        order.company_nit || ''],
    ['Sucursal',   order.sucursal_name ? `${order.sucursal_name}${order.sucursal_city ? ' - ' + order.sucursal_city : ''}` : ''],
    ['Solicitante',order.client_name || ''],
    ['Asesor',     order.advisor_name || ''],
  ];
  let row = Math.max(logoRows, 4) + 2;
  for (const [k, v] of meta) {
    ws.getCell(`A${row}`).value = k;
    ws.getCell(`A${row}`).font  = { bold: true };
    ws.mergeCells(`B${row}:F${row}`);
    ws.getCell(`B${row}`).value = v;
    row++;
  }

  if (order.notes) {
    row++;
    ws.getCell(`A${row}`).value = 'Notas';
    ws.getCell(`A${row}`).font  = { bold: true };
    ws.mergeCells(`B${row}:F${row}`);
    ws.getCell(`B${row}`).value = order.notes;
    ws.getCell(`B${row}`).alignment = { wrapText: true };
    row++;
  }

  // ── Tabla de items ────────────────────────────────────────
  row += 2;
  const headerRow = row;
  const headers = ['SKU', 'Producto', 'Cant', 'Unidad', 'P. Unit', 'Total línea'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.alignment = { horizontal: i >= 2 ? 'right' : 'left', vertical: 'middle' };
  });
  ws.getRow(headerRow).height = 22;
  row++;

  let total = 0;
  for (const it of items) {
    const subtotal = Number(it.unit_price) * Number(it.quantity);
    total += subtotal;
    ws.getRow(row).values = [
      it.sku,
      it.product_name,
      Number(it.quantity),
      it.unit,
      Number(it.unit_price),
      subtotal,
    ];
    ws.getCell(row, 5).numFmt = '"$"#,##0';
    ws.getCell(row, 6).numFmt = '"$"#,##0';
    ws.getCell(row, 3).alignment = { horizontal: 'right' };
    row++;
  }

  // ── Subtotal / IVA / Total ───────────────────────────────────
  const orderTotal = Number(order.total ?? total);
  const fallbackSplit = splitIva(orderTotal);
  const subtotalVal = order.subtotal != null ? Number(order.subtotal) : fallbackSplit.subtotal;
  const ivaVal = order.iva != null ? Number(order.iva) : fallbackSplit.iva;

  const totalsRows = [
    ['Subtotal', subtotalVal, false],
    ['IVA (19%)', ivaVal, false],
    ['TOTAL PEDIDO', orderTotal, true],
  ];
  for (const [label, value, bold] of totalsRows) {
    ws.mergeCells(`A${row}:E${row}`);
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font  = { bold };
    ws.getCell(`A${row}`).alignment = { horizontal: 'right' };
    ws.getCell(`F${row}`).value = value;
    ws.getCell(`F${row}`).font  = { bold };
    ws.getCell(`F${row}`).numFmt = '"$"#,##0';
    row++;
  }

  // ── Anchos ────────────────────────────────────────────────
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 40;
  ws.getColumn(3).width = 8;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 16;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
