import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runPipeline } from './orchestrator.js';
import { createEmitter } from './events.js';
import { createJob } from './jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

// Watch a directory for .kmz changes and fire a debounced callback.
// UI-agnostic: the caller decides what to do on sync (create a job, run the
// pipeline, log). The CLI watch command and the REST API both use this.
// Start/stop is explicit so the API and UI can toggle watch mode.
export function createWatchService({ watchDir, onSync, log = console.log, debounceMs = 1500, autoStart = false } = {}) {
  let timer = null;
  let watcher = null;
  let started = false;
  let closed = false;

  function schedule(reason) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onSync(reason), debounceMs);
  }

  function start() {
    if (closed || started) return started;
    if (!watchDir || !fs.existsSync(watchDir)) {
      log(`Cannot watch: ${watchDir ? `dir not found: ${watchDir}` : 'no SOURCE_KMZ_DIR configured'}`);
      return false;
    }
    started = true;
    log(`Watching ${watchDir} for .kmz changes...`);
    watcher = fs.watch(watchDir, { persistent: true }, (eventType, filename) => {
      if (!started) return;
      if (!filename || !filename.toLowerCase().endsWith('.kmz')) return;
      const full = path.join(watchDir, filename);
      const exists = fs.existsSync(full);
      const reason = exists ? `add/modify: ${filename}` : `remove: ${filename}`;
      log(`Change detected: ${reason}`);
      schedule(reason);
    });
    watcher.on('error', (e) => log(`Watcher error: ${e.message}`));
    return true;
  }

  function stop() {
    started = false;
    if (timer) { clearTimeout(timer); timer = null; }
    if (watcher) { try { watcher.close(); } catch { /* already closed */ } watcher = null; }
    return true;
  }

  function close() {
    closed = true;
    stop();
  }

  function status() {
    return {
      enabled: !!watchDir && fs.existsSync(watchDir),
      watching: started,
      watchDir: watchDir || null,
      debounceMs,
    };
  }

  if (autoStart) start();

  return { start, stop, close, status };
}

// CLI-friendly auto-run: watch the source dir and run the full pipeline
// (including Excel fill) on every change batch, just like the legacy watcher.
export function runWatcher({ emitter = createEmitter() } = {}) {
  const logFile = path.join(ROOT, 'output', 'watcher.log');
  function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, line + '\n', 'utf8');
  }

  const service = createWatchService({
    watchDir: process.env.SOURCE_KMZ_DIR,
    log,
    onSync: async (reason) => {
      const job = createJob({ workflowType: 'watch-sync', input: { sourceDir: process.env.SOURCE_KMZ_DIR }, autoApply: true });
      log(`=== SYNC START (${reason}) job #${job.id} ===`);
      try {
        const { summary } = await runPipeline({ job, emitter });
        log(`=== SYNC COMPLETE (job #${job.id}, ok: ${summary.ok.join(', ') || 'none'}) ===`);
      } catch (e) {
        log(`SYNC ERROR: ${e.message}`);
      }
    },
  });

  log('Watcher ready.');
  return service;
}
