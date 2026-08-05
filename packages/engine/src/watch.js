import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runPipeline } from './orchestrator.js';
import { createEmitter } from './events.js';
import { createJob, getJob, updateJob } from './jobs.js';
import { listWatchers, getWatcher, pushWatcherHistory } from './watchers.js';
import { activeTemplatePath } from './templates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

// Persistent per-watcher sync state (AI cache + Excel row mapping) lives here,
// so each sync is incremental instead of re-enriching the whole folder.
const WATCHES_DIR = path.join(ROOT, 'output', 'watches');
export function watcherStateDir(id) {
  return path.join(WATCHES_DIR, String(id));
}

// Debounced folder/file watcher. UI-agnostic: the caller decides what to do on
// sync (create a job, run the pipeline, log). Start/stop is explicit so the
// API and UI can toggle watch mode.
//   watchPath: folder to watch for .kmz, or a single file to watch.
//   type:      'folder' (default) | 'file'
export function createWatchService({ watchDir = null, watchPath = null, type = 'folder', onSync, log = console.log, debounceMs = 1500, autoStart = false } = {}) {
  const target = watchPath || watchDir || null;
  const isFile = type === 'file';
  const effectivePath = target;
  let timer = null;
  let watcher = null;
  let started = false;
  let closed = false;

  function schedule(reason) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onSync(reason), debounceMs);
  }

  function matches(filename) {
    if (!filename) return false;
    if (isFile) return path.basename(filename) === path.basename(effectivePath);
    return filename.toLowerCase().endsWith('.kmz');
  }

  function start() {
    if (closed || started) return started;
    if (!effectivePath || !fs.existsSync(effectivePath)) {
      log(`Cannot watch: ${effectivePath ? `path not found: ${effectivePath}` : 'no watch path configured'}`);
      return false;
    }
    started = true;
    log(`Watching ${effectivePath}${isFile ? ' (file)' : ' for .kmz changes'}...`);
    const watchedDir = isFile ? path.dirname(effectivePath) : effectivePath;
    watcher = fs.watch(watchedDir, { persistent: true }, (eventType, filename) => {
      if (!started) return;
      if (!matches(filename)) return;
      const full = isFile ? effectivePath : path.join(effectivePath, filename);
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
      enabled: !!effectivePath && fs.existsSync(effectivePath),
      watching: started,
      path: effectivePath || null,
      type: isFile ? 'file' : 'folder',
      debounceMs,
    };
  }

  if (autoStart) start();

  return { start, stop, close, status };
}

// Manages persisted watchers as first-class items: one debounced watch service
// per watcher, run-on-startup at boot, per-watcher history updated when each
// sync job finishes. createJob/runJob are injected by the adapter (server/CLI).
export function createWatcherManager({ log = console.log, createJob: makeJob, runJob } = {}) {
  const services = new Map();
  const busy = new Map();
  const pending = new Map();

  function buildService(w) {
    return createWatchService({
      watchPath: w.path,
      type: w.type,
      debounceMs: w.debounceMs,
      log: (msg) => log(`[watcher #${w.id} ${w.name}] ${msg}`),
      onSync: (reason) => sync(w, reason),
    });
  }

  function start(id) {
    const w = getWatcher(id);
    if (!w) return { ok: false, error: `Watcher ${id} not found` };
    let svc = services.get(w.id);
    if (!svc) { svc = buildService(w); services.set(w.id, svc); }
    const ok = svc.start();
    if (!ok && !w.path) return { ok: false, error: 'No watch path set' };
    if (!ok) return { ok: false, error: `Path not found: ${w.path}` };
    return { ok: true, ...svc.status() };
  }

  function stop(id) {
    const svc = services.get(Number(id));
    if (svc) svc.stop();
    return { ok: true };
  }

  async function sync(w, reason) {
    if (busy.get(w.id)) { pending.set(w.id, true); return; }
    busy.set(w.id, true);
    const startedAt = new Date().toISOString();
    const destination = buildDestination(w);

    // Fail fast if the destination workbook is missing/broken — otherwise the
    // whole folder re-runs through AI and only then discovers the file is gone.
    const dest = destination.mode === 'original' ? destination.originalPath : destination.templatePath;
    if (dest && !fs.existsSync(dest)) {
      log(`[watcher #${w.id} ${w.name}] DESTINATION FILE NOT FOUND: ${dest} — sync skipped`);
      pushWatcherHistory(w.id, {
        startedAt,
        finishedAt: new Date().toISOString(),
        jobId: null,
        status: 'failed',
        reason: `destination file not found: ${dest}`,
        records: 0,
        files: 0,
      });
      busy.set(w.id, false);
      if (pending.get(w.id)) { pending.set(w.id, false); sync(w, 'pending change'); }
      return;
    }

    const job = makeJob({
      workflowType: 'watch-sync',
      watcherId: w.id,
      input: { sourceDir: w.type === 'file' ? path.dirname(w.path) : w.path },
      steps: w.steps,
      autoApply: w.autoApply,
      destination,
      ai: w.ai || undefined,
    });
    const watchDir = watcherStateDir(w.id);
    updateJob(job.id, {
      watch: {
        dir: watchDir,
        aiPath: path.join(watchDir, 'ai.json'),
        excelStatePath: path.join(watchDir, 'excel-state.json'),
      },
    });
    log(`[watcher #${w.id} ${w.name}] SYNC START (${reason}) job #${job.id}`);
    let status = 'failed';
    try {
      const result = await runJob(job);
      status = result?.status || 'failed';
    } catch {
      status = 'failed';
    }
    const j = getJob(job.id);
    pushWatcherHistory(w.id, {
      startedAt,
      finishedAt: new Date().toISOString(),
      jobId: job.id,
      status,
      reason,
      records: j?.recordsCreated ?? 0,
      files: j?.processedFiles ?? 0,
    });
    log(`[watcher #${w.id} ${w.name}] SYNC ${status.toUpperCase()} (job #${job.id})`);
    busy.set(w.id, false);
    if (pending.get(w.id)) { pending.set(w.id, false); sync(w, 'pending change'); }
  }

  function syncNow(id) {
    const w = getWatcher(id);
    if (!w) return { ok: false, error: `Watcher ${id} not found` };
    sync(w, 'manual');
    return { ok: true };
  }

  function statusList() {
    return listWatchers().map((w) => {
      const svc = services.get(w.id);
      const st = svc ? svc.status() : null;
      return {
        ...w,
        runtime: {
          watching: !!st?.watching,
          enabled: !!st?.enabled,
          busy: !!busy.get(w.id),
          pending: !!pending.get(w.id),
        },
      };
    });
  }

  // Resolve the workbook the watcher fills/modifies: a registered template's
  // active version, an explicit file path, or the global default. In "modify
  // existing" mode the explicit path (or the template's active file) is the
  // file written in place, backed up first.
  function buildDestination(w) {
    const d = { mode: w.mode || 'copy' };
    const warn = (msg) => log(`[watcher #${w.id} ${w.name}] WARN ${msg}`);
    if (w.mode === 'original') {
      if (w.targetPath) {
        d.originalPath = w.targetPath;
      } else if (w.templateId) {
        try {
          d.originalPath = activeTemplatePath(w.templateId);
          d.templateId = w.templateId;
        } catch {
          warn(`template ${w.templateId} not found — falling back to default workbook`);
        }
      }
      return d;
    }
    if (w.templateId) {
      try {
        d.templatePath = activeTemplatePath(w.templateId);
        d.templateId = w.templateId;
      } catch {
        warn(`template ${w.templateId} not found — falling back to default workbook`);
      }
    } else if (w.targetPath) {
      d.templatePath = w.targetPath;
    }
    return d;
  }

  function statusOf(id) {
    const w = getWatcher(id);
    if (!w) return null;
    return statusList().find((x) => x.id === w.id) || w;
  }

  // Start every watcher flagged runOnStartup (called once on server boot).
  function boot() {
    for (const w of listWatchers()) {
      if (w.runOnStartup && w.path) {
        const r = start(w.id);
        if (r.ok) log(`[watcher #${w.id} ${w.name}] auto-started (runOnStartup)`);
      }
    }
    return statusList();
  }

  return { boot, start, stop, syncNow, statusList, statusOf };
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
