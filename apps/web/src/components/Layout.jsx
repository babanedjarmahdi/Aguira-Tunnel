import { LayoutDashboard, UploadCloud, Workflow, Sparkles, FileSpreadsheet, Eye, Settings, TerminalSquare, Info, Bell, Search, ChevronDown } from 'lucide-react';
import Logo from './Logo';
import { Dot } from './ui';

export const NAV = [
  { id: '/', label: 'Dashboard', icon: LayoutDashboard },
  { id: '/workflows', label: 'Workflows', icon: Workflow },
  { id: '/import', label: 'Import workflow', icon: UploadCloud },
  { id: '/watchers', label: 'Watch workflows', icon: Eye, pro: true },
  { id: '/ai', label: 'AI Configuration', icon: Sparkles, pro: true },
  { id: '/templates', label: 'Excel Templates', icon: FileSpreadsheet, pro: true },
];
export const NAV_BOTTOM = [
  { id: '/settings', label: 'Settings', icon: Settings, pro: true },
  { id: '/logs', label: 'Logs', icon: TerminalSquare, pro: true },
  { id: '/about', label: 'About', icon: Info },
];

export function Sidebar({ route, go, mode, setMode }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo size={30} />
        <div>
          <div className="brand-name">TerraFlow</div>
          <div className="brand-sub">Engine</div>
        </div>
      </div>

      <div className="nav-label">Workspace</div>
      {NAV.map((n) => {
        const Icon = n.icon;
        return (
          <div key={n.id} className={`nav-item ${route === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
            <Icon />
            {n.label}
            {n.pro && <span className="pro-tag">PRO</span>}
          </div>
        );
      })}

      <div className="spacer" />

      <div className="mode-switch">
        <button className={mode === 'basic' ? 'on' : ''} onClick={() => setMode('basic')}>Basic</button>
        <button className={mode === 'pro' ? 'on' : ''} onClick={() => setMode('pro')}>Professional</button>
      </div>

      {NAV_BOTTOM.map((n) => {
        const Icon = n.icon;
        return (
          <div key={n.id} className={`nav-item ${route === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
            <Icon />
            {n.label}
            {n.pro && <span className="pro-tag">PRO</span>}
          </div>
        );
      })}
    </aside>
  );
}

export function TopBar({ route, provider, connected }) {
  return (
    <header className="topbar">
      <span className="crumb">
        TerraFlow <span style={{ margin: '0 4px' }}>/</span> <b>{route === '/' ? 'Dashboard' : routeLabel(route)}</b>
      </span>
      <div className="grow" />
      {connected === false && <span className="chip"><Dot tone="err" /> Reconnecting…</span>}
      <span className="chip"><Dot /> {provider ? `AI: ${provider}` : 'AI: —'}</span>
      <button className="icon-btn" title="Search"><Search /></button>
      <button className="icon-btn" title="Notifications"><Bell /><span className="ping" /></button>
      <div className="flex gap-8">
        <div className="avatar">MJ</div>
        <ChevronDown size={14} style={{ color: 'var(--text-3)' }} />
      </div>
    </header>
  );
}

function routeLabel(r) {
  const all = [...NAV, ...NAV_BOTTOM];
  const n = all.find((x) => x.id === r);
  return n ? n.label : '…';
}

export function StatusBar({ msg, running, connected }) {
  return (
    <footer className="statusbar">
      <Dot tone={running ? 'info' : 'ok'} />
      <span className="live">{msg}</span>
      <span className="nowrap">v0.5 · {connected ? 'SSE connected' : 'SSE offline'}</span>
      <span className="nowrap">localhost:3000</span>
    </footer>
  );
}
