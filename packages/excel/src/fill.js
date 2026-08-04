import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { SHEET_NAME } from './mapping.js';
import { computeCopyRows, computeInPlaceRows, excelDateSerial, findStartRow } from './rows.js';

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

function openSheet(templatePath) {
  const workbook = new ExcelJS.Workbook();
  return workbook.xlsx.readFile(templatePath).then(() => {
    const ws = workbook.getWorksheet(SHEET_NAME);
    if (!ws) throw new Error(`${SHEET_NAME} sheet not found in ${templatePath}`);
    return { workbook, ws };
  });
}

function writeRows(ws, computed) {
  for (const { row, cells } of computed.rows) {
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'N']) {
      ws.getCell(`${col}${row}`).value = cells[col];
    }
    clearCellForFill(ws, row, 'M');
  }
}

// ---- Copy-based fill (creates a NEW output file, never touches the template) ----
export async function fillCopy({ templatePath, outputPath, records }) {
  if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templatePath}`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const { workbook, ws } = await openSheet(templatePath);
  const computed = computeCopyRows(ws, records);
  writeRows(ws, computed);
  await workbook.xlsx.writeFile(outputPath);
  return { outputPath, rows: records.length, startRow: computed.startRow, lastRow: computed.lastRow };
}

// ---- In-place fill (writes as-written prices into the ORIGINAL file, with forced backup) ----
export async function fillInPlace({ originalPath, records, backupDir }) {
  if (!fs.existsSync(originalPath)) throw new Error(`Original not found: ${originalPath}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `${path.basename(originalPath, '.xlsx')}_before_fill.xlsx`);
  fs.copyFileSync(originalPath, backup);
  const { workbook, ws } = await openSheet(originalPath);
  const computed = computeInPlaceRows(ws, records);
  writeRows(ws, computed);
  await workbook.xlsx.writeFile(originalPath);
  return { outputPath: originalPath, backup, rows: records.length, startRow: computed.startRow, lastRow: computed.lastRow };
}

// ---- Draft preview: compute the exact rows that would be written, without writing ----
export async function previewRows({ templatePath, records, mode = 'copy' }) {
  if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templatePath}`);
  const { ws } = await openSheet(templatePath);
  const computed = mode === 'original' ? computeInPlaceRows(ws, records) : computeCopyRows(ws, records);
  return { mode, templatePath, startRow: computed.startRow, lastRow: computed.lastRow, rows: computed.rows };
}
