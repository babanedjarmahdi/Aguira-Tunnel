import { Layers, Sparkles, Database, FileSpreadsheet, Github, Heart } from 'lucide-react';
import { Card, Badge } from '../components/ui';
import Logo from '../components/Logo';

export default function About() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">About</h1>
          <p className="page-sub">TerraFlow Engine — a premium desktop app for turning raw GIS exports into structured business data.</p>
        </div>
        <Badge tone="info">v0.4</Badge>
      </div>

      <Card className="pad" style={{ textAlign: 'center', padding: '44px 24px' }}>
        <Logo size={64} />
        <h2 style={{ margin: '16px 0 4px', fontSize: 24, letterSpacing: '-0.03em' }}>TerraFlow Engine</h2>
        <p className="muted" style={{ maxWidth: 520, margin: '0 auto' }}>
          TerraFlow turns your files into structured, fillable data — processed by AI, persisted in PostgreSQL,
          and written to the workbooks you choose, all in one automated pipeline with live, resumable telemetry.
        </p>
        <div className="flex gap-8 mt-24" style={{ justifyContent: 'center' }}>
          <Badge>MIT license</Badge>
          <Badge>v0.4 · 2026</Badge>
          <Badge tone="info">by babanedjarmahdi</Badge>
        </div>
      </Card>

      <div className="grid cols-3 mt-24">
        <StackCard icon={Layers} title="Extract" text="Input parsing, deduplication and normalization." />
        <StackCard icon={Sparkles} title="AI analysis" text="Resume-safe, paced structuring via a pluggable provider." />
        <StackCard icon={FileSpreadsheet} title="Workbook fill" text="Shared-formula-safe writes into template copies with backups." />
      </div>

      <div className="mt-24">
        <Card className="pad" title="Stack">
          <div className="table-wrap">
            <table className="tbl">
              <tbody>
                <tr><td>Frontend</td><td className="mono">React 18 · Vite 5 · React Router · lucide-react</td></tr>
                <tr><td>API</td><td className="mono">Node 20 · Express · Server-Sent Events</td></tr>
                <tr><td>Engine</td><td className="mono">@terraflow/engine · staged pipeline with structured events</td></tr>
                <tr><td>Database</td><td className="mono">PostgreSQL 16 (docker-compose)</td></tr>
                <tr><td>Workbooks</td><td className="mono">exceljs · copy-first fills · D8 clone promotion</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="flex gap-8 mt-24" style={{ justifyContent: 'center', color: 'var(--text-3)' }}>
        <Github size={16} /> github.com/babanedjarmahdi/TerraFlow
        <span style={{ marginLeft: 8 }}>·</span>
        <Heart size={16} style={{ color: 'var(--error)' }} /> built with care
      </div>
    </div>
  );
}

function StackCard({ icon: Icon, title, text }) {
  return (
    <Card className="pad">
      <span className="avatar" style={{ background: 'rgba(34,211,238,0.1)', color: 'var(--accent)', marginBottom: 12 }}><Icon size={16} /></span>
      <h3 className="card-title">{title}</h3>
      <p className="text-sm muted" style={{ margin: 0 }}>{text}</p>
    </Card>
  );
}
