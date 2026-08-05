import fs from 'fs';
import path from 'path';
import { JOBS_DIR } from './config.js';

const WATCHERS_FILE = () => path.join(JOBS_DIR, 'watchers.json');
const HISTORY_CAP = 20;

let store = null;

function load() {
  if (store) return store;
  store = { nextId: 1, watchers: [] };
  try {
    if (fs.existsSync(WATCHERS_FILE())) {
      store = JSON.parse(fs.readFileSync(WATCHERS_FILE(), 'utf8'));
    }
  } catch {
    store = { nextId: 1, watchers: [] };
  }
  return store;
}

function persist() {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  fs.writeFileSync(WATCHERS_FILE(), JSON.stringify(store, null, 2), 'utf8');
}

export function createWatcher({ name = null, type = 'folder', path: watchPath = null, debounceMs = 1500, runOnStartup = false, autoApply = true, steps = null, templateId = null, targetPath = null, mode = 'copy', ai = null } = {}) {
  const s = load();
  const id = s.nextId++;
  const now = new Date().toISOString();
  const watcher = {
    id,
    name: name || `Watcher ${id}`,
    type: type === 'file' ? 'file' : 'folder',
    path: watchPath || null,
    debounceMs: Number(debounceMs) || 1500,
    runOnStartup: !!runOnStartup,
    autoApply: !!autoApply,
    steps: Array.isArray(steps) && steps.length ? steps : ['extract', 'ai', 'db'],
    templateId: templateId || null,
    targetPath: targetPath || null,
    mode: mode === 'original' ? 'original' : 'copy',
    ai: ai || null,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
  s.watchers.push(watcher);
  persist();
  return watcher;
}

export function getWatcher(id) {
  const s = load();
  return s.watchers.find((w) => w.id === Number(id)) || null;
}

export function listWatchers() {
  const s = load();
  return [...s.watchers].reverse();
}

export function updateWatcher(id, patch) {
  const s = load();
  const w = s.watchers.find((x) => x.id === Number(id));
  if (!w) return null;
  if (patch.name !== undefined) w.name = patch.name;
  if (patch.type !== undefined) w.type = patch.type === 'file' ? 'file' : 'folder';
  if (patch.path !== undefined) w.path = patch.path;
  if (patch.debounceMs !== undefined) w.debounceMs = Number(patch.debounceMs) || 1500;
  if (patch.runOnStartup !== undefined) w.runOnStartup = !!patch.runOnStartup;
  if (patch.autoApply !== undefined) w.autoApply = !!patch.autoApply;
  if (patch.steps !== undefined && Array.isArray(patch.steps) && patch.steps.length) w.steps = patch.steps;
  if (patch.templateId !== undefined) w.templateId = patch.templateId;
  if (patch.targetPath !== undefined) w.targetPath = patch.targetPath;
  if (patch.mode !== undefined) w.mode = patch.mode === 'original' ? 'original' : 'copy';
  if (patch.ai !== undefined) w.ai = patch.ai;
  w.updatedAt = new Date().toISOString();
  persist();
  return w;
}

export function deleteWatcher(id) {
  const s = load();
  const before = s.watchers.length;
  s.watchers = s.watchers.filter((w) => w.id !== Number(id));
  if (s.watchers.length === before) return false;
  persist();
  return true;
}

export function clearWatcherHistory(id) {
  const s = load();
  const w = s.watchers.find((x) => x.id === Number(id));
  if (!w) return false;
  w.history = [];
  w.updatedAt = new Date().toISOString();
  persist();
  return true;
}

export function pushWatcherHistory(id, entry) {
  const s = load();
  const w = s.watchers.find((x) => x.id === Number(id));
  if (!w) return null;
  w.history.push({
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    jobId: entry.jobId,
    status: entry.status,
    reason: entry.reason,
    records: entry.records,
    files: entry.files,
  });
  if (w.history.length > HISTORY_CAP) w.history = w.history.slice(-HISTORY_CAP);
  w.updatedAt = new Date().toISOString();
  persist();
  return w;
}
