import fs from 'fs';
import path from 'path';
import { JOBS_DIR } from './config.js';

const WORKFLOWS_FILE = () => path.join(JOBS_DIR, 'workflows.json');

let store = null;

function load() {
  if (store) return store;
  store = { nextId: 1, workflows: [] };
  try {
    if (fs.existsSync(WORKFLOWS_FILE())) {
      store = JSON.parse(fs.readFileSync(WORKFLOWS_FILE(), 'utf8'));
    }
  } catch {
    store = { nextId: 1, workflows: [] };
  }
  return store;
}

function persist() {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  fs.writeFileSync(WORKFLOWS_FILE(), JSON.stringify(store, null, 2), 'utf8');
}

const DEFAULT_STEPS = ['extract', 'ai', 'db'];

export function createWorkflow({ name, steps = DEFAULT_STEPS, destination = null, autoApply = false, workflowType = 'basic', input = null, templateId = null, ai = null } = {}) {
  const s = load();
  const id = s.nextId++;
  const now = new Date().toISOString();
  const workflow = {
    id,
    name: name || `Workflow ${id}`,
    workflowType,
    steps: Array.isArray(steps) && steps.length ? steps : DEFAULT_STEPS,
    input: input || null,
    templateId: templateId || null,
    ai: ai || null,
    destination: destination || { mode: 'copy', templatePath: null, outputPath: null },
    autoApply,
    runs: 0,
    lastRunAt: null,
    lastJobId: null,
    lastStatus: null,
    createdAt: now,
    updatedAt: now,
  };
  s.workflows.push(workflow);
  persist();
  return workflow;
}

export function getWorkflow(id) {
  const s = load();
  return s.workflows.find((w) => w.id === Number(id)) || null;
}

export function listWorkflows() {
  const s = load();
  return [...s.workflows].reverse();
}

export function updateWorkflow(id, patch) {
  const s = load();
  const w = s.workflows.find((x) => x.id === Number(id));
  if (!w) return null;
  if (patch.name !== undefined) w.name = patch.name;
  if (patch.steps !== undefined && Array.isArray(patch.steps) && patch.steps.length) w.steps = patch.steps;
  if (patch.destination !== undefined) w.destination = { ...w.destination, ...patch.destination };
  if (patch.input !== undefined) w.input = patch.input;
  if (patch.templateId !== undefined) w.templateId = patch.templateId;
  if (patch.ai !== undefined) w.ai = patch.ai;
  if (patch.autoApply !== undefined) w.autoApply = !!patch.autoApply;
  w.updatedAt = new Date().toISOString();
  persist();
  return w;
}

export function deleteWorkflow(id) {
  const s = load();
  const before = s.workflows.length;
  s.workflows = s.workflows.filter((w) => w.id !== Number(id));
  if (s.workflows.length === before) return false;
  persist();
  return true;
}

export function markWorkflowRun(id, jobId, status) {
  const s = load();
  const w = s.workflows.find((x) => x.id === Number(id));
  if (!w) return null;
  w.runs += 1;
  w.lastRunAt = new Date().toISOString();
  w.lastJobId = jobId;
  w.lastStatus = status;
  w.updatedAt = w.lastRunAt;
  persist();
  return w;
}

// Portable definition (no id / run counters) — used for duplicate + export.
export function exportWorkflow(id) {
  const w = getWorkflow(id);
  if (!w) return null;
  return {
    name: w.name,
    workflowType: w.workflowType,
    steps: [...w.steps],
    input: w.input ? JSON.parse(JSON.stringify(w.input)) : null,
    templateId: w.templateId,
    ai: w.ai ? JSON.parse(JSON.stringify(w.ai)) : null,
    destination: JSON.parse(JSON.stringify(w.destination)),
    autoApply: w.autoApply,
    exportedAt: new Date().toISOString(),
  };
}

export function duplicateWorkflow(id) {
  const w = getWorkflow(id);
  if (!w) return null;
  const { name, workflowType, steps, input, templateId, ai, destination, autoApply } = exportWorkflow(id);
  return createWorkflow({
    name: `${name} (copy)`,
    workflowType,
    steps,
    input,
    templateId,
    ai,
    destination,
    autoApply,
  });
}

// Restore a definition produced by exportWorkflow (or compatible JSON).
export function importWorkflow(obj = {}) {
  if (!obj || typeof obj !== 'object') throw new Error('Invalid workflow JSON');
  return createWorkflow({
    name: obj.name,
    workflowType: obj.workflowType,
    steps: obj.steps,
    input: obj.input,
    templateId: obj.templateId,
    ai: obj.ai,
    destination: obj.destination,
    autoApply: !!obj.autoApply,
  });
}
