import dotenv from 'dotenv';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import express from 'express';
import {
  runPipeline, createEmitter, loadConfig, createJob, getJob, listJobs, updateJob, pushJobLog,
  buildDraft, getDraft, applyDraft, createWatchService, createWatcherManager, JOBS_DIR, UPLOADS_DIR, MAPPINGS_DIR,
  createWorkflow, getWorkflow, listWorkflows, updateWorkflow, deleteWorkflow, markWorkflowRun,
  duplicateWorkflow, exportWorkflow, importWorkflow,
  createWatcher, getWatcher, listWatchers, updateWatcher, deleteWatcher, clearWatcherHistory,
  loadAiSettings, saveAiSettings, AI_DEFAULTS,
  listTemplates, getTemplate, registerTemplate, updateTemplate, deleteTemplate,
  templateVersionPath, activeTemplatePath,
} from '@terraflow/engine';
import { testAiConnection, GROQ_FREE_MODELS } from '@terraflow/ai';
import { inspectExcel, buildMapping, saveMappingProfile } from '@terraflow/excel';
import { createDb } from '@terraflow/database';
import { sendTelegram, startBridge } from '../../../scripts/telegram-bridge.mjs';

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
    this.controllers = new Map();
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

  cancel(jobId) {
    const controller = this.controllers.get(jobId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  // Called on boot: any job left 'running' by a previous process never gets a
  // terminal update, so mark it failed and reflect that on its workflow.
  recover() {
    for (const job of listJobs(200)) {
      if (job.status === 'running' || job.status === 'queued') {
        updateJob(job.id, {
          status: 'failed', currentStage: null, finishedAt: new Date().toISOString(),
          error: 'Interrupted - leftover from a stopped server process',
        });
        if (job.workflowId) markWorkflowRun(job.workflowId, job.id, 'failed');
        this.broadcast('job:error', { jobId: job.id, error: 'Interrupted - leftover from a stopped server process' });
      }
    }
  }

  run(job, stages) {
    if (this.running.has(job.id)) return false;
    const controller = new AbortController();
    this.running.set(job.id, true);
    this.controllers.set(job.id, controller);
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

    const finish = (status, patch, eventName) => {
      this.running.delete(job.id);
      this.controllers.delete(job.id);
      if (this.currentJobId === job.id) this.currentJobId = null;
      updateJob(job.id, { status, currentStage: null, finishedAt: new Date().toISOString(), durationMs: Date.now() - t0, ...patch });
      if (job.workflowId) markWorkflowRun(job.workflowId, job.id, status);
      this.broadcast(eventName, { jobId: job.id, ...patch });
      notifyTelegram(job, status, patch);
    };

    // Push a job-done notification to the user's Telegram chat (best effort,
    // never blocks the job pipeline; only enabled when TELEGRAM_BOT_TOKEN set).
    const notifyTelegram = async (job, status, patch) => {
      if (!process.env.TELEGRAM_BOT_TOKEN) return;
      const icon = status === 'completed' ? '✅' : status === 'canceled' ? '⏹️' : '❌';
      const secs = job.durationMs != null ? (job.durationMs / 1000).toFixed(1) : '—';
      const summary = patch.summary ? `\nOK: ${patch.summary.ok ?? '—'} · Failed: ${patch.summary.failed ?? '—'}` : '';
      const lines = [
        `${icon} Job #${job.id} ${status.toUpperCase()}`,
        `Type: ${job.workflowType}`,
        `Records: ${job.recordsCreated ?? 0} · Errors: ${job.errors ?? 0}`,
        `Duration: ${secs}s`,
        summary,
      ].filter(Boolean);
      try { await sendTelegram(lines.join('\n'), { silent: status === 'completed' }); }
      catch (e) { console.error('telegram notify error:', e.message); }
    };

    return runPipeline({ job, stages, env: this.env, emitter, signal: controller.signal })
      .then(({ summary }) => {
        finish('completed', { summary }, 'job:end');
        return { status: 'completed', jobId: job.id, summary };
      })
      .catch((err) => {
        if (err?.name === 'AbortError') {
          const msg = 'Canceled by user';
          pushJobLog(job.id, { level: 'warn', message: msg });
          finish('canceled', { error: msg }, 'job:canceled');
          return { status: 'canceled', jobId: job.id, error: msg };
        }
        const msg = String(err && (err.stack || err.message) || err);
        finish('failed', { error: msg }, 'job:error');
        return { status: 'failed', jobId: job.id, error: msg };
      });
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
service.recover();
const app = express();
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(JOBS_DIR, { recursive: true });

app.use(express.json({ limit: '20mb' }));
app.use(express.static(publicDir));
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
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

// ---- AI settings (Professional mode) -------------------------------------
const AI_SETTING_KEYS = ['provider', 'model', 'apiKey', 'baseUrl', 'temperature', 'maxTokens', 'prompt', 'pacingTokensPerRequest', 'pacingTpmLimit'];
const AI_NUMERIC_KEYS = ['temperature', 'maxTokens', 'pacingTokensPerRequest', 'pacingTpmLimit'];

function publicAiSettings() {
  const ai = loadConfig(process.env).ai;
  const saved = loadAiSettings();
  const key = ai.apiKey || '';
  return {
    provider: ai.provider,
    model: ai.model,
    baseUrl: ai.baseUrl,
    temperature: ai.temperature,
    maxTokens: ai.maxTokens,
    prompt: ai.prompt || '',
    pacingTokensPerRequest: ai.pacingTokensPerRequest,
    pacingTpmLimit: ai.pacingTpmLimit,
    apiKeySet: key.length > 0,
    apiKeyHint: key.length > 4 ? `••••${key.slice(-4)}` : '',
    source: saved ? 'settings' : 'env',
    updatedAt: saved?.updatedAt || null,
    models: GROQ_FREE_MODELS,
    defaults: AI_DEFAULTS,
  };
}

app.get('/api/settings/ai', (req, res) => res.json(publicAiSettings()));

app.put('/api/settings/ai', (req, res) => {
  const body = req.body || {};
  const patch = {};
  for (const k of AI_SETTING_KEYS) {
    if (body[k] === undefined) continue;
    patch[k] = AI_NUMERIC_KEYS.includes(k) && body[k] !== '' ? Number(body[k]) : body[k];
  }
  if (patch.provider !== undefined && patch.provider !== 'groq') {
    return res.status(400).json({ error: `Unsupported AI provider: "${patch.provider}". Supported: groq` });
  }
  if (patch.model !== undefined && !GROQ_FREE_MODELS.includes(patch.model)) {
    return res.status(400).json({ error: `Model "${patch.model}" is not on the Groq free tier. Pick one of: ${GROQ_FREE_MODELS.join(', ')}` });
  }
  if (patch.temperature !== undefined && (Number.isNaN(patch.temperature) || patch.temperature < 0 || patch.temperature > 2)) {
    return res.status(400).json({ error: 'temperature must be a number between 0 and 2' });
  }
  try {
    saveAiSettings(patch);
    res.json(publicAiSettings());
  } catch (e) {
    res.status(500).json({ error: `Failed to save AI settings: ${e.message}` });
  }
});

app.post('/api/settings/ai/test', async (req, res) => {
  const saved = loadConfig(process.env).ai;
  const body = req.body || {};
  const result = await testAiConnection({
    provider: body.provider || saved.provider,
    model: body.model || saved.model,
    baseUrl: body.baseUrl || saved.baseUrl,
    apiKey: body.apiKey || saved.apiKey,
  });
  res.json(result);
});

// ---- Excel templates (Professional mode) ----------------------------------
app.get('/api/templates', (req, res) => {
  res.json({ templates: listTemplates() });
});

app.post('/api/templates', async (req, res) => {
  const { name, file } = req.body || {};
  try {
    const template = await registerTemplate({ name, filePath: file?.path });
    res.status(201).json({ template });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/templates/:id', (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json({ template });
});

app.put('/api/templates/:id', async (req, res) => {
  try {
    const template = await updateTemplate(req.params.id, req.body || {});
    res.json({ template });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/templates/:id', (req, res) => {
  try {
    res.json(deleteTemplate(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/templates/:id/versions/:v/download', (req, res) => {
  try {
    res.download(templateVersionPath(req.params.id, req.params.v));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// Build the grounded field->column mapping for the active workbook
// (reuses the wizard's mapping engine; returns validation + autoCreate).
app.post('/api/templates/:id/map', async (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  try {
    const result = await buildMapping({ templatePath: activeTemplatePath(req.params.id), profilesDir: MAPPINGS_DIR });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
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
    res.json(await buildMapping({ templatePath, profilesDir: MAPPINGS_DIR }));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// Save the (validated) mapping as the template's profile for reuse.
app.post('/api/excel/mapping/profile', async (req, res) => {
  const templatePath = req.body?.templatePath || process.env.EXCEL_TEMPLATE;
  if (!templatePath) return res.status(400).json({ error: 'No template configured (EXCEL_TEMPLATE)' });
  try {
    const { mapping, sheet } = await buildMapping({ templatePath, profilesDir: MAPPINGS_DIR });
    const profile = saveMappingProfile({ templatePath, mapping, sheet, profilesDir: MAPPINGS_DIR });
    service.broadcast('mapping:saved', { templatePath, columns: mapping.length });
    res.status(201).json(profile);
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
    workflowId: body.workflowId || null,
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

// Aggregated PERSISTED log viewer feed: every log entry the engine ever pushed
// to a job (from output/jobs/jobs.json), newest first. Supports level filter,
// free-text search and JSON/text export — the professional log viewer.
app.get('/api/logs', (req, res) => {
  const limit = Number(req.query.limit) || 1000;
  const level = String(req.query.level || '').toLowerCase();
  const q = String(req.query.q || '').toLowerCase();
  const jobs = listJobs(2000);
  const rows = [];
  for (const job of jobs) {
    if (!Array.isArray(job.log)) continue;
    const jobLabel = `#${job.id}${job.workflowType ? ` · ${job.workflowType}` : ''}`;
    for (const e of job.log) {
      const message = String(e.message || '');
      if (level && e.level !== level) continue;
      if (q && !(message.toLowerCase().includes(q) || jobLabel.toLowerCase().includes(q) || String(job.status).includes(q))) continue;
      rows.push({ jobId: job.id, jobLabel, status: job.status, level: e.level, message, ts: e.ts });
    }
  }
  rows.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  res.json({
    total: rows.length,
    logs: rows.slice(0, limit),
    jobs: jobs.length,
    persistedFrom: jobs[0]?.createdAt || null,
  });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: `Job ${req.params.id} not found` });
  res.json(job);
});

// Re-run an existing (terminal) job: clone its config into a NEW job so run
// history keeps one row per attempt, then start it. Watch-sync jobs re-run
// against their stored folder/state paths via the same stages.
app.post('/api/jobs/:id/re-run', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: `Job ${req.params.id} not found` });
  if (job.status === 'running' || job.status === 'queued') {
    return res.status(409).json({ error: `Job ${job.id} is still ${job.status}` });
  }
  const rerun = createJob({
    workflowType: job.workflowType,
    workflowId: job.workflowId,
    watcherId: job.watcherId,
    steps: job.steps,
    input: job.input || undefined,
    destination: job.destination || undefined,
    ai: job.ai || undefined,
    autoApply: job.autoApply,
  });
  const started = service.run(rerun, job.steps);
  res.status(201).json({ job, started });
});

app.post('/api/jobs/:id/run', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: `Job ${req.params.id} not found` });
  const stages = Array.isArray(req.body?.stages) && req.body.stages.length ? req.body.stages : job.steps;
  const started = service.run(job, stages);
  if (!started) return res.status(409).json({ error: 'Job already running' });
  res.status(202).json({ jobId: job.id, stages, started: true });
});

app.post('/api/jobs/:id/cancel', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: `Job ${req.params.id} not found` });
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'canceled') {
    return res.status(409).json({ error: `Job already ${job.status}` });
  }
  const ok = service.cancel(job.id);
  res.json({ jobId: job.id, cancelRequested: ok });
});

app.post('/api/jobs/:id/draft', async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: `Job ${req.params.id} not found` });
  try {
    const draft = await buildDraft(job.id, {
      mode: req.body?.mode || 'copy',
      templatePath: req.body?.templatePath,
      autoCreate: req.body?.autoCreate,
    });
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
      autoCreate: req.body?.autoCreate,
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

// ---- Workflows -----------------------------------------------------------
app.get('/api/workflows', (req, res) => res.json(listWorkflows()));

// Unified catalog: every workflow (import = one-shot, watch = background), type-tagged.
app.get('/api/workflows/all', (req, res) => {
  const imports = listWorkflows().map((w) => ({ ...w, type: 'import' }));
  const watches = watcherManager.statusList().map((w) => ({ ...w, type: 'watch' }));
  const all = [...imports, ...watches].sort((a, b) =>
    String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  res.json(all);
});

app.post('/api/workflows', (req, res) => {
  const body = req.body || {};
  try {
    const workflow = createWorkflow({
      name: body.name,
      workflowType: body.workflowType || 'basic',
      steps: body.steps,
      destination: body.destination || undefined,
      autoApply: !!body.autoApply,
      input: body.input || undefined,
      templateId: body.templateId || undefined,
      ai: body.ai || undefined,
    });
    res.status(201).json(workflow);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.post('/api/workflows/import', (req, res) => {
  try {
    const workflow = importWorkflow(req.body || {});
    res.status(201).json(workflow);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

app.get('/api/workflows/:id', (req, res) => {
  const workflow = getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: `Workflow ${req.params.id} not found` });
  res.json(workflow);
});

app.put('/api/workflows/:id', (req, res) => {
  const body = req.body || {};
  const workflow = updateWorkflow(req.params.id, body);
  if (!workflow) return res.status(404).json({ error: `Workflow ${req.params.id} not found` });
  res.json(workflow);
});

app.delete('/api/workflows/:id', (req, res) => {
  const ok = deleteWorkflow(req.params.id);
  if (!ok) return res.status(404).json({ error: `Workflow ${req.params.id} not found` });
  res.json({ ok: true });
});

// Run a workflow as a new job (workflow becomes the job's source of truth).
app.post('/api/workflows/:id/run', (req, res) => {
  const workflow = getWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: `Workflow ${req.params.id} not found` });
  const body = req.body || {};
  let templatePath = workflow.destination?.templatePath || undefined;
  if (workflow.templateId) {
    try {
      templatePath = activeTemplatePath(workflow.templateId);
    } catch {
      return res.status(400).json({ error: `Workflow template (${workflow.templateId}) not found in the template store` });
    }
  }
  const job = createJob({
    workflowType: workflow.workflowType,
    workflowId: workflow.id,
    steps: workflow.steps,
    input: {
      files: Array.isArray(body.input?.files) ? body.input.files : workflow.input?.files || undefined,
      sourceDir: body.input?.sourceDir || workflow.input?.sourceDir || undefined,
    },
    destination: {
      templatePath,
      templateId: workflow.templateId,
      mode: workflow.destination?.mode || 'copy',
      outputPath: workflow.destination?.outputPath || undefined,
    },
    ai: workflow.ai || undefined,
    autoApply: workflow.autoApply,
  });
  service.broadcast('job:create', { jobId: job.id, job });
  const started = service.run(job, workflow.steps);
  markWorkflowRun(workflow.id, job.id, started ? 'running' : 'queued');
  res.status(201).json({ job, started });
});

app.post('/api/workflows/:id/duplicate', (req, res) => {
  const workflow = duplicateWorkflow(req.params.id);
  if (!workflow) return res.status(404).json({ error: `Workflow ${req.params.id} not found` });
  res.status(201).json(workflow);
});

app.get('/api/workflows/:id/export', (req, res) => {
  const exported = exportWorkflow(req.params.id);
  if (!exported) return res.status(404).json({ error: `Workflow ${req.params.id} not found` });
  res.set('Content-Disposition', `attachment; filename="workflow-${req.params.id}.json"`);
  res.json(exported);
});

// ---- Watch ---------------------------------------------------------------
// Watch is user-controlled (start/stop via API + UI). Each debounced change
// batch creates a watch-sync job that runs extract → ai → db.
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

app.post('/api/watch/start', (req, res) => {
  const ok = watchService.start();
  if (!ok) return res.status(400).json({ error: 'Cannot start watch — check SOURCE_KMZ_DIR' });
  service.broadcast('watch:state', { watching: true });
  res.json(watchService.status());
});

app.post('/api/watch/stop', (req, res) => {
  watchService.stop();
  service.broadcast('watch:state', { watching: false });
  res.json(watchService.status());
});

// ---- File browser (local-first path picking) ------------------------------
// A small server-side explorer so the UI can pick absolute paths for watchers
// (folders/files) and destination workbooks. Local app, same machine.
app.get('/api/fs/roots', (req, res) => {
  const home = os.homedir();
  const roots = [];
  const push = (name, p) => { if (p && fs.existsSync(p)) roots.push({ name, path: p }); };
  for (const d of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const p = `${d}:\\`;
    if (fs.existsSync(p)) roots.push({ name: `${d}:\\`, path: p });
  }
  push('Desktop', path.join(home, 'Desktop'));
  push('Documents', path.join(home, 'Documents'));
  push('Downloads', path.join(home, 'Downloads'));
  push('Home', home);
  push('Source KMZ dir', process.env.SOURCE_KMZ_DIR);
  res.json({ roots, home });
});

app.get('/api/fs/list', (req, res) => {
  const target = String(req.query.path || '');
  let resolved = target;
  if (!resolved || resolved === '~') resolved = os.homedir();
  try {
    const st = fs.statSync(resolved);
    if (!st.isDirectory()) return res.status(400).json({ error: `Not a directory: ${resolved}` });
    const entries = fs.readdirSync(resolved, { withFileTypes: true })
      .filter((d) => !d.name.startsWith('~$')) // Office lock files
      .map((d) => {
        let size = 0;
        if (d.isFile()) { try { size = fs.statSync(path.join(resolved, d.name)).size; } catch { /* ignore */ } }
        return {
          name: d.name,
          type: d.isDirectory() ? 'dir' : d.isFile() ? 'file' : 'other',
          size,
          kmz: d.isFile() && d.name.toLowerCase().endsWith('.kmz'),
          xlsx: d.isFile() && /\.xlsx?$/i.test(d.name),
        };
      })
      .sort((a, b) => (a.type === 'dir' ? -1 : 1) - (b.type === 'dir' ? -1 : 1) || a.name.localeCompare(b.name));
    const parent = path.dirname(resolved);
    res.json({ path: resolved, parent, entries });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// ---- Managed watchers (first-class items) --------------------------------
// Watchers persist in output/jobs/watchers.json; each has its own debounced
// watch service, run-on-startup flag and run history. On a change batch a
// watch-sync job runs extract → ai → db using the watcher's config.
function validateWatcherDestination(body) {
  if (!body) return null;
  if (body.templateId) return null; // registered template wins
  if (!body.targetPath || !String(body.targetPath).trim()) return null;
  const p = String(body.targetPath).trim();
  const base = path.basename(p);
  if (base.startsWith('~$')) return `That is an Office lock/temp file (${base}) — pick the real .xlsx workbook instead.`;
  if (!fs.existsSync(p)) return `Destination file not found: ${p}`;
  return null;
}
const watcherManager = createWatcherManager({
  log: (msg) => {
    console.log(`[watch] ${msg}`);
    service.broadcast('watch:log', { message: msg });
  },
  createJob: (opts) => createJob(opts),
  runJob: (job) => service.run(job, job.steps),
});
watcherManager.boot();

app.get('/api/watchers', (req, res) => res.json(watcherManager.statusList()));

app.post('/api/watchers', (req, res) => {
  const err = validateWatcherDestination(req.body || {});
  if (err) return res.status(400).json({ error: err });
  const w = createWatcher(req.body || {});
  let started = null;
  if (w.runOnStartup && w.path) started = watcherManager.start(w.id);
  res.status(201).json(started ? { ...w, runtime: started } : watcherManager.statusOf(w.id));
});

app.get('/api/watchers/:id', (req, res) => {
  const w = watcherManager.statusOf(req.params.id);
  if (!w) return res.status(404).json({ error: `Watcher ${req.params.id} not found` });
  res.json(w);
});

app.put('/api/watchers/:id', (req, res) => {
  const err = validateWatcherDestination(req.body || {});
  if (err) return res.status(400).json({ error: err });
  const w = updateWatcher(req.params.id, req.body || {});
  if (!w) return res.status(404).json({ error: `Watcher ${req.params.id} not found` });
  res.json(watcherManager.statusOf(w.id));
});

app.delete('/api/watchers/:id', (req, res) => {
  watcherManager.stop(req.params.id);
  const ok = deleteWatcher(req.params.id);
  if (!ok) return res.status(404).json({ error: `Watcher ${req.params.id} not found` });
  res.json({ ok: true });
});

app.post('/api/watchers/:id/start', (req, res) => {
  const r = watcherManager.start(req.params.id);
  if (!r.ok) return res.status(400).json({ error: r.error || 'Cannot start watcher' });
  service.broadcast('watch:state', { watching: true, watcherId: Number(req.params.id) });
  res.json(watcherManager.statusOf(req.params.id));
});

app.post('/api/watchers/:id/stop', (req, res) => {
  watcherManager.stop(req.params.id);
  service.broadcast('watch:state', { watching: false, watcherId: Number(req.params.id) });
  res.json(watcherManager.statusOf(req.params.id));
});

app.post('/api/watchers/:id/sync', (req, res) => {
  const w = getWatcher(req.params.id);
  if (!w) return res.status(404).json({ error: `Watcher ${req.params.id} not found` });
  const r = watcherManager.syncNow(w.id);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ ok: true, job: 'queued', watcherId: w.id });
});

app.post('/api/watchers/:id/history/clear', (req, res) => {
  const ok = clearWatcherHistory(req.params.id);
  if (!ok) return res.status(404).json({ error: `Watcher ${req.params.id} not found` });
  res.json({ ok: true });
});

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
  const names = [...EVENT_NAMES, 'job:create', 'job:start', 'job:end', 'job:error', 'job:canceled', 'draft:ready', 'apply:done', 'watch:change', 'watch:log', 'watch:state'];
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
  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      startBridge();
      console.log('  Telegram bridge started — inbox: output/telegram/inbox.jsonl');
    } catch (e) {
      console.error('  Telegram bridge failed to start:', e.message);
    }
  }
  console.log(`  GET  /api/health | /api/config | /api/status | /api/properties`);
  console.log(`  POST /api/uploads | /api/excel/inspect | /api/excel/mapping`);
  console.log(`  GET|PUT /api/settings/ai | POST /api/settings/ai/test`);
  console.log(`  GET|POST /api/templates | GET|PUT|DELETE /api/templates/:id`);
  console.log(`  POST /api/templates/:id/map | GET /api/templates/:id/versions/:v/download`);
  console.log(`  GET  /api/jobs | /api/jobs/:id | /api/watch`);
  console.log(`  GET|POST /api/watchers | GET|PUT|DELETE /api/watchers/:id`);
  console.log(`  POST /api/watchers/:id/start | /stop | /sync | /history/clear`);
  console.log(`  GET /api/fs/roots | /api/fs/list  (local path browser)`);
  console.log(`  GET|POST /api/workflows | POST /api/workflows/import | GET|PUT|DELETE /api/workflows/:id`);
  console.log(`  POST /api/workflows/:id/run | /duplicate | GET /api/workflows/:id/export`);
  console.log(`  GET  /api/jobs/:id/download | /api/jobs/:id/draft`);
  console.log(`  GET  /api/pipeline/events | /api/jobs/events  (SSE)`);
});
