import { useState, useEffect } from 'react';
import { ArrowRight, UploadCloud, Sparkles, FileSpreadsheet, Play, MapPin, FileText, Database, AlertTriangle, Eye, ChevronRight, Plus, Workflow as WorkflowIcon, Activity } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getStatus, getAllWorkflows, getJob, usePoll, usePipelineEvents } from '../api';
import { Card, Stat, Badge, Button, Empty, Progress, Dot } from '../components/ui';
import PipelineVisual, { STAGES } from '../components/PipelineVisual';
import NewWorkflowChooser from '../components/NewWorkflowChooser';

const tone = (s) => (s === 'completed' ? 'ok' : s === 'failed' ? 'err' : s === 'running' ? 'info' : 'warn');

export default function Dashboard({ setStatusMsg }) {
  const nav = useNavigate();
  const { data: status, refresh } = usePoll(getStatus, 3000);
  const { data: workflows } = usePoll(getAllWorkflows, 4000);
  const wlist = workflows || [];
  const [showNew, setShowNew] = useState(false);
  const [runningJob, setRunningJob] = useState(null);
  const st = status || {};
  const stats = st.stats || {};
  const last = st.lastJob;

  useEffect(() => {
    if (st.running && st.currentJobId) {
      let alive = true;
      const tick = () => getJob(st.currentJobId).then((j) => { if (alive) setRunningJob(j); }).catch(() => {});
      tick();
      const t = setInterval(tick, 3000);
      return () => { alive = false; clearInterval(t); };
    }
    setRunningJob(null);
    return undefined;
  }, [st.running, st.currentJobId]);

  const runningFlow = runningJob
    ? (runningJob.workflowId ? wlist.find((w) => w.type === 'import' && w.id === runningJob.workflowId)
        : wlist.find((w) => w.type === 'watch' && w.id === runningJob.watcherId)) || null
    : null;
  const flowName = runningFlow ? runningFlow.name : '';
  const running = !!st.running;

  usePipelineEvents((ev) => {
    if (ev.type === 'stage:start') setStatusMsg(`Running stage ${ev.payload?.stage}…`);
    if (ev.type === 'pipeline:complete') {
      setStatusMsg('Pipeline complete.');
      refresh();
    }
    if (ev.type === 'pipeline:error') setStatusMsg(`Pipeline error: ${ev.payload?.error || ''}`);
  });

  return (
    <div className="page">
      <section className="hero">
        <span className="hero-eyebrow"><Dot tone="info" /> TerraFlow Engine</span>
        <h1 className="hero-title">{running ? 'Workflow in progress.' : 'Your workflows, one dashboard.'}</h1>
        <p className="hero-sub">
          Workflows are the unit of work. Import workflows run once — a KMZ export becomes a filled Excel workbook.
          Watch workflows run in the background — a folder is re-synced automatically. Both share the same pipeline.
        </p>
        <div className="hero-actions">
          <Button variant="primary" size="lg" icon={running ? undefined : Play} onClick={() => setShowNew(true)} disabled={running}>
            {running ? 'Pipeline running…' : 'Start a new workflow'}
          </Button>
          <Button variant="ghost" size="lg" icon={UploadCloud} onClick={() => nav('/import')}>New import</Button>
          <Button variant="ghost" size="lg" icon={FileSpreadsheet} onClick={() => nav('/templates')}>Browse templates</Button>
        </div>
        <div className="hero-meta">
          <div className="m"><b>{stats.properties ?? 0}</b>Properties indexed</div>
          <div className="m"><b>{stats.copied ?? 0}</b>Excel rows written</div>
          <div className="m"><b>{stats.failed ?? 0}</b>Failures</div>
          <div className="m"><b>{stats.duplicates ?? 0}</b>Duplicates</div>
        </div>
        {running && (
          <div className="hero-running">
            <div className="flex gap-8" style={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
              <span className="avatar" style={{ background: 'rgba(34,211,238,0.14)' }}><Activity size={15} /></span>
              <div className="flex-col" style={{ minWidth: 0, flex: 1 }}>
                <div className="flex gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 14 }}>Running now{flowName ? `: ${flowName}` : ''}</b>
                  {runningFlow && <Badge tone="info">{runningFlow.type === 'watch' ? 'watch' : 'import'}</Badge>}
                </div>
                <span className="muted text-sm">
                  {st.currentStage ? <>Stage <b style={{ color: 'var(--text)' }}>{st.currentStage}</b></> : 'Starting…'}
                  {runningFlow && <> · {runningFlow.type === 'watch' ? runningFlow.path : (runningFlow.input?.sourceDir || 'one-shot')}</>}
                </span>
              </div>
              <Button variant="primary" size="sm" icon={Play} onClick={() => nav('/jobs')}>Open run</Button>
            </div>
            <Progress indeterminate style={{ marginTop: 10 }} />
          </div>
        )}
        {wlist.length > 0 && (
          <div className="hero-workflows">
            <div className="flex between">
              <span className="hero-eyebrow" style={{ marginBottom: 0 }}><Dot tone="ok" /> Workflows</span>
              <Link to="/workflows" style={{ color: 'var(--accent)', fontSize: 12.5, fontWeight: 600 }}>Manage all →</Link>
            </div>
            <div className="flex gap-8 mt-12 flex-wrap">
              {wlist.slice(0, 6).map((w) => {
                const isWatch = w.type === 'watch';
                const watching = isWatch && w.runtime?.watching;
                const isRunningFlow = runningFlow && runningFlow.id === w.id && runningFlow.type === w.type;
                return (
                  <div key={`${w.type}:${w.id}`} className={`card pad hero-wf ${isRunningFlow ? 'is-running' : ''}`}
                    onClick={() => (isWatch ? nav('/watchers', { state: { editWatcherId: w.id } }) : nav('/workflows'))}>
                    <div className="flex gap-8" style={{ alignItems: 'center' }}>
                      {isWatch ? <Eye size={14} style={{ color: watching ? 'var(--ok)' : 'var(--text-3)' }} /> : <Play size={14} style={{ color: 'var(--accent)' }} />}
                      <b style={{ fontSize: 13 }}>{w.name}</b>
                      <Badge tone={isRunningFlow ? 'info' : isWatch ? (watching ? 'ok' : 'warn') : 'info'}>
                        <Dot tone={isRunningFlow ? 'info' : isWatch ? (watching ? 'ok' : 'err') : 'info'} />
                        {isRunningFlow ? 'Running…' : isWatch ? (watching ? 'Watching' : 'Stopped') : 'import'}
                      </Badge>
                    </div>
                    <div className="muted text-sm mono mt-4">{isWatch ? (w.path || '—') : (w.input?.sourceDir || 'one-shot')}</div>
                    <div className="flex gap-8" style={{ color: 'var(--accent)', marginTop: 8, fontSize: 12, fontWeight: 600, alignItems: 'center' }}>
                      Manage <ChevronRight size={12} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {showNew && <NewWorkflowChooser onClose={() => setShowNew(false)} />}
      </section>

      <div className="mt-24">
        <Card pad>
          <div className="flex between mb-16">
            <div>
              <h3 className="card-title">Import pipeline</h3>
              <p className="card-sub">extract → AI analysis → database → Excel copy → original fill</p>
            </div>
            {last && <Badge tone={last.status === 'error' ? 'err' : last.status === 'success' ? 'ok' : 'info'}>{last.status}</Badge>}
          </div>
          <PipelineVisual current={running ? (st.currentStage || 'extract') : null} done={running ? [] : []} />
          {running && (
            <div className="mt-16">
              <Progress indeterminate />
              <p className="text-sm muted mt-8">Stage <b style={{ color: 'var(--text)' }}>{st.currentStage || '…'}</b> is running.</p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid cols-4 mt-24">
        <Stat label="Properties" value={stats.properties ?? 0} icon={MapPin} />
        <Stat label="AI analyses" value={stats.aiAnalyzed ?? stats.properties ?? 0} icon={Sparkles} />
        <Stat label="Rows written" value={stats.copied ?? 0} icon={FileText} />
        <Stat label="Database rows" value={stats.dbRows ?? 0} icon={Database} />
      </div>

      <div className="grid cols-2 mt-24">
        <Card pad title="Quick actions" sub="Common starting points">
          <div className="flex-col gap-8">
            <QuickAction icon={UploadCloud} title="Import a KMZ file" text="Run the full extract → AI → Excel pipeline" onClick={() => nav('/import')} />
            <QuickAction icon={Eye} title="Watch a folder" text="Create a watch workflow — folder, destination and stages" onClick={() => nav('/watchers')} />
            <QuickAction icon={Play} title="Manage workflows" text="Saved pipelines: input folder, template and AI model" onClick={() => nav('/workflows')} />
            <QuickAction icon={Sparkles} title="Tune AI configuration" text="Provider, model, prompt and pacing" onClick={() => nav('/ai')} />
            <QuickAction icon={FileSpreadsheet} title="Manage Excel templates" text="Start row, sheet, columns and notes" onClick={() => nav('/templates')} />
          </div>
        </Card>
        <Card pad title="Recent activity" sub="Latest pipeline runs">
          {last ? (
            <div className="flex-col gap-8">
              <div className="row" style={{ cursor: 'pointer' }} onClick={() => nav('/jobs')}>
                <ActivityRow icon={Play} title={`Run ${last.jobId || ''}`.trim() || 'Last run'}
                  detail={`${last.stagesDone || 0}/5 stages · finished ${last.finishedAt ? new Date(last.finishedAt).toLocaleString() : '—'}`}
                  tone={last.status === 'error' ? 'err' : 'ok'} />
                <ChevronRight size={15} style={{ color: 'var(--text-3)' }} />
              </div>
              {last.error && (
                <div className="flex gap-8 text-sm" style={{ color: 'var(--error)' }}>
                  <AlertTriangle size={14} /> {last.error}
                </div>
              )}
              <Link to="/import" style={{ color: 'var(--accent)', fontSize: 12.5, fontWeight: 600 }}>View history →</Link>
            </div>
          ) : (
            <Empty icon={Play} title="No runs yet" text="Your first pipeline run will show up here with live stage progress." />
          )}
        </Card>
      </div>

      <Card pad className="mt-24" title="Workflows" sub="Import (one-shot) and watch (background) — click one to manage">
        {wlist.length ? (
          <div className="flex-col gap-8">
            {wlist.map((w) => {
              const isWatch = w.type === 'watch';
              const watching = isWatch && w.runtime?.watching;
              return (
                <div key={`${w.type}:${w.id}`} className="row" style={{ cursor: 'pointer' }}
                  onClick={() => (isWatch ? nav('/watchers', { state: { editWatcherId: w.id } }) : nav('/workflows'))}>
                  <span className="avatar" style={{ background: isWatch ? (watching ? 'rgba(52,211,153,0.12)' : 'var(--surface-2)') : 'rgba(34,211,238,0.12)' }}>
                    {isWatch ? <Eye size={15} /> : <Play size={15} />}
                  </span>
                  <div className="flex-col" style={{ flex: 1 }}>
                    <div className="flex gap-8" style={{ alignItems: 'center' }}>
                      <b style={{ fontSize: 13.5 }}>{w.name}</b>
                      <Badge tone="info">{isWatch ? 'watch' : 'import'}</Badge>
                      <Badge tone={isWatch ? (watching ? 'ok' : w.runtime?.enabled ? 'info' : 'warn') : (w.lastStatus ? tone(w.lastStatus) : 'info')}>
                        <Dot tone={isWatch ? (watching ? 'ok' : w.runtime?.enabled ? 'info' : 'err') : (w.lastStatus ? tone(w.lastStatus) : 'info')} />
                        {isWatch ? (watching ? 'Watching' : w.runtime?.enabled ? 'Stopped' : 'Off') : (w.lastStatus || 'ready')}
                      </Badge>
                    </div>
                    <span className="muted text-sm mono">{isWatch ? (w.path || '—') : (w.input?.sourceDir || 'one-shot import')}</span>
                    <span className="muted text-sm">
                      {w.steps?.join(' · ')}
                      {isWatch ? (w.mode === 'original' ? ' · modify existing' : ' · create new file') : ''}
                    </span>
                  </div>
                  <ChevronRight size={15} style={{ color: 'var(--text-3)' }} />
                </div>
              );
            })}
          </div>
        ) : (
          <Empty icon={WorkflowIcon} title="No workflows yet" text="Workflows are the unit of work — import (one-shot) or watch (background)."
            action={<Button variant="primary" size="sm" icon={Play} onClick={() => setShowNew(true)}>Start a new workflow</Button>} />
        )}
      </Card>
    </div>
  );
}

function QuickAction({ icon: Icon, title, text, onClick }) {
  return (
    <div className="row" style={{ cursor: 'pointer' }} onClick={onClick}>
      <span className="avatar" style={{ background: 'var(--surface-2)' }}><Icon size={15} /></span>
      <div className="flex-col" style={{ flex: 1 }}>
        <b style={{ fontSize: 13.5 }}>{title}</b>
        <span className="muted text-sm">{text}</span>
      </div>
      <ArrowRight size={15} style={{ color: 'var(--text-3)' }} />
    </div>
  );
}

function ActivityRow({ icon: Icon, title, detail, tone }) {
  return (
    <div className="flex gap-8">
      <Dot tone={tone} />
      <div className="flex-col gap-2">
        <b style={{ fontSize: 13 }}>{title}</b>
        <span className="muted text-sm">{detail}</span>
      </div>
    </div>
  );
}
