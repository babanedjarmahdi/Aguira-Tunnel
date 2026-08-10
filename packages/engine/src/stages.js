import fs from 'fs';
import path from 'path';
import { extractAll, extractFromFiles } from './extractor.js';
import { createProvider, UsageLimitError } from '@terraflow/ai';
import { loadFromDisk } from '@terraflow/database';
import { fillCopy, fillInPlace, fillInPlaceSync } from '@terraflow/excel';
import { abortableSleep, throwIfAborted } from '@terraflow/shared';
import { EXCEL_OUT_DIR, makeUsageAdapter } from './config.js';
import { emitLog } from './events.js';
import { resolvePlugin } from './plugins.js';
import { cleanRecords } from './cleaning.js';

// Each stage receives { config, emitter, ctx }. `ctx` carries the job-scoped
// file paths and the input source so jobs never clobber each other:
//   ctx.inputFiles     -> array of { path, name } (uploaded KMZ list)
//   ctx.inputSourceDir -> directory to scan for .kmz
//   ctx.jsonPath       -> job properties.json
//   ctx.aiPath         -> job properties_ai.json
//   ctx.reportPath     -> job dedupe report
// When no job context exists (plain CLI), orchestrator.js supplies defaults.

// ---- Stage 1: extract ----
// Port of src/scripts/stage1_extract.js (behavior unchanged).
export async function extractStage({ config, emitter, ctx }) {
  throwIfAborted(ctx.signal, 'Canceled during extract');
  const { properties, removed, failures } = ctx.inputSourceDir
    ? extractAll(ctx.inputSourceDir)
    : ctx.inputFiles
      ? extractFromFiles(ctx.inputFiles)
      : extractAll(config.sourceKmzDir);

  fs.mkdirSync(path.dirname(ctx.jsonPath), { recursive: true });
  fs.writeFileSync(ctx.jsonPath, JSON.stringify(properties, null, 2), 'utf8');

  let copied = 0;
  if (config.doneKmzDir) {
    fs.mkdirSync(config.doneKmzDir, { recursive: true });
    const seen = new Set();
    for (const p of properties) {
      if (seen.has(p.sourceFile)) continue;
      seen.add(p.sourceFile);
      const src = path.join(config.sourceKmzDir, p.sourceFile);
      if (fs.existsSync(src)) {
        try {
          fs.copyFileSync(src, path.join(config.doneKmzDir, p.sourceFile));
          copied++;
        } catch (e) {
          emitLog(emitter, 'error', `  copy failed: ${p.sourceFile}: ${e.message}`);
        }
      }
    }
  }

  const lines = [];
  lines.push(`Source dir: ${ctx.inputSourceDir || config.sourceKmzDir}`);
  lines.push(`Total KMZ scanned: ${removed.length + properties.length + failures.length}`);
  lines.push(`Parse failures: ${failures.length}`);
  lines.push(`Unique properties: ${properties.length}`);
  lines.push(`Removed duplicates: ${removed.length}`);
  lines.push(`Copied to done folder: ${copied}`);
  lines.push('');
  lines.push('=== Removed duplicates ===');
  for (const r of removed) {
    lines.push(`[removed] ${r.removedFile}\n          kept as: ${r.kept} (${r.reason})`);
  }
  lines.push('');
  lines.push('=== Parse failures ===');
  for (const f of failures) {
    lines.push(`[failed] ${f.file}: ${f.reason}`);
  }
  fs.writeFileSync(ctx.reportPath, lines.join('\n'), 'utf8');
  for (const l of lines) emitLog(emitter, 'info', l);
  emitLog(emitter, 'info', `\nJSON written: ${ctx.jsonPath}`);

  return { properties, removed, failures, report: ctx.reportPath, output: ctx.jsonPath, copied };
}

// ---- Stage: CSV read (v0.6 second workflow — CSV → Cleaning → Database) ----
// Dispatches through the plugin registry (input-csv.read) so the engine talks
// to the input contract, never to a hard-coded CSV reader.
export async function csvReadStage({ config, emitter, ctx }) {
  throwIfAborted(ctx.signal, 'Canceled during CSV read');
  const plugin = resolvePlugin('input', 'input-csv');
  const source = ctx.inputFiles?.length
    ? { kind: 'files', files: ctx.inputFiles }
    : ctx.inputSourceDir
      ? { kind: 'dir', dir: ctx.inputSourceDir }
      : ctx.inputFile
        ? { kind: 'file', path: ctx.inputFile, name: ctx.inputName }
        : null;
  if (!source) throw new Error('No CSV input configured (upload a file or set a source directory)');

  emitLog(emitter, 'info', 'Reading CSV input...');
  const { records, removed, failures, files } = await plugin.read(source, { signal: ctx.signal });

  fs.mkdirSync(path.dirname(ctx.jsonPath), { recursive: true });
  fs.writeFileSync(ctx.jsonPath, JSON.stringify(records, null, 2), 'utf8');

  emitLog(emitter, 'info', `CSV files read: ${files}`);
  emitLog(emitter, 'info', `Rows parsed: ${records.length}`);
  if (removed.length) emitLog(emitter, 'info', `Duplicate rows skipped: ${removed.length}`);
  if (failures.length) {
    emitLog(emitter, 'warn', `Read failures: ${failures.length}`);
    for (const f of failures) emitLog(emitter, 'warn', `  - ${f.file}: ${f.reason}`);
  }
  emitLog(emitter, 'info', `Output: ${ctx.jsonPath}`);

  return { records, removed, failures, files, output: ctx.jsonPath };
}

// ---- Stage: Clean (v0.6 second workflow) -------------------------------
// The transform step of the spine (read → transform → draft → review → apply):
// normalizes values (trim, empty->null, Arabic-digit coercion) and drops rows
// with no data. Pure engine logic — the plugin registry is not involved.
export async function cleanStage({ config, emitter, ctx }) {
  throwIfAborted(ctx.signal, 'Canceled during clean');
  const raw = JSON.parse(fs.readFileSync(ctx.jsonPath, 'utf8'));
  const { records, dropped } = cleanRecords(raw);
  fs.writeFileSync(ctx.jsonPath, JSON.stringify(records, null, 2), 'utf8');
  emitLog(emitter, 'info', `Cleaning: ${records.length} rows kept, ${dropped.length} dropped (no data)`);
  for (const d of dropped) emitLog(emitter, 'info', `  - dropped ${d.sourceFile} row ${d.sourceRow}: ${d.reason}`);
  emitLog(emitter, 'info', `Output: ${ctx.jsonPath}`);
  return { records: records.length, dropped: dropped.length, output: ctx.jsonPath };
}

// ---- Stage 2: AI enrichment ----
// Port of src/scripts/stage2_ai.js (resume-safe, incremental, paced).
export async function aiStage({ config, emitter, ctx }) {
  if (!config.ai.apiKey) throw new Error('GROQ_API_KEY not set in .env');
  const data = JSON.parse(fs.readFileSync(ctx.jsonPath, 'utf8'));
  emitLog(emitter, 'info', `Extracting AI fields for ${data.length} properties...`);

  let previous = [];
  if (fs.existsSync(ctx.aiPath)) {
    try {
      previous = JSON.parse(fs.readFileSync(ctx.aiPath, 'utf8'));
      emitLog(emitter, 'info', `Found previous run with ${previous.length} entries - resuming.`);
    } catch {
      previous = [];
    }
  }
  const prevByKey = new Map(previous.map((p) => [`${p.sourceFile}@${p.placemarkIndex ?? 0}`, p]));

  const provider = createProvider({
    ...config.ai,
    usage: makeUsageAdapter(config.ai),
  });
  const results = [];
  let ok = 0;
  let limited = false;
  const failures = [];

  for (let i = 0; i < data.length; i++) {
    throwIfAborted(ctx.signal, 'Canceled during AI enrichment');
    const entry = data[i];
    const key = `${entry.sourceFile}@${entry.placemarkIndex ?? 0}`;
    const label = `${i + 1}/${data.length} ${entry.sourceFile}`;
    const cached = prevByKey.get(key);
    if (cached && cached.ai) {
      results.push(cached);
      ok++;
      emitLog(emitter, 'info', `[CACHE] ${label}`);
      continue;
    }
    try {
      const ai = await provider.enrich(entry, { signal: ctx.signal });
      results.push({ ...entry, ai });
      ok++;
      emitLog(emitter, 'info', `[OK] ${label} -> ${ai.property_type ?? '?'} / ${ai.price_in_million ?? ai.price_per_meter ?? 'no price'}`);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      if (e.name === 'UsageLimitError') {
        // Free-tier credit spent: stop rather than burn more requests.
        limited = true;
        emitLog(emitter, 'warn', `\n${e.message}`);
        emitLog(emitter, 'warn', `Stopping the AI stage after ${ok} new record(s) — ${data.length - i - 1} remaining skipped. Run again after the daily reset or raise the budget.`);
        break;
      }
      results.push({ ...entry, ai: null, aiError: e.message });
      failures.push({ sourceFile: entry.sourceFile, error: e.message });
      emitLog(emitter, 'error', `[FAIL] ${label}: ${e.message}`);
    }
    fs.writeFileSync(ctx.aiPath, JSON.stringify(results, null, 2), 'utf8');
    await abortableSleep(provider.pacingMs(), ctx.signal);
  }

  fs.writeFileSync(ctx.aiPath, JSON.stringify(results, null, 2), 'utf8');
  emitLog(emitter, 'info', `\nDone. OK: ${ok}, Failed: ${failures.length}${limited ? ', Stopped early (usage limit)' : ''}`);
  emitLog(emitter, 'info', `Output: ${ctx.aiPath}`);
  if (failures.length) {
    emitLog(emitter, 'warn', '\nFailures:');
    failures.forEach((f) => emitLog(emitter, 'warn', `  - ${f.sourceFile}: ${f.error}`));
  }

  return { results, ok, failed: failures.length, output: ctx.aiPath, limited };
}

// ---- Stage 3: database sync ----
// Port of src/scripts/stage1_loaddb.js (full sync + upsert).
export async function dbStage({ config, emitter, ctx }) {
  emitLog(emitter, 'info', 'Loading properties into PostgreSQL...');
  const count = await loadFromDisk({ jsonPath: ctx.jsonPath, aiPath: ctx.aiPath, env: config.db });
  emitLog(emitter, 'info', `Done. Total rows in DB: ${count}`);
  return { count };
}

// ---- Stage 4: Excel copy fill ----
// Port of src/scripts/stage2_fill.js (never touches the template).
export async function fillStage({ config, emitter, ctx }) {
  const data = JSON.parse(fs.readFileSync(ctx.aiPath, 'utf8')).filter((d) => d.ai);
  emitLog(emitter, 'info', `Writing ${data.length} properties to Excel copy...`);
  fs.mkdirSync(EXCEL_OUT_DIR, { recursive: true });
  const result = await fillCopy({
    templatePath: config.templatePath,
    outputPath: config.excelOutputPath,
    records: data,
  });
  emitLog(emitter, 'info', `Done. Appended ${result.rows} rows (rows ${result.startRow}..${result.lastRow}).`);
  emitLog(emitter, 'info', `Output: ${result.outputPath}`);
  return result;
}

// ---- In-place fill (writes into the ORIGINAL Excel, with forced backup) ----
// Port of src/scripts/fill_original.mjs. Watch syncs use the reconcile variant
// (add/update/remove) so the workbook mirrors the watched folder; manual runs
// keep the original append behavior.
export async function fillOriginalStage({ config, emitter, ctx }) {
  if (ctx.isWatchSync && ctx.excelStatePath) {
    const all = JSON.parse(fs.readFileSync(ctx.aiPath, 'utf8'));
    emitLog(emitter, 'info', `Syncing ${all.length} properties into ORIGINAL: ${config.originalPath} (add / update / remove)`);
    fs.mkdirSync(EXCEL_OUT_DIR, { recursive: true });
    const result = await fillInPlaceSync({
      originalPath: config.originalPath,
      records: all,
      backupDir: config.backupDir,
      statePath: ctx.excelStatePath,
    });
    emitLog(emitter, 'info', `Backup written: ${result.backup}`);
    emitLog(emitter, 'info', `Done. Added ${result.appended}, updated ${result.updated}, removed ${result.removed} row(s) (last row ${result.lastRow}) -> ${result.outputPath}`);
    return result;
  }
  const data = JSON.parse(fs.readFileSync(ctx.aiPath, 'utf8')).filter((d) => d.ai);
  emitLog(emitter, 'info', `Filling ${data.length} properties into ORIGINAL: ${config.originalPath}`);
  fs.mkdirSync(EXCEL_OUT_DIR, { recursive: true });
  const result = await fillInPlace({
    originalPath: config.originalPath,
    records: data,
    backupDir: config.backupDir,
  });
  emitLog(emitter, 'info', `Backup written: ${result.backup}`);
  emitLog(emitter, 'info', `Done. Wrote ${result.rows} rows (rows ${result.startRow}..${result.lastRow}) back to the ORIGINAL file.`);
  return result;
}
