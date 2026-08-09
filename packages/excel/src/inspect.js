import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { SHEET_NAME } from './mapping.js';
import { findStartRow } from './rows.js';

// Expected header text per column (the KMZ workflow's destination contract).
// Used to detect missing / mismatched / duplicate columns when validating a mapping.
export const EXPECTED_HEADERS = {
  A: 'معرف العقار',
  B: 'نوع العقار',
  C: 'حالة العقار',
  D: 'الموقع/العنوان',
  E: 'المساحة (م²)',
  F: 'السعر المطلوب',
  G: 'اسم المالك',
  H: 'البائع',
  I: 'رقم المالك',
  J: 'ملاحظات',
  K: 'تاريخ الإضافة',
  L: 'ID_مساعد',
  M: 'تطابق',
  N: 'تاريخ البيع',
};

function norm(s) {
  return String(s || '').replace(/[\s،؛.()\-/]/g, '').trim();
}

// Read a cell's display text defensively: some value objects (shared formulas,
// rich text, hyperlinks) blow up `cell.text`, so fall back to '' rather than crash.
function safeCellText(cell) {
  try {
    const t = cell.text;
    return t == null ? '' : String(t);
  } catch {
    return '';
  }
}

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

// Render a cell-grid preview from a stored workbook (template manager "Preview").
// Returns the top rows of the data sheet as a 2D grid of cell text, plus the
// header/start rows so the UI can highlight them.
export async function previewSheet({ templatePath, rows = 10, cols = 12 }) {
  if (!templatePath) throw new Error('templatePath is required');
  if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templatePath}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const ws = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  const startRow = findStartRow(ws);
  const headerRow = startRow > 3 ? 3 : 1;

  const colLimit = Math.min(cols, ws.columnCount || cols);
  const rowLimit = Math.min(rows, Math.max(ws.rowCount, rows));
  const grid = [];
  for (let r = 1; r <= rowLimit; r++) {
    const line = [];
    for (let c = 1; c <= colLimit; c++) {
      line.push(safeCellText(ws.getCell(r, c)));
    }
    grid.push(line);
  }

  return {
    sheet: ws.name,
    headerRow,
    startRow,
    rowCount: ws.rowCount,
    colCount: ws.columnCount,
    shownRows: rowLimit,
    shownCols: colLimit,
    grid,
  };
}

// Validate a field→column mapping against the template's headers.
// Each mapping entry gains a `status`: ok | missing | duplicate-column |
// mismatch | duplicate-header. `valid` is false when any issue exists;
// `autoCreate` lists missing columns the engine can create on apply.
export function validateMapping(mapping, headers) {
  const headerTexts = new Map();
  const seen = new Map();
  for (const h of headers) {
    headerTexts.set(h.column, h.header.trim());
    const n = norm(h.header);
    if (n) seen.set(n, [...(seen.get(n) || []), h.column]);
  }

  const issues = [];
  const used = new Set();
  for (const m of mapping) {
    const col = m.excelColumn;
    const header = headerTexts.get(col) || '';
    const expected = EXPECTED_HEADERS[col];
    let status = 'ok';
    if (!header) status = 'missing';
    else if (used.has(col)) status = 'duplicate-column';
    else if (expected && norm(header) !== norm(expected)) status = 'mismatch';
    else if ((seen.get(norm(header)) || []).length > 1) status = 'duplicate-header';
    used.add(col);
    m.status = status;
    const message = status === 'ok' ? null
      : status === 'missing' ? `Column ${col} (${m.aiField}) is missing from the template — will be created`
      : status === 'duplicate-column' ? `Column ${col} is targeted by more than one field`
      : status === 'mismatch' ? `Column ${col} header "${header}" differs from expected "${expected}"`
      : `Column ${col} header "${header}" appears more than once in the template`;
    if (message) issues.push({ field: m.aiField, column: col, status, message });
  }

  const autoCreate = mapping
    .filter((m) => m.status === 'missing')
    .map((m) => ({ column: m.excelColumn, header: EXPECTED_HEADERS[m.excelColumn] || m.aiField, aiField: m.aiField }));

  return { valid: issues.length === 0, issues, autoCreate };
}

// ---- Mapping profiles: persist a validated mapping per template -------------
function profileKey(templatePath) {
  const b = Buffer.from(path.resolve(templatePath).toLowerCase(), 'utf8');
  let h = 0;
  for (let i = 0; i < b.length; i++) h = ((h * 31) + b[i]) | 0;
  return Math.abs(h).toString(36);
}

export function mappingProfilePath({ templatePath, profilesDir }) {
  return path.join(profilesDir, `${profileKey(templatePath)}.json`);
}

export function getMappingProfile({ templatePath, profilesDir }) {
  const p = mappingProfilePath({ templatePath, profilesDir });
  if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return null;
}

export function saveMappingProfile({ templatePath, mapping, sheet, profilesDir }) {
  fs.mkdirSync(profilesDir, { recursive: true });
  const profile = { templatePath, savedAt: new Date().toISOString(), sheet, mapping };
  fs.writeFileSync(mappingProfilePath({ templatePath, profilesDir }), JSON.stringify(profile, null, 2), 'utf8');
  return profile;
}

// Grounded column mapping: AI/engine field -> Excel column for the target workbook.
export async function buildMapping({ templatePath, profilesDir } = {}) {
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

  const validation = validateMapping(mapping, info.headers);
  const profile = profilesDir ? getMappingProfile({ templatePath, profilesDir }) : null;

  return { sheet: info.sheet, headers: info.headers, mapping, validation, profile };
}
