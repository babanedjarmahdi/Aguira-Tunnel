import { useState } from 'react';
import { Workflow as WorkflowIcon, Plus, Play, Trash2, X, ChevronDown, ChevronUp, GitBranch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getWorkflows, createWorkflow, updateWorkflow, deleteWorkflow, runWorkflow, usePoll } from '../api';
import { Card, Badge, Button, Empty, Field, Segmented, Toggle, useToast, Spinner, Dot } from '../components/ui';

const ALL_STEPS = [
  { id: 'extract', label: 'Extract (KMZ)' },
  { id: 'ai', label: 'AI analysis' },
  { id: 'db', label: 'Database sync' },
  { id: 'fill', label: 'Excel copy fill' },
  { id: 'fill:original', label: 'Original fill' },
];

const tone = (s) => (s === 'completed' ? 'ok' : s === 'failed' ? 'err' : s === 'running' ? 'info' : 'warn');

export default function Workflows() {
  const toast = useToast();
  const nav = useNavigate();
  const { data: workflows, refresh } = usePoll(getWorkflows, 4000);
  const list = workflows || [];

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState(['extract', 'ai', 'db']);
  const [mode, setMode] = useState('copy');
  const [autoApply, setAutoApply] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');

  const toggleStep = (id) => {
    setSteps((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const save = async () => {
    if (!name.trim()) { toast('Give the workflow a name', 'err'); return; }
    if (!steps.length) { toast('Pick at least one stage', 'err'); return; }
    setSaving(true);
    try {
      await createWorkflow({
        name: name.trim(),
        workflowType: 'basic',
        steps,
        destination: { mode },
        autoApply,
      });
      toast('Workflow created');
      setOpen(false); setName(''); setSteps(['extract', 'ai', 'db']); setMode('copy'); setAutoApply(false);
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
      toast(`Workflow run started (job #${res.job.id})`);
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setRunningId(null);
    }
  };

  const remove = async (w) => {
    if (!window.confirm(`Delete workflow "${w.name}"?`)) return;
    try {
      await deleteWorkflow(w.id);
      toast('Workflow deleted');
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const startRename = (w) => { setRenaming(w.id); setRenameVal(w.name); };
  const commitRename = async (w) => {
    if (renameVal.trim() && renameVal.trim() !== w.name) {
      try {
        await updateWorkflow(w.id, { name: renameVal.trim() });
        refresh();
      } catch (e) { toast(e.message, 'err'); }
    }
    setRenaming(null);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Workflows</h1>
          <p className="page-sub">Create multiple reusable stage sequences and run each one as an import job in one click.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setOpen((o) => !o)}>{open ? 'Close' : 'New workflow'}</Button>
      </div>

      {open && (
        <Card className="pad mb-16" title="New workflow" sub="Compose the stages this workflow will run each time it's triggered.">
          <div className="grid cols-2 gap-16">
            <div className="flex-col gap-16">
              <Field label="Workflow name">
                <input className="input" placeholder="e.g. Weekly listing import" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
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
            </div>
            <div className="flex-col gap-16">
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
              <Field label="Auto-apply" hint="Skip the draft review and write straight to Excel after the pipeline finishes.">
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
        <Card pad><Empty icon={WorkflowIcon} title="No workflows yet" text="Create a workflow to save a stage sequence and run it in one click." /></Card>
      ) : (
        <div className="grid cols-2">
          {list.map((w) => (
            <Card key={w.id} className="hoverable pad">
              <div className="flex between">
                <div className="flex gap-8" style={{ minWidth: 0 }}>
                  <GitBranch size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
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
                  {w.lastStatus && <Badge tone={tone(w.lastStatus)}><Dot tone={tone(w.lastStatus)} /> {w.lastStatus}</Badge>}
                  <Button variant="ghost" icon={Plus} onClick={() => startRename(w)} title="Rename" />
                  <Button variant="ghost" icon={Trash2} onClick={() => remove(w)} title="Delete" />
                </div>
              </div>
              <p className="card-sub mt-8">
                {w.runs} run{w.runs === 1 ? '' : 's'}
                {w.lastRunAt ? ` · last ${new Date(w.lastRunAt).toLocaleString()}` : ''}
                {w.autoApply ? ' · auto-apply' : ''}
              </p>
              <div className="flex gap-8 mt-16 flex-wrap">
                {w.steps.map((s) => <Badge key={s} tone="info">{s}</Badge>)}
              </div>
              <div className="flex gap-8 mt-16">
                <Button variant="primary" icon={Play} onClick={() => run(w)} disabled={runningId === w.id}>
                  {runningId === w.id ? <><Spinner /> Running…</> : 'Run'}
                </Button>
                <Button variant="ghost" onClick={() => nav('/jobs')}>Jobs</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
