import fs from 'fs';
import path from 'path';

// Dependency-free CSV reader (RFC-4180-ish subset) for the input-csv plugin.
// Handles quoted fields (embedded commas / newlines / doubled quotes), CRLF and
// LF line endings, a UTF-8 BOM, and tracks the physical line each data row
// starts on so `sourceRow` stays stable when rows are added/removed (a stable
// key for idempotent database syncs).

// Parses CSV text into { rows, starts } where starts[i] is the 1-based physical
// line number where row i begins (starts[0] = 1 is the header row).
export function parseCsv(text, { delimiter = ',' } = {}) {
  const src = String(text == null ? '' : text)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
  const rows = [];
  const starts = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let startLine = 1;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); starts.push(startLine); row = []; startLine = line + 1; };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else {
        if (c === '\n') line += 1;
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      pushField();
    } else if (c === '\n') {
      pushRow();
      line += 1;
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) pushRow();
  return { rows, starts };
}

// Header row -> column names. Blank headers fall back to col<N>; duplicates get
// a numeric suffix so no two payload keys collide.
export function headersFromRows(rows) {
  if (!rows.length) return [];
  const seen = new Map();
  return rows[0].map((h, idx) => {
    const base = String(h == null ? '' : h).trim() || `col${idx + 1}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

// Turns parsed rows into canonical records. Row 0 is the header; each data row
// becomes { sourceFile, sourceRow (physical line), ...header: trimmed value }.
// Blank rows are skipped.
export function recordsFromCsv({ sourceFile, rows, starts = [] }) {
  if (!rows.length) return [];
  const headers = headersFromRows(rows);
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells || cells.every((c) => c == null || String(c).trim() === '')) continue;
    const rec = { sourceFile, sourceRow: starts[r] || r + 1 };
    headers.forEach((h, i) => {
      const v = cells[i];
      rec[h] = v == null ? '' : String(v).trim();
    });
    out.push(rec);
  }
  return out;
}

// Lists the *.csv files under a directory (files only, case-insensitive).
export function scanCsvFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.csv'))
    .map((d) => ({ path: path.join(dir, d.name), name: d.name }));
}

// Resolves an input source into a file list. Accepted shapes:
//   { kind: 'file', path, name? }
//   { kind: 'files', files: [{ path, name? }] }
//   { kind: 'dir', dir }
//   a raw directory string, or an array of { path, name }.
export function resolveCsvFiles(source = {}) {
  const files = [];
  if (source?.kind === 'file' && source.path) {
    files.push({ path: source.path, name: source.name || path.basename(source.path) });
  } else if (source?.kind === 'files' && Array.isArray(source.files)) {
    for (const f of source.files) files.push({ path: f.path, name: f.name || path.basename(f.path) });
  } else if (source?.kind === 'dir' && source.dir) {
    files.push(...scanCsvFiles(source.dir));
  } else if (typeof source === 'string') {
    files.push(...scanCsvFiles(source));
  } else if (Array.isArray(source)) {
    for (const f of source) files.push({ path: f.path, name: f.name || path.basename(f.path) });
  }
  return files;
}

// The input contract `read(source, ctx)`: parse every CSV into raw canonical
// records (deduped by sourceFile@sourceRow). Cleaning is a separate transform
// step, so this stays a pure read.
export async function readCsvSource(source = {}, ctx = {}) {
  if (ctx.signal?.aborted) throw new Error('Canceled during CSV read');
  const files = resolveCsvFiles(source);
  const records = [];
  const removed = [];
  const failures = [];
  const seen = new Set();
  for (const f of files) {
    if (!fs.existsSync(f.path)) { failures.push({ file: f.name, reason: 'file not found' }); continue; }
    try {
      const { rows, starts } = parseCsv(fs.readFileSync(f.path, 'utf8'));
      for (const rec of recordsFromCsv({ sourceFile: f.name, rows, starts })) {
        const key = `${rec.sourceFile}@${rec.sourceRow}`;
        if (seen.has(key)) {
          removed.push({ removedFile: f.name, kept: key, reason: 'duplicate row' });
          continue;
        }
        seen.add(key);
        records.push(rec);
      }
    } catch (e) {
      failures.push({ file: f.name, reason: e.message });
    }
  }
  return { records, removed, failures, files: files.length };
}
