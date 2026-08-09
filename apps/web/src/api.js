import { useEffect, useState, useCallback, useRef } from 'react';

// API origin for split deploys: set VITE_API_URL at build time to point the SPA
// at a remote API host (e.g. a tunnel). Empty keeps the local single-port model
// (relative /api/* served by the API itself on :3000).
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function api(path, opts) {
  const res = await fetch(API_BASE + path, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export const getHealth = () => api('/api/health');
export const getConfig = () => api('/api/config');
export const getStatus = () => api('/api/status');
export const getProperties = (limit = 1000) => api(`/api/properties?limit=${limit}`);

// ---- Uploads -------------------------------------------------------------
export async function uploadFile(file) {
  const res = await fetch(`${API_BASE}/api/uploads?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}
export const uploadKmz = uploadFile;

// ---- Excel inspect / mapping ---------------------------------------------
export const inspectExcel = (body = {}) => api('/api/excel/inspect', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const buildExcelMapping = (body = {}) => api('/api/excel/mapping', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const saveExcelMapping = (body = {}) => api('/api/excel/mapping/profile', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

// ---- Jobs -----------------------------------------------------------------
export const createJob = (body) => api('/api/jobs', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const getJobs = (limit) => api(`/api/jobs${limit ? `?limit=${limit}` : ''}`);
export const getJob = (id) => api(`/api/jobs/${id}`);
export const runJob = (id, body = {}) => api(`/api/jobs/${id}/run`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const cancelJob = (id) => api(`/api/jobs/${id}/cancel`, { method: 'POST' });
export const rerunJob = (id) => api(`/api/jobs/${id}/re-run`, { method: 'POST' });
export const getLogs = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.level) qs.set('level', params.level);
  if (params.q) qs.set('q', params.q);
  const s = qs.toString();
  return api(`/api/logs${s ? `?${s}` : ''}`);
};
export const jobDownloadUrl = (id, file) => `${API_BASE}/api/jobs/${id}/download${file === 'backup' ? '?file=backup' : ''}`;
export const buildDraft = (id, body = {}) => api(`/api/jobs/${id}/draft`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const getDraft = (id) => api(`/api/jobs/${id}/draft`);
export const applyDraft = (id, body = {}) => api(`/api/jobs/${id}/apply`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const getWatch = () => api('/api/watch');
export const watchStart = () => api('/api/watch/start', { method: 'POST' });
export const watchStop = () => api('/api/watch/stop', { method: 'POST' });

// ---- Managed watchers ------------------------------------------------------
export const getWatchers = () => api('/api/watchers');
export const createWatcher = (body) => api('/api/watchers', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const updateWatcher = (id, body) => api(`/api/watchers/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const deleteWatcher = (id) => api(`/api/watchers/${id}`, { method: 'DELETE' });
export const startWatcher = (id) => api(`/api/watchers/${id}/start`, { method: 'POST' });
export const stopWatcher = (id) => api(`/api/watchers/${id}/stop`, { method: 'POST' });
export const syncWatcher = (id) => api(`/api/watchers/${id}/sync`, { method: 'POST' });
export const clearWatcherHistory = (id) => api(`/api/watchers/${id}/history/clear`, { method: 'POST' });

// ---- Local path browser ----------------------------------------------------
export const getFsRoots = () => api('/api/fs/roots');
export const listFs = (p) => api(`/api/fs/list?path=${encodeURIComponent(p || '~')}`);

// ---- AI settings ----------------------------------------------------------
export const getAiSettings = () => api('/api/settings/ai');
export const updateAiSettings = (body) => api('/api/settings/ai', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const testAiConnection = (body = {}) => api('/api/settings/ai/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const getAiUsage = () => api('/api/settings/ai/usage');
export const resetAiUsage = () => api('/api/settings/ai/usage/reset', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
});

// ---- Excel templates ------------------------------------------------------
export const getTemplates = () => api('/api/templates');
export const getTemplateDetail = (id) => api(`/api/templates/${id}`);
export const createTemplate = (body) => api('/api/templates', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const updateTemplate = (id, body) => api(`/api/templates/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const deleteTemplate = (id) => api(`/api/templates/${id}`, { method: 'DELETE' });
export const mapTemplate = (id) => api(`/api/templates/${id}/map`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
});
export const templateDownloadUrl = (id, version) => `${API_BASE}/api/templates/${id}/versions/${version}/download`;
export const templatePreview = (id, opts = {}) => api(`/api/templates/${id}/preview?rows=${opts.rows || 10}&cols=${opts.cols || 12}`);

// ---- Workflows ------------------------------------------------------------
export const getWorkflows = () => api('/api/workflows');
export const getAllWorkflows = () => api('/api/workflows/all');
export const createWorkflow = (body) => api('/api/workflows', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const updateWorkflow = (id, body) => api(`/api/workflows/${id}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const deleteWorkflow = (id) => api(`/api/workflows/${id}`, { method: 'DELETE' });
export const runWorkflow = (id, body = {}) => api(`/api/workflows/${id}/run`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export const duplicateWorkflow = (id) => api(`/api/workflows/${id}/duplicate`, { method: 'POST' });
export const exportWorkflow = (id) => api(`/api/workflows/${id}/export`);
export const importWorkflow = (body) => api('/api/workflows/import', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export async function startPipeline(stages) {
  const res = await fetch(`${API_BASE}/api/pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stages }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

// Replays buffered history, then live events.
export function usePipelineEvents(onEvent) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const [connected, setConnected] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/pipeline/events`);
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        cb.current(JSON.parse(e.data));
        setCount((c) => c + 1);
      } catch { /* keep-alives */ }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  return { connected, count };
}

// Job-scoped events stream (optionally filtered to one job on the server).
export function useJobEvents(onEvent, jobId) {
  const cb = useRef(onEvent);
  cb.current = onEvent;
  const [connected, setConnected] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const es = new EventSource(jobId ? `${API_BASE}/api/jobs/events?jobId=${jobId}` : `${API_BASE}/api/jobs/events`);
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        cb.current(JSON.parse(e.data));
        setCount((c) => c + 1);
      } catch { /* keep-alives */ }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [jobId]);

  return { connected, count };
}

// Small polling hook for status/config/health.
export function usePoll(fn, interval = 2000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    try {
      setData(await fnRef.current());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, interval);
    return () => clearInterval(t);
  }, [refresh, interval]);

  return { data, error, refresh };
}
