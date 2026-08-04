import { useEffect, useState, useCallback, useRef } from 'react';

export async function api(path, opts) {
  const res = await fetch(path, opts);
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
export async function uploadKmz(file) {
  const res = await fetch(`/api/uploads?name=${encodeURIComponent(file.name)}`, {
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

// ---- Workflows ------------------------------------------------------------
export const getWorkflows = () => api('/api/workflows');
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

export async function startPipeline(stages) {
  const res = await fetch('/api/pipeline', {
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
    const es = new EventSource('/api/pipeline/events');
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
    const es = new EventSource(jobId ? `/api/jobs/events?jobId=${jobId}` : '/api/jobs/events');
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
