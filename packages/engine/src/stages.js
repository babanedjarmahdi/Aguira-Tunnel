import fs from 'fs';
import path from 'path';
import { extractAll } from './extractor.js';
import { createProvider } from '@terraflow/ai';
import { loadFromJsonFiles } from '@terraflow/database';
import { fillCopy, fillInPlace } from '@terraflow/excel';
import { JSON_FILE, AI_FILE, REPORT_FILE, OUTPUT_JSON_DIR, EXCEL_OUT_DIR } from './config.js';
import { emitLog, emitProgress } from './events.js';

// ---- Stage 1: extract ----
// Port of src/scripts/stage1_extract.js (behavior unchanged).
export async function extractStage({ config, emitter }) {
  const { properties, removed, failures } = extractAll(config.sourceKmzDir);
  fs.mkdirSync(OUTPUT_JSON_DIR, { recursive: true });
  fs.writeFileSync(JSON_FILE, JSON.stringify(properties, null, 2), 'utf8');

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
  lines.push(`Source dir: ${config.sourceKmzDir}`);
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
  fs.writeFileSync(REPORT_FILE, lines.join('\n'), 'utf8');
  for (const l of lines) emitLog(emitter, 'info', l);
  emitLog(emitter, 'info', `\nJSON written: ${JSON_FILE}`);

  return { properties, removed, failures, report: REPORT_FILE, output: JSON_FILE, copied };
}

// ---- Stage 2: AI enrichment ----
// Port of src/scripts/stage2_ai.js (resume-safe, incremental, paced).
export async function aiStage({ config, emitter }) {
  if (!config.ai.apiKey) throw new Error('GROQ_API_KEY not set in .env');
  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  emitLog(emitter, 'info', `Extracting AI fields for ${data.length} properties...`);

  let previous = [];
  if (fs.existsSync(AI_FILE)) {
    try {
      previous = JSON.parse(fs.readFileSync(AI_FILE, 'utf8'));
      emitLog(emitter, 'info', `Found previous run with ${previous.length} entries - resuming.`);
    } catch {
      previous = [];
    }
  }
  const prevByKey = new Map(previous.map((p) => [`${p.sourceFile}@${p.placemarkIndex ?? 0}`, p]));

  const provider = createProvider(config.ai);
  const results = [];
  let ok = 0;
  const failures = [];

  for (let i = 0; i < data.length; i++) {
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
      const ai = await provider.enrich(entry);
      results.push({ ...entry, ai });
      ok++;
      emitLog(emitter, 'info', `[OK] ${label} -> ${ai.property_type ?? '?'} / ${ai.price_in_million ?? ai.price_per_meter ?? 'no price'}`);
    } catch (e) {
      results.push({ ...entry, ai: null, aiError: e.message });
      failures.push({ sourceFile: entry.sourceFile, error: e.message });
      emitLog(emitter, 'error', `[FAIL] ${label}: ${e.message}`);
    }
    fs.writeFileSync(AI_FILE, JSON.stringify(results, null, 2), 'utf8');
    await new Promise((r) => setTimeout(r, provider.pacingMs()));
  }

  fs.writeFileSync(AI_FILE, JSON.stringify(results, null, 2), 'utf8');
  emitLog(emitter, 'info', `\nDone. OK: ${ok}, Failed: ${failures.length}`);
  emitLog(emitter, 'info', `Output: ${AI_FILE}`);
  if (failures.length) {
    emitLog(emitter, 'warn', '\nFailures:');
    failures.forEach((f) => emitLog(emitter, 'warn', `  - ${f.sourceFile}: ${f.error}`));
  }

  return { results, ok, failed: failures.length, output: AI_FILE };
}

// ---- Stage 3: database sync ----
// Port of src/scripts/stage1_loaddb.js (full sync + upsert).
export async function dbStage({ config, emitter }) {
  emitLog(emitter, 'info', 'Loading properties into PostgreSQL...');
  const count = await loadFromJsonFiles(process.cwd(), config.db);
  emitLog(emitter, 'info', `Done. Total rows in DB: ${count}`);
  return { count };
}

// ---- Stage 4: Excel copy fill ----
// Port of src/scripts/stage2_fill.js (never touches the template).
export async function fillStage({ config, emitter }) {
  const data = JSON.parse(fs.readFileSync(AI_FILE, 'utf8')).filter((d) => d.ai);
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
// Port of src/scripts/fill_original.mjs.
export async function fillOriginalStage({ config, emitter }) {
  const data = JSON.parse(fs.readFileSync(AI_FILE, 'utf8')).filter((d) => d.ai);
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
