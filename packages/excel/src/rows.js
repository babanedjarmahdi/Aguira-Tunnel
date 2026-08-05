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

const syncKey = (p) => `${p.sourceFile}@${p.placemarkIndex ?? 0}`;

// Sync row math (watch mode): reconcile the workbook with the folder contents.
//   prevState: { [sourceFile@placemarkIndex]: rowNumber } persisted after the
//   previous sync, so rows are identified, updated in place and removed when
//   their KMZ is deleted from the watched folder — instead of always appending.
//   records:   ALL extracted records (ai may be null — those are left untouched).
// Returns rows to write (updates in place + new appends), row deletions (to
// splice top-down so shifting is safe) and the next state mapping.
export function computeInPlaceSyncRows(ws, records, prevState = {}) {
  const startRow = findStartRow(ws);
  const recordsByKey = new Map(records.map((p) => [syncKey(p), p]));

  const updates = [];    // { row, key, p }  existing state rows to rewrite in place
  const addCandidates = []; // { key, p }   present records with ai, no state row yet
  for (const [key, p] of recordsByKey) {
    if (!p.ai) continue; // nothing to write — leave the old row untouched
    const row = prevState[key];
    if (Number.isInteger(row) && row >= 4 && row < startRow) updates.push({ row, key, p });
    else addCandidates.push({ key, p });
  }

  // Rows whose source KMZ no longer exists in the folder get deleted.
  const deletions = [];
  for (const [key, row] of Object.entries(prevState)) {
    if (!recordsByKey.has(key) && Number.isInteger(row) && row >= 4 && row < startRow) {
      deletions.push(row);
    }
  }

  // Snapshot the existing data block (4..startRow-1) to fingerprint unmanaged
  // rows, so rows written by an earlier run (before sync state existed) are
  // adopted instead of duplicated on the first sync.
  const dataRows = [];
  for (let r = 4; r < startRow; r++) {
    const a = ws.getCell(`A${r}`).text.trim();
    const b = ws.getCell(`B${r}`).text.trim();
    const d = ws.getCell(`D${r}`).text.trim();
    const e = ws.getCell(`E${r}`).value;
    const f = ws.getCell(`F${r}`).value;
    dataRows.push({ row: r, a, b, d, e, f, isPipelineRow: a !== '' || b !== '' || d !== '' || e != null || f != null });
  }

  const rowFp = (dr) => `${dr.b}|${dr.d}|${String(dr.e ?? '')}|${String(dr.f ?? '')}`;
  const recFp = (p, ai) => `${ai.property_type || ''}|${locationDisplay(ai, p)}|${String(ai.area_m2 ?? p.areaM2 ?? '')}|${String(formatPrice(ai) ?? '')}`;

  const managed = new Set([...updates.map((u) => u.row), ...deletions]);
  const free = dataRows.filter((dr) => dr.isPipelineRow && !managed.has(dr.row));
  const used = new Set();
  const adopted = [];
  for (const cand of [...addCandidates]) {
    const fp = recFp(cand.p, cand.p.ai);
    const match = free.find((dr) => !used.has(dr.row) && rowFp(dr) === fp);
    if (!match) continue;
    used.add(match.row);
    adopted.push({ row: match.row, key: cand.key, p: cand.p });
    addCandidates.splice(addCandidates.indexOf(cand), 1);
  }

  // Shift update/adopted rows up for each row deleted below them.
  for (const d of deletions) {
    for (const u of updates) if (u.row > d) u.row -= 1;
    for (const a of adopted) if (a.row > d) a.row -= 1;
  }

  // The append block starts after the last remaining data row.
  let nextRow = 4;
  for (const dr of dataRows) {
    if (deletions.includes(dr.row)) continue;
    let shift = 0;
    for (const d of deletions) if (d < dr.row) shift += 1;
    if (dr.row - shift >= nextRow) nextRow = dr.row - shift + 1;
  }

  // ID counters come from the rows that remain after deletion.
  const counters = {};
  for (const dr of dataRows) {
    if (deletions.includes(dr.row) || !dr.b) continue;
    const mil = typeof dr.f === 'number' ? Math.round(dr.f / 1e6) : 0;
    const key = `${typePrefix(dr.b)}|${dr.e}|${mil}`;
    counters[key] = (counters[key] || 0) + 1;
  }

  const todaySerial = Math.floor(excelDateSerial(new Date()));
  const buildCells = (p, row) => {
    const ai = p.ai;
    const display = formatPrice(ai);
    return {
      B: ai.property_type || null,
      C: statusValue(ai),
      D: locationDisplay(ai, p),
      E: ai.area_m2 ?? p.areaM2 ?? null,
      F: display ? (/^\d+$/.test(display) ? Number(display) : display) : null,
      G: ai.owner_name || null,
      H: SELLER,
      I: ai.phone ? String(ai.phone) : null,
      J: buildNotes(ai),
      K: todaySerial,
      L: row - 3,
      M: null,
      N: null,
    };
  };

  const state = {};
  const rows = [];
  for (const u of updates) {
    state[u.key] = u.row;
    rows.push({ row: u.row, keepId: true, cells: buildCells(u.p, u.row) });
  }
  for (const a of adopted) {
    state[a.key] = a.row;
    rows.push({ row: a.row, keepId: true, cells: buildCells(a.p, a.row) });
  }

  const appends = [];
  for (const cand of addCandidates) {
    const ai = cand.p.ai;
    const type = ai.property_type || '';
    const area = ai.area_m2 ?? cand.p.areaM2 ?? null;
    const prefix = typePrefix(type);
    const mil = priceMils(formatPrice(ai));
    const ckey = `${prefix}|${area}|${mil}`;
    const count = (counters[ckey] || 0) + 1;
    counters[ckey] = count;
    const suffix = count > 1 ? String.fromCharCode(64 + count - 1) : '';
    const id = `${prefix}${area ?? ''}${mil}${suffix}`;
    appends.push({ row: nextRow, key: cand.key, p: cand.p, id });
    nextRow++;
  }
  for (const ap of appends) {
    state[ap.key] = ap.row;
    rows.push({ row: ap.row, keepId: false, id: ap.id, cells: buildCells(ap.p, ap.row) });
  }

  const lastRow = nextRow - 1;
  return {
    deletions,
    rows,
    state,
    updated: updates.length + adopted.length,
    removed: deletions.length,
    appended: appends.length,
    startRow: 4,
    lastRow,
  };
}
