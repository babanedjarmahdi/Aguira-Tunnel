import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { computePriceDzd } from '@terraflow/shared';
import { TYPE_PREFIX, typePrefix, SHEET_NAME, SELLER, statusValue, buildNotes } from './mapping.js';
import { formatPrice, locationDisplay, priceMils } from './price.js';

export function excelDateSerial(date) {
  const ms = date.getTime() - Date.UTC(1899, 11, 30);
  return ms / 86400000;
}

export function findStartRow(ws) {
  let startRow = 4;
  for (let r = 4; r <= ws.rowCount; r++) {
    const aText = ws.getCell(`A${r}`).text.trim();
    const bText = ws.getCell(`B${r}`).text.trim();
    const bHasData = bText !== '' && !/^\d+$/.test(bText);
    if (aText !== '' || bHasData) startRow = r + 1;
  }
  return startRow;
}

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

// ---- Copy-based fill (creates a NEW output file, never touches the template) ----
// Preserves the original stage2_fill behavior exactly: numeric DA price, generated IDs.
export async function fillCopy({ templatePath, outputPath, records }) {
  if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templatePath}`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const ws = workbook.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error(`${SHEET_NAME} sheet not found`);

  const startRow = findStartRow(ws);
  const existingIds = new Set();
  for (let r = 4; r < startRow; r++) {
    const id = ws.getCell(`A${r}`).text.trim();
    if (id) existingIds.add(id);
  }
  const areaCounters = {};

  const genId = (prefix, area) => {
    const key = `${prefix}-${area ?? 0}`;
    areaCounters[key] = (areaCounters[key] ?? 0) + 1;
    const n = areaCounters[key];
    let candidate = `${prefix}${area ?? 0}${n}`;
    let suffix = 1;
    while (existingIds.has(candidate)) {
      candidate = `${prefix}${area ?? 0}${n}${'A'.repeat(suffix)}`;
      suffix++;
    }
    existingIds.add(candidate);
    return candidate;
  };

  const todaySerial = Math.floor(excelDateSerial(new Date()));
  let row = startRow;
  for (const p of records) {
    const ai = p.ai;
    const type = ai.property_type || '';
    const prefix = TYPE_PREFIX[type] || 'H';
    const area = ai.area_m2 ?? p.areaM2 ?? null;
    const price = computePriceDzd(ai);

    ws.getCell(`A${row}`).value = genId(prefix, area);          // معرف العقار
    ws.getCell(`B${row}`).value = type;                          // نوع العقار
    ws.getCell(`C${row}`).value = statusValue(ai);               // حالة العقار
    ws.getCell(`D${row}`).value = ai.location || null;           // الموقع/العنوان
    ws.getCell(`E${row}`).value = area;                          // المساحة
    ws.getCell(`F${row}`).value = price ?? null;                 // السعر المطلوب (DA)
    ws.getCell(`G${row}`).value = ai.owner_name || null;         // اسم المالك
    ws.getCell(`H${row}`).value = SELLER;                        // البائع
    ws.getCell(`I${row}`).value = ai.phone ? String(ai.phone) : null; // رقم المالك
    ws.getCell(`J${row}`).value = buildNotes(ai);                // ملاحظات
    ws.getCell(`K${row}`).value = todaySerial;                   // تاريخ الإضافة
    ws.getCell(`L${row}`).value = row - 3;                       // ID_مساعد
    clearCellForFill(ws, row, 'M');                              // تطابق
    ws.getCell(`N${row}`).value = null;                          // تاريخ البيع
    row++;
  }

  await workbook.xlsx.writeFile(outputPath);
  return { outputPath, rows: records.length, startRow, lastRow: row - 1 };
}

// ---- In-place fill (writes as-written prices into the ORIGINAL file, with forced backup) ----
// Preserves the fill_original behavior exactly: display price, template-scheme static IDs.
export async function fillInPlace({ originalPath, records, backupDir }) {
  if (!fs.existsSync(originalPath)) throw new Error(`Original not found: ${originalPath}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `${path.basename(originalPath, '.xlsx')}_before_fill.xlsx`);
  fs.copyFileSync(originalPath, backup);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(originalPath);
  const ws = workbook.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error(`${SHEET_NAME} sheet not found`);

  const startRow = findStartRow(ws);
  const counters = {};
  for (let r = 4; r < startRow; r++) {
    const b = ws.getCell(`B${r}`).text.trim();
    const e = ws.getCell(`E${r}`).value;
    const f = ws.getCell(`F${r}`).value;
    if (!b) continue;
    const mil = typeof f === 'number' ? Math.round(f / 1e6) : 0;
    const key = `${typePrefix(b)}|${e}|${mil}`;
    counters[key] = (counters[key] || 0) + 1;
  }

  const todaySerial = Math.floor(excelDateSerial(new Date()));
  let row = startRow;
  for (const p of records) {
    const ai = p.ai;
    const display = formatPrice(ai);
    const type = ai.property_type || '';
    const area = ai.area_m2 ?? p.areaM2 ?? null;
    const prefix = typePrefix(type);
    const mil = priceMils(display);
    const key = `${prefix}|${area}|${mil}`;
    const count = (counters[key] || 0) + 1;
    counters[key] = count;
    const suffix = count > 1 ? String.fromCharCode(64 + count - 1) : '';
    const id = `${prefix}${area ?? ''}${mil}${suffix}`;
    const fValue = display ? (/^\d+$/.test(display) ? Number(display) : display) : null;

    ws.getCell(`A${row}`).value = id;
    ws.getCell(`B${row}`).value = type || null;
    ws.getCell(`C${row}`).value = statusValue(ai);
    ws.getCell(`D${row}`).value = locationDisplay(ai, p);
    ws.getCell(`E${row}`).value = area;
    ws.getCell(`F${row}`).value = fValue;
    ws.getCell(`G${row}`).value = ai.owner_name || null;
    ws.getCell(`H${row}`).value = SELLER;
    ws.getCell(`I${row}`).value = ai.phone ? String(ai.phone) : null;
    ws.getCell(`J${row}`).value = buildNotes(ai);
    ws.getCell(`K${row}`).value = todaySerial;
    ws.getCell(`L${row}`).value = row - 3;
    clearCellForFill(ws, row, 'M');
    ws.getCell(`N${row}`).value = null;
    row++;
  }

  await workbook.xlsx.writeFile(originalPath);
  return { outputPath: originalPath, backup, rows: records.length, startRow, lastRow: row - 1 };
}
