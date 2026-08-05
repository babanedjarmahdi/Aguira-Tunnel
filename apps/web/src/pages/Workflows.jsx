import { useEffect, useRef, useState } from 'react';
import { Workflow as WorkflowIcon, Play, Square, Trash2, X, Copy, Download, Upload, Eye, RefreshCw, Pencil, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getAllWorkflows, createWorkflow, deleteWorkflow, updateWorkflow, runWorkflow,
  duplicateWorkflow, exportWorkflow, importWorkflow, deleteWatcher, updateWatcher,
  startWatcher, stopWatcher, syncWatcher, usePoll, getTemplates, getAiSettings,
} from '../api';
import { Card, Badge, Button, Empty, Field, Segmented, Toggle, useToast, Spinner, Dot } from '../components/ui';
import NewWorkflowChooser from '../components/NewWorkflowChooser';

const ALL_STEPS = [
  { id: 'extract', label: 'Extract (KMZ)' },
  { id: 'ai', label: 'AI analysis' },
  { id: 'db', label: 'Database sync' },
  { id: 'fill', label: 'Excel copy fill' },
  { id: 'fill:original', label: 'Original fill' },
];

const FALLBACK_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.2-3b-preview'];

const tone = (s) => (s === 'completed' ? 'ok' : s === 'failed' ? 'err' : s === 'running' ? 'info' : 'warn');

export default function Workflows() {
  const toast = useToast();
  const nav = useNavigate();
  const { data: workflows, refresh } = usePoll(getAllWorkflows, 4000);
  const list = workflows || [];
  const importInput = useRef(null);

  const [showNew, setShowNew] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState(['extract', 'ai', 'db']);
  const [mode, setMode] = useState('copy');
  const [autoApply, setAutoApply] = useState(false);
  const [sourceDir, setSourceDir] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiTemp, setAiTemp] = useState('');
  const [templates, setTemplates] = useState([]);
  const [aiModels, setAiModels] = useState(FALLBACK_MODELS);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [busy, setBusy] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');

  useEffect(() => {
    getTemplates().then((r) => setTemplates(r.templates)).catch(() => {});
    getAiSettings().then((s) => s?.models && setAiModels(s.models)).catch(() => {});
  }, []);

  const toggleStep = (id) => {
    setSteps((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const save = async () => {
    if (!name.trim()) { toast('Give the workflow a name', 'err'); return; }
    if (!steps.length) { toast('Pick at least one stage', 'err'); return; }
    setSaving(true);
    try {
      const ai = aiModel ? { model: aiModel, temperature: aiTemp === '' ? undefined : Number(aiTemp) } : null;
      await createWorkflow({
        name: name.trim(),
        workflowType: 'basic',
        steps,
        destination: { mode },
        autoApply,
        input: sourceDir.trim() ? { sourceDir: sourceDir.trim() } : null,
        templateId: templateId || null,
        ai,
      });
      toast('Import workflow created');
      setOpen(false);
      setName(''); setSteps(['extract', 'ai', 'db']); setMode('copy'); setAutoApply(false);
      setSourceDir(''); setTemplateId(''); setAiModel(''); setAiTemp('');
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const run = async (w) => {
    setRunningId(w.id);
    try {
      const res = await runWorkflow(w.id);
      toast(`Import run started (job #${res.job.id})`);
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setRunningId(null);
    }
  };

  const toggleWatch = async (w) => {
    setBusy(`toggle:${w.id}`);
    try {
      if (w.runtime?.watching) await stopWatcher(w.id); else await startWatcher(w.id);
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(null);
    }
  };

  const syncWatch = async (w) => {
    setBusy(`sync:${w.id}`);
    try {
      await syncWatcher(w.id);
      toast('Sync requested');
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (w) => {
    if (!window.confirm(`Delete ${w.type} workflow "${w.name}"?`)) return;
    try {
      if (w.type === 'watch') await deleteWatcher(w.id); else await deleteWorkflow(w.id);
      toast('Workflow deleted');
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const dup = async (w) => {
    try {
      const copy = await duplicateWorkflow(w.id);
      toast(`Duplicated as "${copy.name}"`);
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const exp = async (w) => {
    try {
      const data = await exportWorkflow(w.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${w.name.replace(/[^\w-]+/g, '_')}.workflow.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const onImport = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const w = await importWorkflow(data);
      toast(`Imported workflow "${w.name}"`);
      refresh();
    } catch (err) {
      toast(`Import failed: ${err.message}`, 'err');
    }
  };

  const startRename = (w) => { setRenaming(`${w.type}:${w.id}`); setRenameVal(w.name); };
  const commitRename = async (w) => {
    if (renameVal.trim() && renameVal.trim() !== w.name) {
      try {
        if (w.type === 'watch') await updateWatcher(w.id, { name: renameVal.trim() });
        else await updateWorkflow(w.id, { name: renameVal.trim() });
        refresh();
      } catch (e) { toast(e.message, 'err'); }
    }
    setRenaming(null);
  };

  const templateName = (id) => templates.find((t) => t.id === id)?.name || id;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Workflows</h1>
          <p className="page-sub">Everything that runs — import workflows (one-shot) and watch workflows (background). Start a new one.</p>
        </div>
        <div className="flex gap-8">
          <Button variant="ghost" icon={Upload} onClick={() => importInput.current?.click()}>Import JSON</Button>
          <input ref={importInput} type="file" accept=".json" hidden onChange={onImport} />
          <Button variant="primary" icon={Play} onClick={() => setShowNew(true)}>New workflow</Button>
        </div>
      </div>

      {showNew && <NewWorkflowChooser onClose={() => setShowNew(false)} />}

      {open && (
        <Card className="pad mb-16" title="New import workflow" sub="Compose input, AI, destination and stages. Each run becomes a job.">
          <div className="grid cols-3 gap-16">
            <div className="flex-col gap-16">
              <Field label="Workflow name">
                <input className="input" placeholder="e.g. Weekly listing import" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Input folder (KMZ source dir)" hint="Optional — defaults to the configured SOURCE_KMZ_DIR">
                <input className="input" placeholder="C:/…/GOOGLE EARTH" value={sourceDir} onChange={(e) => setSourceDir(e.target.value)} />
              </Field>
            </div>
            <div className="flex-col gap-16">
              <Field label="Excel template" hint="Optional — a registered template from the manager">
                <select className="select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">Default (EXCEL_TEMPLATE)</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="AI model (free tier)" hint="Optional — overrides the global AI settings">
                <select className="select" value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
                  <option value="">Global default</option>
                  {aiModels.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="AI temperature" hint="Optional override">
                <input className="input" type="number" step="0.1" min="0" max="2" value={aiTemp} onChange={(e) => setAiTemp(e.target.value)} placeholder="0" />
              </Field>
            </div>
            <div className="flex-col gap-16">
              <Field label="Stages">
                <div className="flex-col gap-8">
                  {ALL_STEPS.map((s) => (
                    <label key={s.id} className="row" style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={steps.includes(s.id)} onChange={() => toggleStep(s.id)} />
                      <span className="text-sm">{s.label}</span>
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Excel write mode">
                <Segmented
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'copy', label: 'Copy (new file)' },
                    { value: 'original', label: 'Original (backup)' },
                  ]}
                />
              </Field>
              <Field label="Auto-apply" hint="Skip draft review; write to Excel straight after the pipeline">
                <Toggle checked={autoApply} onChange={setAutoApply} label={autoApply ? 'On' : 'Off'} />
              </Field>
              <div className="flex gap-8">
                <Button variant="primary" icon={Plus} onClick={save} disabled={saving}>
                  {saving ? <><Spinner /> Saving…</> : 'Create workflow'}
                </Button>
                <Button variant="ghost" icon={X} onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {list.length === 0 && !open ? (
        <Card pad>
          <Empty icon={WorkflowIcon} title="No workflows yet" text="Workflows are the unit of work — import (one-shot) or watch (background)."
            action={<Button variant="primary" icon={Play} onClick={() => setShowNew(true)}>Start a new workflow</Button>} />
        </Card>
      ) : (
        <div className="grid cols-2">
          {list.map((w) => {
            const isWatch = w.type === 'watch';
            const key = `${w.type}:${w.id}`;
            const watching = isWatch && w.runtime?.watching;
            return (
              <Card key={key} className="hoverable pad">
                <div className="flex between">
                  <div className="flex gap-8" style={{ minWidth: 0 }}>
                    {isWatch ? <Eye size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} /> : <WorkflowIcon size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                    {renaming === key ? (
                      <input className="input" value={renameVal} autoFocus
                        onChange={(e) => setRenameVal(e.target.value)}
                        onBlur={() => commitRename(w)}
                        onKeyDown={(e) => e.key === 'Enter' && commitRename(w)} />
                    ) : (
                      <b style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</b>
                    )}
                  </div>
                  <div className="flex gap-8">
                    <Badge tone={isWatch ? (watching ? 'ok' : w.runtime?.enabled ? 'info' : 'warn') : (w.lastStatus ? tone(w.lastStatus) : 'info')}>
                      <Dot tone={isWatch ? (watching ? 'ok' : w.runtime?.enabled ? 'info' : 'err') : (w.lastStatus ? tone(w.lastStatus) : 'info')} />
                      {isWatch ? (watching ? 'Watching' : w.runtime?.enabled ? 'Stopped' : 'Off') : (w.lastStatus || 'import')}
                    </Badge>
                    <Badge tone="info">{isWatch ? 'watch' : 'import'}</Badge>
                    <Button variant="ghost" icon={Pencil} onClick={() => startRename(w)} title="Rename" />
                    <Button variant="ghost" icon={Trash2} onClick={() => remove(w)} title="Delete" />
                  </div>
                </div>

                {isWatch ? (
                  <>
                    <p className="card-sub mt-8 mono">{w.path || '—'}</p>
                    <p className="card-sub">
                      {w.steps?.join(' · ')}
                      {w.mode === 'original' ? ' · modify existing' : ' · create new file'}
                      {w.templateId ? ' · template' : w.targetPath ? ' · file' : ' · no destination'}
                      {w.autoApply ? ' · auto-apply' : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="card-sub mt-8">
                      {w.runs} run{w.runs === 1 ? '' : 's'}
                      {w.lastRunAt ? ` · last ${new Date(w.lastRunAt).toLocaleString()}` : ''}
                      {w.autoApply ? ' · auto-apply' : ''}
                    </p>
                    <div className="flex gap-8 mt-16 flex-wrap">
                      {w.steps.map((s) => <Badge key={s} tone="info">{s}</Badge>)}
                      {w.templateId && <Badge tone="ok">template</Badge>}
                      {w.ai?.model && <Badge tone="ok">{w.ai.model}</Badge>}
                      {w.input?.sourceDir && <Badge tone="warn">custom input</Badge>}
                    </div>
                  </>
                )}

                <div className="flex gap-8 mt-16 flex-wrap">
                  {isWatch ? (
                    <>
                      <Button variant="primary" icon={watching ? Square : Play} onClick={() => toggleWatch(w)} loading={busy === `toggle:${w.id}`}>
                        {watching ? 'Stop' : 'Start'}
                      </Button>
                      <Button variant="ghost" icon={RefreshCw} onClick={() => syncWatch(w)} loading={busy === `sync:${w.id}`}>Sync now</Button>
                      <Button variant="ghost" icon={Pencil} onClick={() => nav('/watchers', { state: { editWatcherId: w.id } })}>Edit</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="primary" icon={Play} onClick={() => run(w)} disabled={runningId === w.id}>
                        {runningId === w.id ? <><Spinner /> Running…</> : 'Run'}
                      </Button>
                      <Button variant="ghost" icon={Copy} onClick={() => dup(w)}>Duplicate</Button>
                      <Button variant="ghost" icon={Download} onClick={() => exp(w)}>Export</Button>
                    </>
                  )}
                  <Button variant="ghost" onClick={() => nav('/jobs')}>Jobs</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
