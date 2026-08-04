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

export function createWorkflow({ name, steps = DEFAULT_STEPS, destination = null, autoApply = false, workflowType = 'basic' } = {}) {
  const s = load();
  const id = s.nextId++;
  const now = new Date().toISOString();
  const workflow = {
    id,
    name: name || `Workflow ${id}`,
    workflowType,
    steps: Array.isArray(steps) && steps.length ? steps : DEFAULT_STEPS,
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
