// reportExport.js — Serializadores genericos CSV / XLSX para el generador
// dinamico de reportes (routes/reports.js). A diferencia de orderExport.js,
// aqui las columnas no estan fijas: llegan como [{ header, key, numFmt? }]
// segun lo que el admin haya elegido exportar.

import ExcelJS from 'exceljs';
import { embedHeaderLogo } from './orderExport.js';

const COMPANY_NAME = 'Papelería Cartagena';

function csvField(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function buildReportCsv({ rows, columns }) {
  const headers = columns.map((c) => csvField(c.header)).join(',');
  const body = rows
    .map((r) => columns.map((c) => csvField(r[c.key])).join(','))
    .join('\r\n');
  // BOM para que Excel detecte UTF-8
  return '﻿' + headers + '\r\n' + body;
}

export async function buildReportXlsx({ rows, columns, sheetName = 'Reporte', title = '' }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY_NAME;
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName.slice(0, 31));

  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width || Math.max(12, String(c.header).length + 4);
  });

  const logoRows = embedHeaderLogo(wb, ws, { rowSpan: 4 });

  const lastCol = String.fromCharCode(64 + Math.min(columns.length, 26));
  ws.mergeCells(`B1:${lastCol}1`);
  ws.getCell('B1').value = COMPANY_NAME;
  ws.getCell('B1').font = { bold: true, size: 16, color: { argb: 'FF1E40AF' } };
  ws.getCell('B1').alignment = { vertical: 'middle' };

  ws.mergeCells(`B2:${lastCol}2`);
  ws.getCell('B2').value =
    `${title ? title + ' · ' : ''}Generado: ${new Date().toLocaleString('es-CO')}`;
  ws.getCell('B2').font = { size: 10, color: { argb: 'FF6B7280' } };

  const tableHeaderRow = Math.max(logoRows, 2) + 2;

  const headerRow = ws.getRow(tableHeaderRow);
  columns.forEach((c, i) => {
    headerRow.getCell(i + 1).value = c.header;
  });
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 22;

  rows.forEach((r, i) => {
    const dataRow = ws.getRow(tableHeaderRow + 1 + i);
    columns.forEach((c, j) => {
      const cell = dataRow.getCell(j + 1);
      cell.value = r[c.key] ?? '';
      if (c.numFmt) {
        cell.numFmt = c.numFmt;
        cell.alignment = { horizontal: 'right' };
      }
    });
  });

  ws.views = [{ state: 'frozen', ySplit: tableHeaderRow }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
