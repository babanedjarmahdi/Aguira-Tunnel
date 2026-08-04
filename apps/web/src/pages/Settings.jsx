import { Database, Server, Shield, RefreshCcw, Users } from 'lucide-react';
import { Card, Field, Toggle, Button, Segmented, useToast } from '../components/ui';

export default function Settings() {
  const toast = useToast();
  const save = (what) => toast(`${what} saved`);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Appearance, language, data and system preferences.</p>
        </div>
        <Button variant="primary" onClick={() => save('All settings')}>Save all</Button>
      </div>

      <Card className="pad" title="Appearance">
        <div className="grid cols-2 gap-8">
          <Field label="Theme">
            <div className="segmented" style={{ width: '100%' }}>
              <button className="on">Dark</button>
              <button onClick={() => save('Light theme')}>Light</button>
            </div>
          </Field>
          <Field label="Interface mode">
            <Segmented options={[{ value: 'basic', label: 'Basic' }, { value: 'pro', label: 'Professional' }]} value="pro" onChange={() => save('Mode')} />
          </Field>
          <Field label="Accent color">
            <div className="flex gap-8">
              {['#22d3ee', '#3b82f6', '#8b5cf6', '#34d399', '#fbbf24'].map((c) => (
                <span key={c} style={{ width: 22, height: 22, borderRadius: 8, background: c, cursor: 'pointer', border: c === '#22d3ee' ? '2px solid var(--text)' : '1px solid transparent' }} />
              ))}
            </div>
          </Field>
        </div>
      </Card>

      <Card className="pad mt-24" title="Language & region">
        <div className="grid cols-2 gap-8">
          <Field label="Interface language">
            <select className="select"><option>English</option><option>Français</option><option>العربية</option></select>
          </Field>
          <Field label="Number format">
            <select className="select"><option>1 234 567 (space)</option><option>1,234,567</option><option>1.234.567</option></select>
          </Field>
        </div>
        <div className="flex gap-8 mt-8">
          <Toggle checked label="Format prices in Algerian Dinar conventions" />
        </div>
      </Card>

      <Card className="pad mt-24" title="Workspace & data">
        <div className="flex between" style={{ padding: '8px 0' }}>
          <div><b className="text-sm">Workspace</b><div className="muted text-sm">Shared workspace · babanedjarmahdi</div></div>
          <Button variant="ghost" icon={Users} onClick={() => toast('Workspace settings opened')}>Manage</Button>
        </div>
        <div className="flex between" style={{ padding: '8px 0' }}>
          <div><b className="text-sm">Database</b><div className="muted text-sm">PostgreSQL · localhost · 147 rows</div></div>
          <Button variant="ghost" icon={Database} onClick={() => toast('Database status opened')}>Status</Button>
        </div>
        <div className="flex between" style={{ padding: '8px 0' }}>
          <div><b className="text-sm">Server</b><div className="muted text-sm">http://localhost:3000 · SSE events</div></div>
          <Button variant="ghost" icon={Server} onClick={() => toast('Server info opened')}>Details</Button>
        </div>
      </Card>

      <Card className="pad mt-24" title="Sync, backups & updates">
        <div className="flex-col gap-16">
          <Toggle checked label="Offline-first: everything works without a connection" />
          <Toggle checked label="Auto-backup before in-place fills" />
          <Toggle label="Auto-check for engine updates" />
          <div className="flex gap-8">
            <Button variant="ghost" icon={RefreshCcw} onClick={() => toast('Checking for updates…')}>Check for updates</Button>
            <Button variant="ghost" icon={Shield} onClick={() => toast('Security audit started')}>Security audit</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
