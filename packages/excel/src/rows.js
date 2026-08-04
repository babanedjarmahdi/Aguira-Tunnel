import { computePriceDzd } from '@terraflow/shared';
import { TYPE_PREFIX, typePrefix, SELLER, statusValue, buildNotes } from './mapping.js';
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

// ---- Copy-mode row math (creates a NEW output file; never touches the template) ----
// Preserves the original stage2_fill behavior exactly: numeric DA price, generated IDs.
export function computeCopyRows(ws, records) {
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
  const rows = [];
  let row = startRow;
  for (const p of records) {
    const ai = p.ai;
    const type = ai.property_type || '';
    const prefix = TYPE_PREFIX[type] || 'H';
    const area = ai.area_m2 ?? p.areaM2 ?? null;
    const price = computePriceDzd(ai);

    rows.push({
      row,
      source: p.sourceFile ?? null,
      name: p.name ?? null,
      cells: {
        A: genId(prefix, area),                    // معرف العقار
        B: type,                                    // نوع العقار
        C: statusValue(ai),                         // حالة العقار
        D: ai.location || null,                     // الموقع/العنوان
        E: area,                                    // المساحة
        F: price ?? null,                           // السعر المطلوب (DA)
        G: ai.owner_name || null,                   // اسم المالك
        H: SELLER,                                  // البائع
        I: ai.phone ? String(ai.phone) : null,      // رقم المالك
        J: buildNotes(ai),                          // ملاحظات
        K: todaySerial,                             // تاريخ الإضافة
        L: row - 3,                                 // ID_مساعد
        M: null,                                    // تطابق
        N: null,                                    // تاريخ البيع
      },
    });
    row++;
  }
  return { startRow, lastRow: row - 1, rows };
}

// ---- In-place row math (writes into the ORIGINAL file; template-scheme static IDs) ----
// Preserves the fill_original behavior exactly: display price, template A-column scheme.
export function computeInPlaceRows(ws, records) {
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
  const rows = [];
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

    rows.push({
      row,
      source: p.sourceFile ?? null,
      name: p.name ?? null,
      cells: {
        A: id,                                      // معرف العقار
        B: type || null,                            // نوع العقار
        C: statusValue(ai),                         // حالة العقار
        D: locationDisplay(ai, p),                  // الموقع/العنوان
        E: area,                                    // المساحة
        F: fValue,                                  // السعر المطلوب
        G: ai.owner_name || null,                   // اسم المالك
        H: SELLER,                                  // البائع
        I: ai.phone ? String(ai.phone) : null,      // رقم المالك
        J: buildNotes(ai),                          // ملاحظات
        K: todaySerial,                             // تاريخ الإضافة
        L: row - 3,                                 // ID_مساعد
        M: null,                                    // تطابق
        N: null,                                    // تاريخ البيع
      },
    });
    row++;
  }
  return { startRow, lastRow: row - 1, rows };
}
