import { useNavigate } from 'react-router-dom';
import { Eye, FolderTree, Layers, RefreshCw, Radar, ShieldAlert, Monitor, ArrowLeft } from 'lucide-react';
import { Card, Button, Badge } from '../components/ui';

const STEPS = [
  { icon: FolderTree, title: 'Watch a folder or file', text: 'Point at any folder (e.g. a GOOGLE EARTH export) or a single file, with a debounce so bursts of changes run as one batch.' },
  { icon: Layers, title: 'Run your workflow stages', text: 'On every change the watched input runs its own stages — extract, AI analysis, database sync, fill or modify a workbook.' },
  { icon: RefreshCw, title: 'Apply automatically', text: 'Auto-apply updates the destination, or review each batch first. Run-on-startup resumes watchers after a restart.' },
];

const LIMITS = [
  { title: 'Continuous background execution', text: 'A watcher must stay alive in the background for hours or days. A website tab is paused, throttled or closed by the browser.' },
  { title: 'Direct access to your machine', text: 'Watching needs read/write access to local folders and disks — exactly what browsers refuse to grant to sites from the internet.' },
  { title: 'Running local processes', text: 'The engine spawns native processes and keeps files open. A hosted web page cannot do that in the browser sandbox.' },
  { title: 'Your files stay local', text: 'Nothing leaves your machine: watch paths, workbooks and data are processed on your own disk — the web version has nowhere to put them.' },
];

export default function WatcherLanding() {
  const nav = useNavigate();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Watch workflows</h1>
          <p className="page-sub">Turn folder and file changes into automatic import jobs.</p>
        </div>
        <Badge tone="warn">Desktop only</Badge>
      </div>

      <Card className="pad mb-16">
        <div className="flex gap-16" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="icon-tile" style={{ background: 'rgba(59,130,246,.12)' }}>
            <Eye size={28} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>What is a watch workflow?</h2>
            <p className="card-sub mt-8" style={{ marginBottom: 0 }}>
              A workflow that runs in the background: you choose a folder or a single file, pick the stages
              (extract → AI → database → fill), and every time that path changes TerraFlow syncs it through
              the pipeline automatically — or on demand with <b>Sync now</b>.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid cols-3 gap-16 mb-16">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.title} className="pad">
              <div className="flex gap-8" style={{ alignItems: 'center' }}>
                <Icon size={17} style={{ color: 'var(--accent)' }} />
                <b style={{ fontSize: 14 }}>{s.title}</b>
              </div>
              <p className="card-sub mt-8" style={{ marginBottom: 0 }}>{s.text}</p>
            </Card>
          );
        })}
      </div>

      <Card className="pad mb-16" title="Why it isn't available on the web version" sub="Watch workflows need permissions that a website can never have — so they ship in the desktop TerraFlow engine, not on this site.">
        <div className="grid cols-2 gap-16">
          {LIMITS.map((l) => (
            <div key={l.title} className="flex gap-8" style={{ alignItems: 'flex-start' }}>
              <ShieldAlert size={17} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <b style={{ fontSize: 13.5 }}>{l.title}</b>
                <p className="card-sub" style={{ marginTop: 4, marginBottom: 0 }}>{l.text}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="pad">
        <div className="flex gap-16" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="icon-tile" style={{ background: 'rgba(16,185,129,.12)' }}>
            <Monitor size={28} style={{ color: 'var(--ok)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>Available in the desktop version</h2>
            <p className="card-sub mt-8" style={{ marginBottom: 0 }}>
              TerraFlow's watch workflows run on the local engine, where the app has the system permissions it needs.
              Install the desktop build to get the full Watch workflows page.
            </p>
          </div>
          <div className="flex gap-8">
            <Button variant="primary" icon={Radar} onClick={() => nav('/workflows')}>Open Workflows</Button>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => nav('/')}>Back to dashboard</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
