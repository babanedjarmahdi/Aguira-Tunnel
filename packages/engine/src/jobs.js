import fs from 'fs';
import path from 'path';
import { JOBS_DIR } from './config.js';

let store = null;

function jobsFile() {
  return path.join(JOBS_DIR, 'jobs.json');
}

function load() {
  if (store) return store;
  store = { nextId: 1, jobs: [] };
  try {
    if (fs.existsSync(jobsFile())) {
      store = JSON.parse(fs.readFileSync(jobsFile(), 'utf8'));
    }
  } catch {
    store = { nextId: 1, jobs: [] };
  }
  return store;
}

function persist() {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  fs.writeFileSync(jobsFile(), JSON.stringify(store, null, 2), 'utf8');
}

export function createJob({ workflowType = 'kmz-ai-excel', input = null, destination = null, steps = ['extract', 'ai', 'draft'], autoApply = false, workflowId = null, ai = null }) {
  const s = load();
  const id = s.nextId++;
  const now = new Date().toISOString();
  const job = {
    id,
    workflowId,
    workflowType,
    steps,
    input,
    destination,
    ai,
    autoApply,
    status: 'queued',
    currentStage: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    processedFiles: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsSkipped: 0,
    warnings: 0,
    errors: 0,
    aiUncertainties: 0,
    draft: null,
    output: null,
    error: null,
    log: [],
    createdAt: now,
  };
  s.jobs.push(job);
  persist();
  return job;
}

export function updateJob(id, patch) {
  const s = load();
  const job = s.jobs.find((j) => j.id === id);
  if (!job) return null;
  Object.assign(job, patch);
  persist();
  return job;
}

export function getJob(id) {
  const s = load();
  const num = Number(id);
  return s.jobs.find((j) => j.id === num) || null;
}

export function listJobs(limit = 50) {
  const s = load();
  return s.jobs.slice(-limit).reverse();
}

export function pushJobLog(jobId, { level, message }) {
  const job = getJob(jobId);
  if (!job) return;
  job.log = [...job.log.slice(-399), { level, message, ts: new Date().toISOString() }];
  persist();
}
