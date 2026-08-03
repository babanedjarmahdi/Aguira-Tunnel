import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const aiPath = path.join(ROOT, 'output', 'json', 'properties_ai.json');
const template = process.env.EXCEL_TEMPLATE;
const outDir = path.join(ROOT, 'output', 'excel');
const outFile = path.join(outDir, 'CRM_GPT_Immobilier_Employees_V8_10_2_2_filled.xlsx');

const TYPE_PREFIX = {
  'منزل': 'H',
  'أرض': 'L',
  'كركاس': 'K',
  'كراج': 'G',
  'محل': 'M',
  'محل تجاري': 'M',
  'شقة': 'A',
  'مزرعة': 'F',
  'منزل سومي فيني': 'S',
  'سومي فيني افونسي': 'SA',
};

function excelDateSerial(date) {
  // Excel serial: days since 1899-12-30 (handles the 1900 leap bug)
  const ms = date.getTime() - Date.UTC(1899, 11, 30);
  return ms / 86400000;
}

function computePriceDzd(ai) {
  if (ai.price_in_million != null) return ai.price_in_million * 10000;
  if (ai.price_per_meter != null && ai.area_m2 != null) {
    const perMeter = ai.price_per_meter < 100 ? ai.price_per_meter * 1000 : ai.price_per_meter;
    return perMeter * ai.area_m2;
  }
  return null;
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
  console.log(`Writing ${data.length} properties to Excel copy...`);

  if (!fs.existsSync(template)) {
    throw new Error(`Template not found: ${template}`);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(template);
  const ws = workbook.getWorksheet('العقارات');
  if (!ws) throw new Error('العقارات sheet not found');

  // Find first empty row after header (row 3) — scan for the end of real data
  let startRow = 4;
  for (let r = 4; r <= ws.rowCount; r++) {
    const cellA = ws.getCell(`A${r}`);
    const cellB = ws.getCell(`B${r}`);
    const aText = cellA.text.trim();
    const bText = cellB.text.trim();
    const bHasData = bText !== '' && !/^\d+$/.test(bText);
    if (aText !== '' || bHasData) startRow = r + 1;
  }

  // Collect existing IDs to avoid collisions
  const existingIds = new Set();
  for (let r = 4; r < startRow; r++) {
    const id = ws.getCell(`A${r}`).text.trim();
    if (id) existingIds.add(id);
  }
  const areaCounters = {}; // key: prefix-area -> counter

  function genId(prefix, area) {
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
  }

  const todaySerial = excelDateSerial(new Date());

  let row = startRow;
  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    const ai = p.ai;
    const type = ai.property_type || '';
    const prefix = TYPE_PREFIX[type] || 'H';
    const area = ai.area_m2 ?? p.areaM2 ?? null;
    const price = computePriceDzd(ai);

    const id = genId(prefix, area);
    const status = ai.status === 'للإيجار' ? 'للإيجار' : 'متوفر';

    ws.getCell(`A${row}`).value = id;          // معرف العقار
    ws.getCell(`B${row}`).value = type;        // نوع العقار
    ws.getCell(`C${row}`).value = status;      // حالة العقار
    ws.getCell(`D${row}`).value = ai.location || null;   // الموقع/العنوان
    ws.getCell(`E${row}`).value = area;        // المساحة
    ws.getCell(`F${row}`).value = price ?? null; // السعر المطلوب (DA)
    ws.getCell(`G${row}`).value = ai.owner_name || null; // اسم المالك
    ws.getCell(`H${row}`).value = 'مع المالك'; // البائع
    ws.getCell(`I${row}`).value = ai.phone ? String(ai.phone) : null; // رقم المالك
    ws.getCell(`J${row}`).value = buildNotes(ai); // ملاحظات
    ws.getCell(`K${row}`).value = Math.floor(todaySerial); // تاريخ الإضافة (date-only)
    ws.getCell(`L${row}`).value = row - 3;      // ID_مساعد (sequential)
    ws.getCell(`M${row}`).value = null;         // تطابق
    ws.getCell(`N${row}`).value = null;         // تاريخ البيع

    row++;
  }

  await workbook.xlsx.writeFile(outFile);
  console.log(`Done. Appended ${data.length} rows (rows ${startRow}..${row - 1}).`);
  console.log(`Output: ${outFile}`);
}

main().catch((e) => {
  fs.writeFileSync(path.join(ROOT, 'output', 'excel_fill_error.log'), String(e && (e.stack || e.message)), 'utf8');
  console.error('ERROR:', e.message);
  process.exit(1);
});
