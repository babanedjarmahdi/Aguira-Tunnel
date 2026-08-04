import dotenv from 'dotenv';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import {
  runPipeline, createEmitter, loadConfig, createJob, getJob, listJobs, updateJob, pushJobLog,
  buildDraft, getDraft, applyDraft, createWatchService, JOBS_DIR, UPLOADS_DIR,
} from '@terraflow/engine';
import { inspectExcel, buildMapping } from '@terraflow/excel';
import { createDb } from '@terraflow/database';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const EVENT_NAMES = [
  'log',
  'stage:start',
  'stage:progress',
  'stage:end',
  'stage:error',
  'pipeline:complete',
  'pipeline:error',
];

// ---- Job service ----------------------------------------------------------
// Persists Jobs, runs the engine in the background, and fans structured events
// out to SSE subscribers. The engine stays UI-agnostic; this is the adapter.
class JobService {
  constructor(env) {
    this.env = env;
    this.events = new EventEmitter();
    this.history = [];
    this.running = new Map();
    this.currentJobId = null;
  }

  broadcast(name, payload) {
    const entry = { type: name, payload, ts: new Date().toISOString() };
    this.history.push(entry);
    if (this.history.length > 5000) this.history.shift();
    this.events.emit(name, entry);
  }

  isRunning(jobId) {
    return this.running.has(jobId);
  }

  run(job, stages) {
    if (this.running.has(job.id)) return false;
    this.running.set(job.id, true);
    this.currentJobId = job.id;
    const t0 = Date.now();

    updateJob(job.id, { status: 'running', currentStage: null, startedAt: new Date().toISOString(), finishedAt: null, error: null });
    this.broadcast('job:start', { jobId: job.id, stages });

    const emitter = createEmitter();
    const wrap = (name) => (payload) => {
      const entry = { ...payload, jobId: job.id };
      if (name === 'log') pushJobLog(job.id, { level: payload.level, message: payload.message });
      this.broadcast(name, entry);
      if (name === 'stage:start') updateJob(job.id, { currentStage: payload.stage });
      if (name === 'stage:end') this.applyStageCounters(job.id, payload.stage, payload.result);
    };
    for (const n of EVENT_NAMES) emitter.on(n, wrap(n));

    runPipeline({ job, stages, env: this.env, emitter })
      .then(({ summary }) => {
        this.running.delete(job.id);
        if (this.currentJobId === job.id) this.currentJobId = null;
        updateJob(job.id, {
          status: 'completed', currentStage: null, finishedAt: new Date().toISOString(),
          durationMs: Date.now() - t0, summary,
        });
        this.broadcast('job:end', { jobId: job.id, summary });
      })
      .catch((err) => {
        this.running.delete(job.id);
        if (this.currentJobId === job.id) this.currentJobId = null;
        const msg = String(err && (err.stack || err.message) || err);
        updateJob(job.id, {
          status: 'failed', currentStage: null, finishedAt: new Date().toISOString(),
          durationMs: Date.now() - t0, error: msg,
        });
        this.broadcast('job:error', { jobId: job.id, error: msg });
      });
    return true;
  }

  applyStageCounters(jobId, stage, result) {
    const patch = {};
    if (stage === 'extract' && result) {
      patch.recordsCreated = result.properties?.length ?? 0;
      patch.processedFiles = result.copied ?? 0;
      patch.warnings = result.failures?.length ?? 0;
    }
    if (stage === 'ai' && result) {
      patch.recordsUpdated = result.ok ?? 0;
      patch.errors = result.failed ?? 0;
      patch.aiUncertainties = result.failed ?? 0;
    }
    if (stage === 'db' && result) patch.recordsInDb = result.count ?? 0;
    if (Object.keys(patch).length) updateJob(jobId, patch);
  }

  status() {
    const jobs = listJobs(30);
    const lastJob = [...jobs].find((j) => j.status === 'completed' || j.status === 'failed') || jobs[0] || null;
    return {
      running: this.running.size > 0,
      currentJobId: this.currentJobId,
      currentStage: this.currentJobId ? getJob(this.currentJobId)?.currentStage : null,
      history: jobs,
      lastJob,
    };
  }
}

const service = new JobService(process.env);
const app = express();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(JOBS_DIR, { recursive: true });

app.use(express.json({ limit: '20mb' }));
app.use(express.static(publicDir));
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---- Core ----------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  let db = 'down';
  const client = createDb(process.env);
  try {
    await client.connect();
    await client.query('SELECT 1');
    db = 'up';
  } catch {
    db = 'down';
  } finally {
    await client.end().catch(() => {});
  }
  res.json({ status: 'ok', db, time: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  const c = loadConfig(process.env);
  res.json({
    sourceKmzDir: c.sourceKmzDir,
    doneKmzDir: c.doneKmzDir,
    templatePath: c.templatePath,
    originalPath: c.originalPath,
    excelOutputPath: c.excelOutputPath,
    ai: { provider: c.ai.provider, model: c.ai.model },
    db: {
      host: c.db.PGHOST || 'localhost',
      port: Number(c.db.PGPORT || 5432),
      database: c.db.PGDATABASE || 'terraflow',
    },
  });
});

app.get('/api/status', (req, res) => res.json(service.status()));

// ---- Uploads (raw KMZ file per request) ----------------------------------
app.post('/api/uploads', express.raw({ type: 'application/octet-stream', limit: '200mb' }), (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'Empty body' });
  const name = path.basename(String(req.query.name || 'upload.kmz'));
  const dest = path.join(UPLOADS_DIR, `${Date.now()}_${name}`);
  fs.writeFileSync(dest, req.body);
  res.status(201).json({ file: { name, path: dest, size: req.body.length } });
});

// ---- Excel inspect / mapping ---------------------------------------------
app.post('/api/excel/inspect', async (req, res) => {
  const templatePath = req.body?.templatePath || process.env.EXCEL_TEMPLATE;
  if (!templatePath) return res.status(400).json({ error: 'No template configured (EXCEL_TEMPLATE)' });
  try {
    res.json(await inspectExcel({ templatePath }));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.post('/api/excel/mapping', async (req, res) => {
  const templatePath = req.body?.templatePath || process.env.EXCEL_TEMPLATE;
  if (!templatePath) return res.status(400).json({ error: 'No template configured (EXCEL_TEMPLATE)' });
  try {
    res.json(await buildMapping({ templatePath }));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// ---- Jobs ----------------------------------------------------------------
app.post('/api/jobs', (req, res) => {
  const body = req.body || {};
  const steps = Array.isArray(body.steps) && body.steps.length ? body.steps : null;
  const job = createJob({
    workflowType: body.workflowType || 'basic',
    steps,
    input: {
      files: Array.isArray(body.input?.files) ? body.input.files : undefined,
      sourceDir: body.input?.sourceDir || undefined,
    },
    destination: {
      templatePath: body.destination?.templatePath || undefined,
      mode: body.destination?.mode || 'copy',
      outputPath: body.destination?.outputPath || undefined,
    },
    autoApply: !!body.autoApply,
  });
  service.broadcast('job:create', { jobId: job.id, job });
  const started = service.run(job, steps);
  res.status(201).json({ job, started });
});

app.get('/api/jobs', (req, res) => {
  res.json(listJobs(Number(req.query.limit) || 50));
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: `Job ${req.params.id} not found` });
  res.json(job);
});

app.post('/api/jobs/:id/run', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: `Job ${req.params.id} not found` });
  const stages = Array.isArray(req.body?.stages) && req.body.stages.length ? req.body.stages : job.steps;
  const started = service.run(job, stages);
  if (!started) return res.status(409).json({ error: 'Job already running' });
  res.status(202).json({ jobId: job.id, stages, started: true });
});

app.post('/api/jobs/:id/draft', async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: `Job ${req.params.id} not found` });
  try {
    const draft = await buildDraft(job.id, { mode: req.body?.mode || 'copy', templatePath: req.body?.templatePath });
    service.broadcast('draft:ready', { jobId: job.id, rows: draft.rows.length, startRow: draft.startRow });
    res.json(draft);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.get('/api/jobs/:id/draft', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: `Job ${req.params.id} not found` });
  const draft = getDraft(job.id);
  if (!draft) return res.status(404).json({ error: 'No draft yet — POST /draft to build one' });
  res.json(draft);
});

app.post('/api/jobs/:id/apply', async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: `Job ${req.params.id} not found` });
  try {
    const result = await applyDraft(job.id, {
      mode: req.body?.mode || null,
      templatePath: req.body?.templatePath || null,
      outputName: req.body?.outputName || null,
    });
    service.broadcast('apply:done', { jobId: job.id, outputPath: result.outputPath, rows: result.rows });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.get('/api/jobs/:id/download', (req, res) => {
  const job = getJob(req.params.id);
  if (!job || !job.output) return res.status(404).json({ error: 'No output for this job yet' });
  const file = req.query.file === 'backup' && job.output.backup ? job.output.backup : job.output.outputPath;
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'Output file missing on disk' });
  res.download(file, path.basename(file));
});

// ---- Watch ---------------------------------------------------------------
const watchService = createWatchService({
  watchDir: process.env.SOURCE_KMZ_DIR,
  log: (msg) => service.broadcast('watch:log', { message: msg }),
  onSync: (reason) => {
    const job = createJob({
      workflowType: 'watch-sync',
      input: { sourceDir: process.env.SOURCE_KMZ_DIR },
      steps: ['extract', 'ai', 'db'],
      destination: { mode: 'copy' },
    });
    service.broadcast('watch:change', { jobId: job.id, reason });
    service.run(job, null);
  },
});

app.get('/api/watch', (req, res) => res.json(watchService.status()));

// ---- Properties (read from Postgres) -------------------------------------
app.get('/api/properties', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 1000);
  const client = createDb(process.env);
  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT id, source_file, placemark_idx, name, area_m2, property_type, status, location,
              price, price_note, owner_name, owner_phone, lat, lon, created_at
       FROM properties ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    await client.end().catch(() => {});
  }
});

// ---- SSE ----------------------------------------------------------------
// /api/pipeline/events: replay all buffered events, then stream live.
// /api/jobs/events:      same, optionally filtered by ?jobId=.
function sse(req, res) {
  const jobId = req.query.jobId ? Number(req.query.jobId) : null;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(': connected\n\n');
  const match = (entry) => !jobId || entry.payload?.jobId === jobId;
  for (const entry of service.history) {
    if (match(entry)) res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }
  const names = [...EVENT_NAMES, 'job:create', 'job:start', 'job:end', 'job:error', 'draft:ready', 'apply:done', 'watch:change', 'watch:log'];
  const listeners = {};
  for (const n of names) {
    listeners[n] = (entry) => {
      if (match(entry)) res.write(`data: ${JSON.stringify(entry)}\n\n`);
    };
    service.events.on(n, listeners[n]);
  }
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    for (const n of names) service.events.removeListener(n, listeners[n]);
  });
}

app.get('/api/pipeline/events', sse);
app.get('/api/jobs/events', sse);

// ---- Legacy: start the default pipeline (extract->ai->db->fill) ----------
app.post('/api/pipeline', (req, res) => {
  const stages = Array.isArray(req.body?.stages) && req.body.stages.length
    ? req.body.stages
    : ['extract', 'ai', 'db', 'fill'];
  const job = createJob({
    workflowType: 'legacy',
    steps: stages,
    input: { sourceDir: process.env.SOURCE_KMZ_DIR },
    destination: { mode: 'copy' },
    autoApply: true,
  });
  const started = service.run(job, stages);
  if (!started) return res.status(409).json({ error: 'Pipeline already running' });
  res.status(202).json({ status: 'started', stages, jobId: job.id });
});

app.use((req, res) => res.status(404).json({ error: `No route: ${req.method} ${req.path}` }));

app.listen(PORT, () => {
  console.log(`TerraFlow API listening on http://localhost:${PORT}`);
  console.log(`  GET  /api/health | /api/config | /api/status | /api/properties`);
  console.log(`  POST /api/uploads | /api/excel/inspect | /api/excel/mapping`);
  console.log(`  GET  /api/jobs | /api/jobs/:id | /api/watch`);
  console.log(`  POST /api/jobs | /api/jobs/:id/run | /api/jobs/:id/draft | /api/jobs/:id/apply`);
  console.log(`  GET  /api/jobs/:id/download | /api/jobs/:id/draft`);
  console.log(`  GET  /api/pipeline/events | /api/jobs/events  (SSE)`);
});
