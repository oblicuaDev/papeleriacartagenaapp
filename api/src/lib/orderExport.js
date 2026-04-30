// orderExport.js — Serializadores CSV / XLSX para listas de pedidos (PHASE 8)
//
// Recibe filas planas y produce el archivo. La construccion del SQL y el
// scope por rol vive en routes/stats.js para no duplicar la matriz de
// permisos.

import ExcelJS from 'exceljs';

export const ORDER_EXPORT_COLUMNS = [
  { header: 'ID',         key: 'id',         width: 14 },
  { header: 'Estado',     key: 'status',     width: 22 },
  { header: 'Fecha',      key: 'created_at', width: 12 },
  { header: 'Empresa',    key: 'company',    width: 30 },
  { header: 'Sucursal',   key: 'sucursal',   width: 22 },
  { header: 'Cliente',    key: 'client',     width: 25 },
  { header: 'Asesor',     key: 'advisor',    width: 25 },
  { header: 'Items',      key: 'items',      width: 8  },
  { header: 'Total (COP)',key: 'total',      width: 14 },
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
  wb.creator = 'Papeleria Cartagena';
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName);
  ws.columns = ORDER_EXPORT_COLUMNS;

  for (const r of rows) ws.addRow(r);

  // Header style
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  header.height = 22;

  // Total como numero con formato moneda
  const totalCol = ws.getColumn('total');
  totalCol.numFmt = '"$"#,##0';
  totalCol.alignment = { horizontal: 'right' };

  ws.getColumn('items').alignment = { horizontal: 'center' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

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
  wb.creator = 'Papeleria Cartagena';
  wb.created = new Date();
  const ws = wb.addWorksheet(`Pedido ${order.id}`);

  // ── Header bloque ─────────────────────────────────────────
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = `ORDEN DE COMPRA — ${order.id}`;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  const meta = [
    ['Estado',     order.status],
    ['Fecha',      order.created_at_formatted || order.created_at],
    ['Empresa',    order.company_name || ''],
    ['NIT',        order.company_nit || ''],
    ['Sucursal',   order.sucursal_name ? `${order.sucursal_name}${order.sucursal_city ? ' - ' + order.sucursal_city : ''}` : ''],
    ['Solicitante',order.client_name || ''],
    ['Asesor',     order.advisor_name || ''],
  ];
  let row = 3;
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
  const headers = ['SKU', 'Producto', 'Cant', 'Unidad', 'P. Unit', 'Subtotal'];
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

  // ── Total ─────────────────────────────────────────────────
  ws.mergeCells(`A${row}:E${row}`);
  ws.getCell(`A${row}`).value = 'TOTAL';
  ws.getCell(`A${row}`).font  = { bold: true };
  ws.getCell(`A${row}`).alignment = { horizontal: 'right' };
  ws.getCell(`F${row}`).value = Number(order.total ?? total);
  ws.getCell(`F${row}`).font  = { bold: true };
  ws.getCell(`F${row}`).numFmt = '"$"#,##0';

  // ── Anchos ────────────────────────────────────────────────
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 40;
  ws.getColumn(3).width = 8;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 16;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
