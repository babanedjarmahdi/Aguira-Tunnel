import { useRef, useState, useCallback, useEffect } from 'react';
import { TerminalSquare, Download, Trash2, Search, Database, Radio, RotateCw } from 'lucide-react';
import { usePipelineEvents, usePoll, getStatus, getLogs } from '../api';
import { Card, Button, Badge, useToast } from '../components/ui';

const LEVELS = ['info', 'warn', 'error'];

function fmtTime(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString(); } catch { return (ts || '').slice(11, 19); }
}

function LogLine({ l }) {
  return (
    <div className="log-line">
      <span className="ts">{fmtTime(l.ts)}</span>
      {l.jobId != null && <span className="job mono">#{l.jobId}</span>}
      <span className={`lv ${l.level || 'info'}`}>{(l.level || 'info').toUpperCase()}</span>
      <span className="msg">{l.message || l.stage || JSON.stringify(l)}</span>
    </div>
  );
}

export default function Logs() {
  const toast = useToast();
  const [mode, setMode] = useState('persisted'); // persisted | live
  const [logs, setLogs] = useState([]);          // live
  const [persisted, setPersisted] = useState({ logs: [], total: 0, jobs: 0, loading: false });
  const [filter, setFilter] = useState('');
  const [level, setLevel] = useState('all');
  const [limit, setLimit] = useState(1000);
  const [connected, setConnected] = useState(false);
  const boxRef = useRef(null);
  const auto = useRef(true);

  const loadPersisted = useCallback(async () => {
    setPersisted((p) => ({ ...p, loading: true }));
    try {
      const res = await getLogs({ limit, level: level === 'all' ? '' : level, q: filter });
      setPersisted({ logs: res.logs, total: res.total, jobs: res.jobs, loading: false });
    } catch (e) {
      setPersisted((p) => ({ ...p, loading: false, error: e.message }));
    }
  }, [limit, level, filter]);

  const onEvent = useCallback((ev) => {
    if (ev.type === 'log') {
      setLogs((l) => [...l.slice(-500), ev.payload]);
      if (auto.current) requestAnimationFrame(() => { boxRef.current?.scrollTo({ top: 1e9 }); });
    }
  }, []);

  const { count } = usePipelineEvents(onEvent);
  usePoll(getStatus, 10000);
  useEffect(() => setConnected(true), []);
  useEffect(() => {
    if (mode === 'persisted') loadPersisted();
  }, [mode, loadPersisted]);

  const filtered = logs.filter((l) => {
    if (level !== 'all' && l.level !== level) return false;
    if (filter && !JSON.stringify(l).toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const exportJson = () => {
    const data = mode === 'persisted' ? persisted.logs : logs;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `terraflow-logs-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportText = () => {
    const rows = mode === 'persisted' ? persisted.logs : filtered;
    const txt = rows.map((l) => `[${fmtTime(l.ts)}]${l.jobId != null ? ` [#${l.jobId}]` : ''} ${(l.level || 'info').toUpperCase().padEnd(5)} ${l.message || ''}`).join('\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `terraflow-logs-${Date.now()}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  const shown = mode === 'persisted' ? persisted.logs : filtered;
  const totalEvents = mode === 'persisted' ? persisted.total : count;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Logs</h1>
          <p className="page-sub">Persisted run history from every job plus live SSE telemetry — filter by level, search, export.</p>
        </div>
        <div className="flex gap-8">
          <Badge tone="info">{totalEvents} events{mode === 'persisted' ? ` · ${persisted.jobs} jobs` : ''}</Badge>
          <Button variant="ghost" icon={Download} onClick={exportJson}>JSON</Button>
          <Button variant="ghost" icon={Download} onClick={exportText}>Text</Button>
          <Button variant="ghost" icon={Trash2} onClick={() => mode === 'live' ? setLogs([]) : toast('Persisted logs are read-only from disk')}>Clear</Button>
        </div>
      </div>

      <div className="flex gap-8 mb-16 flex-wrap" style={{ alignItems: 'center' }}>
        <div className="segmented">
          <button className={mode === 'persisted' ? 'on' : ''} onClick={() => setMode('persisted')}><Database size={13} /> Persisted</button>
          <button className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}><Radio size={13} /> Live stream</button>
        </div>
        <div className="flex gap-8" style={{ flex: 1, minWidth: 200 }}>
          <span style={{ color: 'var(--text-3)', marginTop: 8 }}><Search size={15} /></span>
          <input className="input" placeholder="Filter logs…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="segmented">
          {['all', ...LEVELS].map((l) => (
            <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>{l}</button>
          ))}
        </div>
        {mode === 'persisted' && (
          <>
            <select className="input" style={{ width: 'auto' }} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value={200}>200</option>
              <option value={1000}>1000</option>
              <option value={5000}>5000</option>
            </select>
            <Button variant="ghost" icon={RotateCw} onClick={loadPersisted}>Refresh</Button>
          </>
        )}
      </div>

      <Card className="pad" title={mode === 'persisted' ? 'Persisted history' : 'Live stream'}
        sub={mode === 'persisted' ? 'Loaded from output/jobs/jobs.json — survives restarts' : (connected ? 'Connected to server events' : 'Connecting…')}>
        <div ref={boxRef} style={{ background: '#0b0c11', border: '1px solid var(--border)', borderRadius: 12, maxHeight: '62vh', overflow: 'auto' }}>
          {mode === 'persisted' && persisted.loading && <div className="muted mono" style={{ padding: 20 }}>Loading persisted logs…</div>}
          {shown.length === 0 && !persisted.loading && <div className="muted mono" style={{ padding: 20 }}>No matching entries{mode === 'persisted' ? ' in persisted history' : ' yet — run a pipeline to see telemetry'}.</div>}
          {shown.map((l, i) => <LogLine key={i} l={l} />)}
        </div>
      </Card>
    </div>
  );
}
