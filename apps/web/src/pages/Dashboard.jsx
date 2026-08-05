import { ArrowRight, UploadCloud, Sparkles, FileSpreadsheet, Play, MapPin, FileText, Database, AlertTriangle, Eye, ChevronRight, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getStatus, getWatchers, usePoll, usePipelineEvents } from '../api';
import { Card, Stat, Badge, Button, Empty, Progress, Dot } from '../components/ui';
import PipelineVisual, { STAGES } from '../components/PipelineVisual';

export default function Dashboard({ setStatusMsg }) {
  const nav = useNavigate();
  const { data: status, refresh } = usePoll(getStatus, 3000);
  const { data: watchers } = usePoll(getWatchers, 4000);
  const wlist = watchers || [];
  const st = status || {};
  const stats = st.stats || {};
  const last = st.lastJob;

  usePipelineEvents((ev) => {
    if (ev.type === 'stage:start') setStatusMsg(`Running stage ${ev.payload?.stage}…`);
    if (ev.type === 'pipeline:complete') {
      setStatusMsg('Pipeline complete.');
      refresh();
    }
    if (ev.type === 'pipeline:error') setStatusMsg(`Pipeline error: ${ev.payload?.error || ''}`);
  });

  const running = !!st.running;

  return (
    <div className="page">
      <section className="hero">
        <span className="hero-eyebrow"><Dot tone="info" /> TerraFlow Engine</span>
        <h1 className="hero-title">{running ? 'Workflow in progress.' : 'Ready to process your first workflow.'}</h1>
        <p className="hero-sub">
          Import a KMZ export, let AI structure the listings, map everything into Excel, and ship a clean workbook — in one automated pass.
        </p>
        <div className="hero-actions">
          <Button variant="primary" size="lg" icon={running ? undefined : Play} onClick={() => nav('/import')} disabled={running}>
            {running ? 'Pipeline running…' : 'New import'}
          </Button>
          <Button variant="ghost" size="lg" icon={Plus} onClick={() => nav('/watchers', { state: { createNew: true } })}>
            Start new workflow
          </Button>
          <Button variant="ghost" size="lg" icon={FileSpreadsheet} onClick={() => nav('/templates')}>Browse templates</Button>
        </div>
        <div className="hero-meta">
          <div className="m"><b>{stats.properties ?? 0}</b>Properties indexed</div>
          <div className="m"><b>{stats.copied ?? 0}</b>Excel rows written</div>
          <div className="m"><b>{stats.failed ?? 0}</b>Failures</div>
          <div className="m"><b>{stats.duplicates ?? 0}</b>Duplicates</div>
        </div>
        {wlist.length > 0 && (
          <div className="hero-workflows">
            <div className="flex between">
              <span className="hero-eyebrow" style={{ marginBottom: 0 }}><Dot tone="ok" /> Watch workflows</span>
              <Link to="/watchers" style={{ color: 'var(--accent)', fontSize: 12.5, fontWeight: 600 }}>Manage all →</Link>
            </div>
            <div className="flex gap-8 mt-12 flex-wrap">
              {wlist.map((w) => (
                <div key={w.id} className="card pad hero-wf"
                  onClick={() => nav('/watchers', { state: { editWatcherId: w.id } })}>
                  <div className="flex gap-8 align-center">
                    <Eye size={14} style={{ color: w.runtime?.watching ? 'var(--ok)' : 'var(--text-3)' }} />
                    <b style={{ fontSize: 13 }}>{w.name}</b>
                    <Badge tone={w.runtime?.watching ? 'ok' : 'warn'}>
                      <Dot tone={w.runtime?.watching ? 'ok' : 'err'} />
                      {w.runtime?.watching ? 'Watching' : 'Stopped'}
                    </Badge>
                  </div>
                  <div className="muted text-sm mono mt-4">{w.path || '—'}</div>
                  <div className="muted text-sm mt-2">
                    {w.steps?.join(' · ')}
                    {w.mode === 'original' ? ' · modify existing' : ' · new file'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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

      <Card pad className="mt-24" title="Watch workflows" sub="Click one to open and manage it">
        {wlist.length ? (
          <div className="flex-col gap-8">
            {wlist.map((w) => (
              <div key={w.id} className="row" style={{ cursor: 'pointer' }} onClick={() => nav('/watchers', { state: { editWatcherId: w.id } })}>
                <span className="avatar" style={{ background: w.runtime?.watching ? 'rgba(52,211,153,0.12)' : 'var(--surface-2)' }}>
                  <Eye size={15} />
                </span>
                <div className="flex-col" style={{ flex: 1 }}>
                  <div className="flex gap-8 align-center">
                    <b style={{ fontSize: 13.5 }}>{w.name}</b>
                    <Badge tone={w.runtime?.watching ? 'ok' : w.runtime?.enabled ? 'info' : 'warn'}>
                      <Dot tone={w.runtime?.watching ? 'ok' : w.runtime?.enabled ? 'info' : 'err'} />
                      {w.runtime?.watching ? 'Watching' : w.runtime?.enabled ? 'Stopped' : 'Off'}
                    </Badge>
                  </div>
                  <span className="muted text-sm mono">{w.path || '—'}</span>
                  <span className="muted text-sm">
                    {w.steps?.join(' · ')}
                    {w.mode === 'original' ? ' · modify existing' : ' · create new file'}
                    {w.templateId ? ' · template' : w.targetPath ? ' · file' : ' · no destination'}
                  </span>
                </div>
                <ChevronRight size={15} style={{ color: 'var(--text-3)' }} />
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={Eye} title="No watch workflows yet" text="Create one from the Watch folder mode in the import wizard, or directly here."
            action={<Button variant="primary" size="sm" icon={Eye} onClick={() => nav('/watchers')}>New watch workflow</Button>} />
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
