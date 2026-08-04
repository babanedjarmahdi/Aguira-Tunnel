import { useRef, useState, useCallback, useEffect } from 'react';
import { TerminalSquare, Download, Trash2, Search, Filter } from 'lucide-react';
import { usePipelineEvents, usePoll, getStatus } from '../api';
import { Card, Button, Badge } from '../components/ui';

const LEVELS = ['info', 'warn', 'error'];

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('');
  const [level, setLevel] = useState('all');
  const [connected, setConnected] = useState(false);
  const boxRef = useRef(null);
  const auto = useRef(true);

  const onEvent = useCallback((ev) => {
    if (ev.type === 'log') {
      setLogs((l) => [...l.slice(-500), ev.payload]);
      if (auto.current) requestAnimationFrame(() => { boxRef.current?.scrollTo({ top: 1e9 }); });
    }
  }, []);

  const { count } = usePipelineEvents(onEvent);
  usePoll(getStatus, 10000); // keep connection warm + history hint

  useEffect(() => setConnected(true), []);

  const filtered = logs.filter((l) => {
    if (level !== 'all' && l.level !== level) return false;
    if (filter && !JSON.stringify(l).toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const download = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `terraflow-logs-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Logs</h1>
          <p className="page-sub">Live pipeline telemetry streamed over SSE. Filter, search, export.</p>
        </div>
        <div className="flex gap-8">
          <Badge tone="info">{count} events</Badge>
          <Button variant="ghost" icon={Download} onClick={download}>Export</Button>
          <Button variant="ghost" icon={Trash2} onClick={() => setLogs([])}>Clear</Button>
        </div>
      </div>

      <Card className="pad" title="Live stream" sub={connected ? 'Connected to server events' : 'Connecting…'}>
        <div className="flex gap-8 mb-16 flex-wrap">
          <div className="flex gap-8" style={{ flex: 1, minWidth: 220 }}>
            <span style={{ color: 'var(--text-3)', marginTop: 8 }}><Search size={15} /></span>
            <input className="input" placeholder="Filter logs…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="segmented">
            {['all', ...LEVELS].map((l) => (
              <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>{l}</button>
            ))}
          </div>
        </div>
        <div ref={boxRef} style={{ background: '#0b0c11', border: '1px solid var(--border)', borderRadius: 12, maxHeight: '62vh', overflow: 'auto' }}>
          {filtered.length === 0 && <div className="muted mono" style={{ padding: 20 }}>No matching events yet — run a pipeline to see telemetry.</div>}
          {filtered.map((l, i) => (
            <div key={i} className="log-line">
              <span className="ts">{(l.t || '').slice(11, 19)}</span>
              <span className={`lv ${l.level || 'info'}`}>{(l.level || 'info').toUpperCase()}</span>
              <span className="msg">{l.message || l.stage || JSON.stringify(l)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
