import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { SHEET_NAME } from './mapping.js';
import { computeCopyRows, computeInPlaceRows, computeInPlaceSyncRows, excelDateSerial, findStartRow } from './rows.js';

export { excelDateSerial, findStartRow };

// exceljs consolidates consecutive identical formulas into shared-formula ranges
// (a master cell + clones). Clearing a master without fixing its clones makes
// save fail with "Shared Formula master must exist above and or left of clone".
// Before clearing a cell that is a shared-formula master, promote its clones to
// standalone formulas so the workbook still saves. Output is unchanged for new
// rows (blank) and template rows below keep their formula.
function clearCellForFill(ws, row, col) {
  const cell = ws.getCell(`${col}${row}`);
  const v = cell.value;
  if (v && typeof v === 'object' && v.formula && v.ref && v.ref.includes(':')) {
    const [top, bottom] = v.ref.split(':');
    const topRow = parseInt(top.replace(/\D/g, ''), 10);
    const bottomRow = parseInt(bottom.replace(/\D/g, ''), 10);
    const colLetters = top.replace(/\d+/g, '');
    for (let r = topRow; r <= bottomRow; r++) {
      if (r === row) continue;
      const c = ws.getCell(`${colLetters}${r}`);
      const cv = c.value;
      if (cv && typeof cv === 'object' && cv.sharedFormula) {
        c.value = { formula: c.formula };
      }
    }
  }
  cell.value = null;
}

// Deleting rows via worksheet.spliceRows moves shared-formula cells around but
// does NOT fix their master/clone references, so saving fails with "Shared
// Formula master must exist above and or left of clone". Promote every shared
// formula (masters and clones alike) to a standalone formula before splicing.
function unshareSharedFormulas(ws) {
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      const v = cell.value;
      if (v && typeof v === 'object' && v.formula && (v.ref || v.sharedFormula)) {
        cell.value = { formula: cell.formula };
      }
    });
  });
}

function openSheet(templatePath) {
  const workbook = new ExcelJS.Workbook();
  return workbook.xlsx.readFile(templatePath).then(() => {
    const ws = workbook.getWorksheet(SHEET_NAME);
    if (!ws) throw new Error(`${SHEET_NAME} sheet not found in ${templatePath}`);
    return { workbook, ws };
  });
}

// Create missing header columns on the data sheet (auto-create support).
function ensureHeaders(ws, autoCreate) {
  if (!autoCreate || !autoCreate.length) return 0;
  const startRow = findStartRow(ws);
  const headerRow = startRow > 3 ? 3 : 1;
  let created = 0;
  for (const { column, header } of autoCreate) {
    const cell = ws.getCell(`${column}${headerRow}`);
    if (!cell.text.trim()) { cell.value = header; created++; }
  }
  return created;
}

function writeRows(ws, computed) {
  for (const { row, cells } of computed.rows) {
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'N']) {
      ws.getCell(`${col}${row}`).value = cells[col];
    }
    clearCellForFill(ws, row, 'M');
  }
}

// Sync writer: updates/adopted rows keep their existing id (A) and added-on
// date (K); appended rows get a fresh id + today's date.
function writeSyncRows(ws, rows) {
  for (const { row, keepId, id, cells } of rows) {
    if (!keepId) ws.getCell(`A${row}`).value = id;
    const cols = keepId ? ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'N'] : ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'N'];
    for (const col of cols) ws.getCell(`${col}${row}`).value = cells[col];
    clearCellForFill(ws, row, 'M');
  }
}

// ---- Copy-based fill (creates a NEW output file, never touches the template) ----
export async function fillCopy({ templatePath, outputPath, records, autoCreate }) {
  if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templatePath}`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const { workbook, ws } = await openSheet(templatePath);
  const createdHeaders = ensureHeaders(ws, autoCreate);
  const computed = computeCopyRows(ws, records);
  writeRows(ws, computed);
  await workbook.xlsx.writeFile(outputPath);
  return { outputPath, rows: records.length, startRow: computed.startRow, lastRow: computed.lastRow, createdHeaders };
}

// ---- In-place fill (writes as-written prices into the ORIGINAL file, with forced backup) ----
export async function fillInPlace({ originalPath, records, backupDir, autoCreate }) {
  if (!fs.existsSync(originalPath)) throw new Error(`Original not found: ${originalPath}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `${path.basename(originalPath, '.xlsx')}_before_fill.xlsx`);
  fs.copyFileSync(originalPath, backup);
  const { workbook, ws } = await openSheet(originalPath);
  const createdHeaders = ensureHeaders(ws, autoCreate);
  const computed = computeInPlaceRows(ws, records);
  writeRows(ws, computed);
  await workbook.xlsx.writeFile(originalPath);
  return { outputPath: originalPath, backup, rows: records.length, startRow: computed.startRow, lastRow: computed.lastRow, createdHeaders };
}

// ---- In-place SYNC fill (watch mode): add/update/remove rows to mirror the folder ----
// Reconciles the ORIGINAL workbook against the current folder contents using a
// persisted { [sourceFile@placemarkIndex]: row } state. Rows whose KMZ was
// deleted are spliced out, existing rows are updated in place (keeping their
// id + added-on date), and new records are appended with fresh ids. The new
// state is persisted so the next sync knows which rows belong to which file.
export async function fillInPlaceSync({ originalPath, records, backupDir, autoCreate, statePath }) {
  if (!fs.existsSync(originalPath)) throw new Error(`Original not found: ${originalPath}`);
  let prevState = {};
  if (statePath && fs.existsSync(statePath)) {
    try { prevState = JSON.parse(fs.readFileSync(statePath, 'utf8')) || {}; } catch { prevState = {}; }
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(backupDir, `${path.basename(originalPath, '.xlsx')}_before_fill_${stamp}.xlsx`);
  fs.copyFileSync(originalPath, backup);
  const { workbook, ws } = await openSheet(originalPath);
  const createdHeaders = ensureHeaders(ws, autoCreate);
  const computed = computeInPlaceSyncRows(ws, records, prevState);
  if (computed.deletions.length) unshareSharedFormulas(ws);
  for (const row of [...computed.deletions].sort((a, b) => b - a)) ws.spliceRows(row, 1);
  writeSyncRows(ws, computed.rows);
  // Atomic write: never leave the workbook truncated/corrupt on a failed save.
  const tmp = `${originalPath}.sync.tmp`;
  await workbook.xlsx.writeFile(tmp);
  fs.renameSync(tmp, originalPath);
  if (statePath) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(computed.state, null, 2), 'utf8');
  }
  return {
    outputPath: originalPath, backup, statePath,
    rows: computed.rows.length, updated: computed.updated, removed: computed.removed,
    appended: computed.appended, lastRow: computed.lastRow, createdHeaders,
  };
}

// ---- Draft preview: compute the exact rows that would be written, without writing ----
export async function previewRows({ templatePath, records, mode = 'copy', autoCreate }) {
  if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templatePath}`);
  const { ws } = await openSheet(templatePath);
  const computed = mode === 'original' ? computeInPlaceRows(ws, records) : computeCopyRows(ws, records);
  return { mode, templatePath, startRow: computed.startRow, lastRow: computed.lastRow, rows: computed.rows, autoCreate: autoCreate || [] };
}
