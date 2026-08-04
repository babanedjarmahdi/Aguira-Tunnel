import { FileSpreadsheet, Download, Plus, RefreshCcw, Columns3, Pencil } from 'lucide-react';
import { Card, Badge, Button, Empty } from '../components/ui';

export default function ExcelTemplates() {
  const templates = [
    {
      name: 'CRM_GPT_Immobilier_Employees_V8_10_2_2',
      sheet: 'العقارات',
      startRow: 174,
      cols: 10,
      status: 'Ready',
      filled: 'output/excel/CRM_GPT_Immobilier_Employees_V8_10_2_2_filled.xlsx',
      copied: 147,
    },
  ];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Excel templates</h1>
          <p className="page-sub">The target workbooks the fill stage writes into. Originals are never overwritten — copies always.</p>
        </div>
        <Button variant="primary" icon={Plus}>Add template</Button>
      </div>

      {templates.length === 0 ? (
        <Card pad><Empty icon={FileSpreadsheet} title="No templates yet" text="Point the engine at a workbook and define which sheet and rows to fill." /></Card>
      ) : (
        <div className="grid cols-2">
          {templates.map((t) => (
            <Card key={t.name} className="hoverable pad">
              <div className="flex between">
                <div className="flex gap-8" style={{ maxWidth: '70%' }}>
                  <span className="avatar" style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--success)' }}><FileSpreadsheet size={16} /></span>
                  <b style={{ fontSize: 13.5, wordBreak: 'break-all' }}>{t.name}</b>
                </div>
                <Badge tone="ok">{t.status}</Badge>
              </div>
              <div className="grid cols-2 mt-16 gap-8">
                <Mini label="Sheet" value={t.sheet} />
                <Mini label="Start row" value={t.startRow} />
                <Mini label="Columns" value={t.cols} />
                <Mini label="Rows copied" value={t.copied} />
              </div>
              <p className="muted mono text-sm mt-16" style={{ wordBreak: 'break-all' }}>{t.filled}</p>
              <div className="flex gap-8 mt-16">
                <Button variant="ghost" icon={Download}>Download copy</Button>
                <Button variant="ghost" icon={RefreshCcw}>Refill</Button>
                <Button variant="ghost" icon={Columns3}>Map columns</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-24">
        <Card className="pad" title="Fill safety rules">
          <ul className="text-sm muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 2 }}>
            <li>Outputs are always written to a <b>copy</b> — the committed original stays untouched.</li>
            <li>In-place fill (<span className="mono">fill:original</span>) requires an explicit command and creates a backup first.</li>
            <li>Shared-formula columns are promoted safely before writing (decision D8).</li>
            <li>Each cell that overrides a formula is cleared only after its clones are made standalone.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Mini({ label, value }) {
  return <div><div className="muted text-sm">{label}</div><b style={{ fontSize: 13 }}>{value}</b></div>;
}
