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
