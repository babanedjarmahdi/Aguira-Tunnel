import { useEffect, useState } from 'react';
import { Eye, Plus, Play, Square, RefreshCw, Trash2, X, FolderTree, File, Pencil, FolderOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getWatchers, createWatcher, updateWatcher, deleteWatcher,
  startWatcher, stopWatcher, syncWatcher, clearWatcherHistory, usePoll,
  getTemplates, getAiSettings,
} from '../api';
import { Card, Badge, Button, Empty, Field, Segmented, Toggle, useToast, Spinner, Dot } from '../components/ui';
import PathBrowser from '../components/PathBrowser';

const tone = (s) => (s === 'completed' ? 'ok' : s === 'failed' ? 'err' : s === 'canceled' ? 'warn' : 'info');

const ALL_STEPS = [
  { id: 'extract', label: 'Extract (KMZ)' },
  { id: 'ai', label: 'AI analysis' },
  { id: 'db', label: 'Database sync' },
  { id: 'fill', label: 'Copy fill (new file)' },
  { id: 'fill:original', label: 'Original fill (in place)' },
];

const FALLBACK_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.2-3b-preview'];

const emptyForm = () => ({
  name: '', type: 'folder', watchPath: '', debounceMs: 1500, runOnStartup: false,
  autoApply: true, steps: ['extract', 'ai', 'db'], mode: 'copy', templateId: '', targetPath: '', aiModel: '', aiTemp: '',
});

export default function Watchers() {
  const toast = useToast();
  const nav = useNavigate();
  const { data, refresh } = usePoll(getWatchers, 4000);
  const list = data || [];

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [f, setF] = useState(emptyForm());
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const [templates, setTemplates] = useState([]);
  const [aiModels, setAiModels] = useState(FALLBACK_MODELS);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [showHistory, setShowHistory] = useState(null);
  const [browse, setBrowse] = useState(null);

  useEffect(() => {
    getTemplates().then((r) => setTemplates(r.templates)).catch(() => {});
    getAiSettings().then((s) => s?.models && setAiModels(s.models)).catch(() => {});
  }, []);

  const toggleStep = (id) => {
    setF((p) => ({ ...p, steps: p.steps.includes(id) ? p.steps.filter((x) => x !== id) : [...p.steps, id] }));
  };

  const openCreate = () => {
    setEditId(null);
    setF(emptyForm());
    setOpen(true);
  };

  const openEdit = (w) => {
    setEditId(w.id);
    setF({
      name: w.name, type: w.type, watchPath: w.path || '', debounceMs: w.debounceMs,
      runOnStartup: w.runOnStartup, autoApply: w.autoApply, steps: [...w.steps],
      mode: w.mode, templateId: w.templateId || '', targetPath: w.targetPath || '',
      aiModel: w.ai?.model || '', aiTemp: w.ai?.temperature != null ? String(w.ai.temperature) : '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!f.name.trim()) { toast('Give the watcher a name', 'err'); return; }
    if (!f.watchPath.trim()) { toast('Set a folder or file path', 'err'); return; }
    if (!f.steps.length) { toast('Pick at least one stage', 'err'); return; }
    setSaving(true);
    try {
      const body = {
        name: f.name.trim(),
        type: f.type,
        path: f.watchPath.trim(),
        debounceMs: Number(f.debounceMs) || 1500,
        runOnStartup: f.runOnStartup,
        autoApply: f.autoApply,
        steps: f.steps,
        mode: f.mode,
        templateId: f.templateId || null,
        targetPath: f.targetPath.trim() || null,
        ai: f.aiModel ? { model: f.aiModel, temperature: f.aiTemp === '' ? undefined : Number(f.aiTemp) } : null,
      };
      if (editId) { await updateWatcher(editId, body); toast('Watcher updated'); }
      else { await createWatcher(body); toast('Watcher created'); }
      setOpen(false);
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (w) => {
    setBusy(w.id);
    try {
      if (w.runtime?.watching) await stopWatcher(w.id); else await startWatcher(w.id);
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(null);
    }
  };

  const sync = async (w) => {
    setBusy(w.id);
    try {
      await syncWatcher(w.id);
      toast('Sync queued');
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (w) => {
    if (!window.confirm(`Delete watcher "${w.name}"?`)) return;
    try {
      await deleteWatcher(w.id);
      toast('Watcher deleted');
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const clearHistory = async (w) => {
    if (!window.confirm(`Clear history for "${w.name}"?`)) return;
    try {
      await clearWatcherHistory(w.id);
      toast('History cleared');
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const startRename = (w) => { setRenaming(w.id); setRenameVal(w.name); };
  const commitRename = async (w) => {
    if (renameVal.trim() && renameVal.trim() !== w.name) {
      try {
        await updateWatcher(w.id, { name: renameVal.trim() });
        refresh();
      } catch (e) { toast(e.message, 'err'); }
    }
    setRenaming(null);
  };

  const destLabel = (w) => {
    if (w.templateId) {
      const t = templates.find((x) => x.id === w.templateId);
      return `Template · ${t ? t.name : w.templateId}`;
    }
    if (w.targetPath) return `File · ${w.targetPath}`;
    return 'Default workbook';
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Watchers</h1>
          <p className="page-sub">Managed watch items: a folder or single file, debounced, running the watcher's own workflow on every change. Run-on-startup resumes them after a restart.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => (open ? setOpen(false) : openCreate())}>{open ? 'Close' : 'New watcher'}</Button>
      </div>

      {open && (
        <Card className="pad mb-16" title={editId ? `Edit watcher #${editId}` : 'New watcher'} sub="Every change batch becomes a watch-sync job running the workflow below.">
          <div className="grid cols-3 gap-16">
            <div className="flex-col gap-16">
              <Field label="Name">
                <input className="input" placeholder="e.g. Sales folder watch" value={f.name} onChange={(e) => set('name')(e.target.value)} />
              </Field>
              <Field label="Watch type">
                <Segmented
                  value={f.type}
                  onChange={set('type')}
                  options={[
                    { value: 'folder', label: 'Folder (.kmz)' },
                    { value: 'file', label: 'Single file' },
                  ]}
                />
              </Field>
              <Field label={f.type === 'file' ? 'File path to watch' : 'Folder path to watch'} hint="Absolute path — use the picker or paste it">
                <div className="flex gap-8">
                  <input className="input" placeholder={f.type === 'file' ? 'C:/…/file.kmz' : 'C:/…/GOOGLE EARTH'} value={f.watchPath} onChange={(e) => set('watchPath')(e.target.value)} />
                  <Button variant="ghost" icon={FolderOpen} onClick={() => setBrowse('watch')}>{f.type === 'file' ? 'Choose file' : 'Choose folder'}</Button>
                </div>
              </Field>
              <Field label="Debounce (ms)" hint="Wait after a change before syncing">
                <input className="input" type="number" min="0" step="100" value={f.debounceMs} onChange={(e) => set('debounceMs')(e.target.value)} />
              </Field>
              <div className="flex gap-16">
                <Field label="Run on startup">
                  <Toggle checked={f.runOnStartup} onChange={set('runOnStartup')} label={f.runOnStartup ? 'On' : 'Off'} />
                </Field>
                <Field label="Auto-apply">
                  <Toggle checked={f.autoApply} onChange={set('autoApply')} label={f.autoApply ? 'On' : 'Off'} />
                </Field>
              </div>
            </div>
            <div className="flex-col gap-16">
              <Field label="Workflow stages" hint="Manage what the watcher does on each sync">
                <div className="flex-col gap-8">
                  {ALL_STEPS.map((s) => (
                    <label key={s.id} className="row" style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={f.steps.includes(s.id)} onChange={() => toggleStep(s.id)} />
                      <span className="text-sm">{s.label}</span>
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Destination file — fill or modify" hint="Choose the workbook the run writes to">
                <Segmented
                  value={f.mode}
                  onChange={(m) => set('mode')(m)}
                  options={[
                    { value: 'copy', label: 'Copy (new file)' },
                    { value: 'original', label: 'Modify original' },
                  ]}
                />
              </Field>
              <Field label="Workbook" hint={f.mode === 'copy' ? 'Source workbook copied and filled' : 'Workbook modified in place (backup made)'}>
                <select className="select" value={f.templateId} onChange={(e) => set('templateId')(e.target.value)}>
                  <option value="">Default (EXCEL_TEMPLATE)</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Or explicit file path" hint="Overrides the template/default above">
                <div className="flex gap-8">
                  <input className="input" placeholder="C:/…/workbook.xlsx" value={f.targetPath} onChange={(e) => set('targetPath')(e.target.value)} />
                  <Button variant="ghost" icon={FolderOpen} onClick={() => setBrowse('target')}>Choose file</Button>
                </div>
              </Field>
            </div>
            <div className="flex-col gap-16">
              <Field label="AI model (free tier)" hint="Optional override of global AI settings">
                <select className="select" value={f.aiModel} onChange={(e) => set('aiModel')(e.target.value)}>
                  <option value="">Global default</option>
                  {aiModels.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="AI temperature" hint="Optional override">
                <input className="input" type="number" step="0.1" min="0" max="2" value={f.aiTemp} onChange={(e) => set('aiTemp')(e.target.value)} placeholder="0" />
              </Field>
              <div className="flex gap-8 mt-auto">
                <Button variant="primary" icon={Plus} onClick={save} disabled={saving}>
                  {saving ? <><Spinner /> Saving…</> : editId ? 'Save changes' : 'Create watcher'}
                </Button>
                <Button variant="ghost" icon={X} onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {browse && (
        <PathBrowser
          mode={browse === 'target' || f.type === 'file' ? 'file' : 'folder'}
          onPick={(p) => { set(browse === 'target' ? 'targetPath' : 'watchPath')(p); setBrowse(null); }}
          onClose={() => setBrowse(null)}
        />
      )}

      {list.length === 0 && !open ? (
        <Card pad><Empty icon={Eye} title="No watchers yet" text="Create a watcher to turn folder/file changes into automatic import jobs." /></Card>
      ) : (
        <div className="grid cols-2">
          {list.map((w) => (
            <Card key={w.id} className="hoverable pad">
              <div className="flex between">
                <div className="flex gap-8" style={{ minWidth: 0 }}>
                  {w.type === 'file' ? <File size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} /> : <FolderTree size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                  {renaming === w.id ? (
                    <input className="input" value={renameVal} autoFocus
                      onChange={(e) => setRenameVal(e.target.value)}
                      onBlur={() => commitRename(w)}
                      onKeyDown={(e) => e.key === 'Enter' && commitRename(w)} />
                  ) : (
                    <b style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</b>
                  )}
                </div>
                <div className="flex gap-8">
                  <Badge tone={w.runtime?.watching ? 'ok' : w.runtime?.enabled ? 'warn' : 'err'}>
                    <Dot tone={w.runtime?.watching ? 'ok' : w.runtime?.enabled ? 'warn' : 'err'} />
                    {w.runtime?.watching ? 'Watching' : w.runtime?.enabled ? 'Stopped' : 'Path missing'}
                  </Badge>
                  <Button variant="ghost" icon={Pencil} onClick={() => openEdit(w)} title="Edit workflow" />
                  <Button variant="ghost" icon={Plus} onClick={() => startRename(w)} title="Rename" />
                  <Button variant="ghost" icon={Trash2} onClick={() => remove(w)} title="Delete" />
                </div>
              </div>
              <p className="card-sub mt-8" style={{ wordBreak: 'break-all' }}>{w.path} · {w.debounceMs}ms debounce{w.runOnStartup ? ' · auto-start' : ''}</p>
              <div className="flex gap-8 mt-16 flex-wrap">
                {w.steps.map((s) => <Badge key={s} tone="info">{s}</Badge>)}
                <Badge tone={w.autoApply ? 'ok' : 'warn'}>{w.autoApply ? 'auto-apply' : 'review'}</Badge>
              </div>
              <p className="card-sub mt-8" style={{ wordBreak: 'break-all' }}>
                <span style={{ color: 'var(--text-3)' }}>{w.mode === 'copy' ? 'fill (copy)' : 'modify original'} → </span>{destLabel(w)}
                {w.ai?.model ? ` · AI: ${w.ai.model}` : ''}
              </p>
              <div className="flex gap-8 mt-16 flex-wrap">
                <Button variant={w.runtime?.watching ? 'danger' : 'primary'} icon={w.runtime?.watching ? Square : Play}
                  onClick={() => toggle(w)} disabled={busy === w.id}>
                  {busy === w.id ? <Spinner /> : w.runtime?.watching ? 'Stop' : 'Start'}
                </Button>
                <Button variant="ghost" icon={RefreshCw} onClick={() => sync(w)} disabled={busy === w.id}>Sync now</Button>
                <Button variant="ghost" onClick={() => setShowHistory(showHistory === w.id ? null : w.id)}>History ({w.history.length})</Button>
                <Button variant="ghost" onClick={() => nav('/jobs')}>Jobs</Button>
              </div>
              {showHistory === w.id && (
                <div className="mt-16">
                  <div className="flex between mb-8">
                    <span className="text-sm" style={{ color: 'var(--text-3)' }}>Last {Math.min(w.history.length, 20)} runs</span>
                    <button className="link-btn" onClick={() => clearHistory(w)}>Clear history</button>
                  </div>
                  {w.history.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>No runs yet — changes in the watched path or "Sync now" will appear here.</p>
                  ) : (
                    <table className="mini-table">
                      <thead>
                        <tr><th>When</th><th>Job</th><th>Reason</th><th>Status</th><th>Records</th><th>Files</th></tr>
                      </thead>
                      <tbody>
                        {[...w.history].reverse().map((h, i) => (
                          <tr key={i}>
                            <td>{new Date(h.startedAt).toLocaleString()}</td>
                            <td><button className="link-btn" onClick={() => nav('/jobs')}>#{h.jobId}</button></td>
                            <td>{h.reason}</td>
                            <td><Badge tone={tone(h.status)}>{h.status}</Badge></td>
                            <td>{h.records}</td>
                            <td>{h.files}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
