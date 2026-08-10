import { toWest } from '@terraflow/shared';

// The "Cleaning" transform step (CSV → Cleaning → Database): normalizes raw
// parsed rows into clean payloads. Pure and deterministic — no I/O, no UI.

// Coerces a cell: Arabic/Indic digits and decimal separators to ASCII, then to
// a Number when the whole cell is numeric; otherwise keeps the trimmed string.
export function coerceValue(t) {
  const west = toWest(t).trim();
  if (/^-?\d+\.?\d*$/.test(west) && /[0-9]/.test(west)) {
    const n = Number(west);
    if (Number.isFinite(n)) return n;
  }
  return String(t).trim();
}

// One record: trim every value, drop empties (-> null), coerce numerics.
// sourceFile/sourceRow are the identity keys and pass through untouched.
export function cleanRecord(rec) {
  const out = { sourceFile: rec.sourceFile, sourceRow: rec.sourceRow };
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'sourceFile' || k === 'sourceRow') continue;
    const t = v == null ? '' : String(v).trim();
    out[k] = t === '' ? null : coerceValue(t);
  }
  return out;
}

// Cleans a batch: drops rows that carry no data after cleaning, reports the
// drops (and any per-record errors) for the job log.
export function cleanRecords(records = []) {
  const out = [];
  const dropped = [];
  const failures = [];
  for (const rec of records) {
    const cleaned = cleanRecord(rec);
    const hasData = Object.entries(cleaned).some(
      ([k, v]) => k !== 'sourceFile' && k !== 'sourceRow' && v != null
    );
    if (!hasData) {
      dropped.push({ sourceFile: rec.sourceFile, sourceRow: rec.sourceRow, reason: 'no data' });
      continue;
    }
    out.push(cleaned);
  }
  return { records: out, dropped, failures };
}
