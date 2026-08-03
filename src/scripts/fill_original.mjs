import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import { formatPrice, locationDisplay, priceMils, typePrefix } from './price_display.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const aiPath = path.join(ROOT, 'output', 'json', 'properties_ai.json');
const original = path.join(ROOT, '..', 'CRM_GPT_Immobilier_Employees_V8_10_2_2.xlsx');

function excelDateSerial(date) {
  const ms = date.getTime() - Date.UTC(1899, 11, 30);
  return ms / 86400000;
}

function buildNotes(ai) {
  const parts = [];
  if (ai.owner_name) parts.push(`المالك: ${ai.owner_name}`);
  if (ai.notes) parts.push(ai.notes);
  if (ai.price_note) parts.push(`السعر: ${ai.price_note}`);
  return parts.join(' | ');
}

async function main() {
  const data = JSON.parse(fs.readFileSync(aiPath, 'utf8')).filter((d) => d.ai);
  console.log(`Filling ${data.length} properties into ORIGINAL: ${original}`);

  if (!fs.existsSync(original)) throw new Error(`Original not found: ${original}`);

  const backupDir = path.join(ROOT, 'output', 'backup');
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, 'CRM_GPT_Immobilier_Employees_V8_10_2_2_before_fill.xlsx');
  fs.copyFileSync(original, backup);
  console.log(`Backup written: ${backup}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(original);
  const ws = workbook.getWorksheet('العقارات');
  if (!ws) throw new Error('العقارات sheet not found');

  let startRow = 4;
  for (let r = 4; r <= ws.rowCount; r++) {
    const aText = ws.getCell(`A${r}`).text.trim();
    const bText = ws.getCell(`B${r}`).text.trim();
    if (aText !== '' || (bText !== '' && !/^\d+$/.test(bText))) startRow = r + 1;
  }
  console.log(`Data starts at row ${startRow}`);

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

  for (let i = 0; i < data.length; i++) {
    const p = data[i];
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

    const status = ai.status === 'للإيجار' ? 'للإيجار' : 'متوفر';
    const fValue = display ? (/^\d+$/.test(display) ? Number(display) : display) : null;

    ws.getCell(`A${row}`).value = id;
    ws.getCell(`B${row}`).value = type || null;
    ws.getCell(`C${row}`).value = status;
    ws.getCell(`D${row}`).value = locationDisplay(ai, p);
    ws.getCell(`E${row}`).value = area;
    ws.getCell(`F${row}`).value = fValue;
    ws.getCell(`G${row}`).value = ai.owner_name || null;
    ws.getCell(`H${row}`).value = 'مع المالك';
    ws.getCell(`I${row}`).value = ai.phone ? String(ai.phone) : null;
    ws.getCell(`J${row}`).value = buildNotes(ai);
    ws.getCell(`K${row}`).value = todaySerial;
    ws.getCell(`L${row}`).value = row - 3;
    ws.getCell(`M${row}`).value = null;
    ws.getCell(`N${row}`).value = null;

    row++;
  }

  await workbook.xlsx.writeFile(original);
  console.log(`Done. Wrote ${data.length} rows (rows ${startRow}..${row - 1}) back to the ORIGINAL file.`);
}

main().catch((e) => {
  console.error('ERROR:', e && (e.stack || e.message));
  process.exit(1);
});
