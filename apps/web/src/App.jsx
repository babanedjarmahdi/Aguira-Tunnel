import { useState } from 'react';
import { HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, TopBar, StatusBar } from './components/Layout';
import { ToastProvider } from './components/ui';
import { usePipelineEvents, usePoll, getStatus, getConfig } from './api';
import Dashboard from './pages/Dashboard';
import ImportWizard from './pages/ImportWizard';
import Jobs from './pages/Jobs';
import Workflows from './pages/Workflows';
import AIConfig from './pages/AIConfig';
import ExcelTemplates from './pages/ExcelTemplates';
import Watchers from './pages/Watchers';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import About from './pages/About';

function ProGate({ mode, children }) {
  if (mode === 'pro') return children;
  return (
    <div className="page">
      <div className="card pad pro-lock">
        <h1 className="page-title">Professional mode</h1>
        <p className="page-sub">This feature is part of Professional mode. Enable it in the sidebar (Basic / Professional) to unlock AI configuration, template manager, watchers, logs and settings.</p>
      </div>
    </div>
  );
}

function Shell() {
  const loc = useLocation();
  const nav = useNavigate();
  const [mode, setMode] = useState(() => localStorage.getItem('tf:mode') || 'basic');
  const [statusMsg, setStatusMsg] = useState('TerraFlow Engine ready.');
  const [running, setRunning] = useState(false);
  const [provider, setProvider] = useState('');
  const { data: status } = usePoll(getStatus, 3000);
  const { data: config } = usePoll(getConfig, 8000);

  const switchMode = (m) => {
    setMode(m);
    localStorage.setItem('tf:mode', m);
  };

  const sse = usePipelineEvents((ev) => {
    if (ev.type === 'stage:start') { setRunning(true); setStatusMsg(`Running stage ${ev.payload?.stage}…`); }
    if (ev.type === 'stage:end') setStatusMsg(`Stage ${ev.payload?.stage} complete.`);
    if (ev.type === 'pipeline:complete') { setRunning(false); setStatusMsg('Pipeline complete.'); }
    if (ev.type === 'pipeline:error') { setRunning(false); setStatusMsg('Pipeline error — check logs.'); }
  });

  const realRunning = running || !!status?.running;
  const prov = provider || config?.ai?.provider || '—';

  const go = (id) => nav(id);

  return (
    <div className="app-shell">
      <Sidebar route={loc.pathname} go={go} mode={mode} setMode={switchMode} />
      <div className="main">
        <TopBar route={loc.pathname} provider={prov} connected={sse.connected} />
        <Routes>
          <Route path="/" element={<Dashboard setStatusMsg={setStatusMsg} />} />
          <Route path="/import" element={<ImportWizard />} />
          <Route path="/jobs" element={<Jobs setStatusMsg={setStatusMsg} />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/ai" element={<ProGate mode={mode}><AIConfig /></ProGate>} />
          <Route path="/templates" element={<ProGate mode={mode}><ExcelTemplates /></ProGate>} />
          <Route path="/watchers" element={<ProGate mode={mode}><Watchers /></ProGate>} />
          <Route path="/settings" element={<ProGate mode={mode}><Settings mode={mode} setMode={switchMode} /></ProGate>} />
          <Route path="/logs" element={<ProGate mode={mode}><Logs /></ProGate>} />
          <Route path="/about" element={<About />} />
        </Routes>
      </div>
      <StatusBar msg={statusMsg} running={realRunning} connected={sse.connected} />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </ToastProvider>
  );
}
