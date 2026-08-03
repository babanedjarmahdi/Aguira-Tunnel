import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const watchDir = process.env.SOURCE_KMZ_DIR;
const logFile = path.join(ROOT, 'output', 'watcher.log');

let timer = null;
let running = false;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, line + '\n', 'utf8');
}

function runStep(name, script, quiet = true) {
  const cmd = process.execPath;
  const args = [path.join(ROOT, 'src', 'scripts', script)];
  log(`RUN ${name}: ${script}`);
  const out = execSync(`${JSON.stringify(cmd)} ${args.map((a) => JSON.stringify(a)).join(' ')}`, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (!quiet) log(out);
  log(`DONE ${name}`);
}

function runPipeline(reason) {
  if (running) {
    log(`Pipeline already running (skip ${reason})`);
    return;
  }
  running = true;
  try {
    log(`=== SYNC START (${reason}) ===`);
    runStep('extract', 'stage1_extract.js');
    runStep('ai', 'stage2_ai.js');
    runStep('db', 'stage1_loaddb.js');
    runStep('excel', 'stage2_fill.js');
    const filled = path.join(ROOT, 'output', 'excel', 'CRM_GPT_Immobilier_Employees_V8_10_2_2_filled.xlsx');
    if (fs.existsSync(filled)) {
      fs.copyFileSync(filled, path.join(path.dirname(filled), 'CRM_GPT_Immobilier_Employees_V8_10_2_2_filled.xlsx'));
      log('Excel copy refreshed.');
    }
    log('=== SYNC COMPLETE ===');
  } catch (e) {
    log(`SYNC ERROR: ${e.message}`);
  } finally {
    running = false;
  }
}

function schedule(reason) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => runPipeline(reason), 1500);
}

if (!fs.existsSync(watchDir)) {
  log(`Watch dir not found: ${watchDir}`);
  process.exit(1);
}

log(`Watching ${watchDir} for .kmz changes...`);

const watcher = fs.watch(watchDir, { persistent: true }, (eventType, filename) => {
  if (!filename || !filename.toLowerCase().endsWith('.kmz')) return;
  const full = path.join(watchDir, filename);
  const exists = fs.existsSync(full);
  const reason = exists ? `add/modify: ${filename}` : `remove: ${filename}`;
  log(`Change detected: ${reason}`);
  schedule(reason);
});

watcher.on('error', (e) => log(`Watcher error: ${e.message}`));

process.on('SIGINT', () => {
  log('Stopping watcher.');
  watcher.close();
  process.exit(0);
});

// Run once at startup to bring everything in sync
schedule('startup');
