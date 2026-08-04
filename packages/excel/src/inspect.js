import fs from 'fs';
import ExcelJS from 'exceljs';
import { SHEET_NAME } from './mapping.js';
import { findStartRow } from './rows.js';

export async function inspectExcel({ templatePath }) {
  if (!templatePath) throw new Error('templatePath is required');
  if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templatePath}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const sheets = workbook.worksheets.map((w) => ({
    name: w.name,
    rowCount: w.rowCount,
    colCount: w.columnCount,
  }));

  const ws = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  const startRow = findStartRow(ws);
  const headerRow = startRow > 3 ? 3 : 1;

  const headers = [];
  for (let c = 1; c <= ws.columnCount; c++) {
    const cell = ws.getCell(headerRow, c);
    const text = cell.text.trim();
    if (!text && c > ws.columnCount) break;
    headers.push({ column: String.fromCharCode(64 + c), header: text });
  }

  return {
    path: templatePath,
    sheets,
    sheet: { name: ws.name, startRow, existingRows: Math.max(0, startRow - 4), headerRow, colCount: ws.columnCount },
    headers,
  };
}

// Grounded column mapping: AI/engine field -> Excel column for the target workbook.
export async function buildMapping({ templatePath }) {
  const info = await inspectExcel({ templatePath });
  const headerOf = (col) => (info.headers.find((h) => h.column === col) || {}).header || col;

  const mapping = [
    { aiField: 'Generated ID', excelColumn: 'A', header: headerOf('A'), example: 'H5201', confidence: 100, role: 'id' },
    { aiField: 'property_type', excelColumn: 'B', header: headerOf('B'), example: 'منزل', confidence: 99, role: 'ai' },
    { aiField: 'status', excelColumn: 'C', header: headerOf('C'), example: 'متوفر', confidence: 99, role: 'ai' },
    { aiField: 'location', excelColumn: 'D', header: headerOf('D'), example: 'سالوحة', confidence: 95, role: 'ai' },
    { aiField: 'area_m2', excelColumn: 'E', header: headerOf('E'), example: '400', confidence: 98, role: 'ai' },
    { aiField: 'price (DA)', excelColumn: 'F', header: headerOf('F'), example: '9600000', confidence: 96, role: 'ai' },
    { aiField: 'owner_name', excelColumn: 'G', header: headerOf('G'), example: 'حمو خضير', confidence: 94, role: 'ai' },
    { aiField: 'seller', excelColumn: 'H', header: headerOf('H'), example: 'مع المالك', confidence: 100, role: 'const' },
    { aiField: 'owner_phone', excelColumn: 'I', header: headerOf('I'), example: '0671550545', confidence: 92, role: 'ai' },
    { aiField: 'notes', excelColumn: 'J', header: headerOf('J'), example: 'المالك: … | ملاحظات', confidence: 90, role: 'ai' },
    { aiField: 'date_added', excelColumn: 'K', header: headerOf('K'), example: 'serial date', confidence: 100, role: 'const' },
    { aiField: 'aux id', excelColumn: 'L', header: headerOf('L'), example: 'row - 3', confidence: 100, role: 'const' },
    { aiField: 'match', excelColumn: 'M', header: headerOf('M'), example: '— (cleared)', confidence: 100, role: 'const' },
    { aiField: 'sale_date', excelColumn: 'N', header: headerOf('N'), example: '— (cleared)', confidence: 100, role: 'const' },
  ];

  return { sheet: info.sheet, headers: info.headers, mapping };
}
