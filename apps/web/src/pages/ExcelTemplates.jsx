import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Download, Plus, RefreshCcw, Columns3, Trash2, X, Save, AlertTriangle } from 'lucide-react';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, mapTemplate, uploadFile, templateDownloadUrl } from '../api';
import { Card, Badge, Button, Empty, Spinner, useToast } from '../components/ui';

const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function ExcelTemplates() {
  const toast = useToast();
  const [templates, setTemplates] = useState(null);
  const [editors, setEditors] = useState({});
  const newInput = useRef(null);

  const load = () => getTemplates().then((r) => setTemplates(r.templates)).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);

  const register = async (file) => {
    const upload = await uploadFile(file);
    const template = await createTemplate({ name: file.name.replace(/\.(xlsx|xlsm)$/i, ''), file: upload.file });
    toast(`Template registered: ${template.template.name} (v${template.template.versions.at(-1).version})`);
    setEditors({});
    load();
  };

  const handleNewFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    register(f).catch((err) => toast(`Upload failed: ${err.message}`, 'err'));
  };

  const addVersion = async (t, file) => {
    const upload = await uploadFile(file);
    const template = await createTemplate({ name: t.name, file: upload.file });
    toast(`New version saved: ${template.template.name} (v${template.template.versions.at(-1).version})`);
    setEditors({});
    load();
  };

  const openMap = async (id) => {
    setEditors((ed) => ({ ...ed, [id]: { info: null, rows: null, loading: true } }));
    try {
      const info = await mapTemplate(id);
      const rows = info.mapping.map((m) => ({ aiField: m.aiField, excelColumn: m.excelColumn, included: true, status: m.status }));
      setEditors((ed) => ({ ...ed, [id]: { info, rows, loading: false } }));
    } catch (e) {
      toast(e.message, 'err');
      setEditors((ed) => ({ ...ed, [id]: undefined }));
    }
  };

  const setRow = (id, idx, patch) => setEditors((ed) => {
    const rows = ed[id].rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    return { ...ed, [id]: { ...ed[id], rows } };
  });

  const saveMapping = async (id) => {
    const { rows } = editors[id];
    try {
      const mapping = rows.filter((r) => r.included).map((r) => ({ aiField: r.aiField, excelColumn: r.excelColumn }));
      await updateTemplate(id, { mapping });
      toast('Mapping saved — jobs loading this template will use it');
      setEditors((ed) => ({ ...ed, [id]: undefined }));
      load();
    } catch (e) {
      toast(`Save failed: ${e.message}`, 'err');
    }
  };

  const remove = async (id, name) => {
    if (!window.confirm(`Delete template "${name}" and all its versions?`)) return;
    try {
      await deleteTemplate(id);
      toast(`Deleted ${name}`);
      load();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  if (!templates) {
    return <div className="page"><div className="flex gap-8"><Spinner size={18} /> Loading templates…</div></div>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Excel templates</h1>
          <p className="page-sub">The target workbooks the fill stage writes into. Originals are never overwritten — copies always.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => newInput.current?.click()}>Add template</Button>
        <input ref={newInput} type="file" accept=".xlsx,.xlsm" hidden onChange={handleNewFile} />
      </div>

      {templates.length === 0 ? (
        <Card pad><Empty icon={FileSpreadsheet} title="No templates yet" text="Upload the workbook the fill stage should write into (a copy is stored; your original stays untouched)." action={<Button variant="primary" icon={Plus} onClick={() => newInput.current?.click()}>Add template</Button>} /></Card>
      ) : (
        <div className="grid cols-2">
          {templates.map((t) => (
            <Card key={t.id} className="pad">
              <div className="flex between">
                <div className="flex gap-8" style={{ maxWidth: '72%' }}>
                  <span className="avatar" style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--success)' }}><FileSpreadsheet size={16} /></span>
                  <b style={{ fontSize: 13.5, wordBreak: 'break-all' }}>{t.name}</b>
                </div>
                <Badge tone={t.versions.at(-1)?.error ? 'err' : t.config?.mapping ? 'ok' : 'warn'}>
                  {t.versions.at(-1)?.error ? 'unreadable' : t.config?.mapping ? 'mapped' : 'ready'}
                </Badge>
              </div>

              <div className="grid cols-2 mt-16 gap-8">
                <Mini label="Sheet" value={t.config?.sheet || '—'} />
                <Mini label="Start row" value={t.config?.startRow ?? '—'} />
                <Mini label="Columns" value={t.config?.headers?.length || '—'} />
                <Mini label="Versions" value={t.versions.length} />
              </div>

              <div className="mt-16 text-sm muted">
                {t.versions.map((v) => (
                  <div key={v.version} className="flex between" style={{ padding: '4px 0' }}>
                    <span className="mono">v{v.version} · {v.fileName} · {fmtSize(v.size)}</span>
                    <a className="link-btn" href={templateDownloadUrl(t.id, v.version)} download><Download size={13} /> download</a>
                  </div>
                ))}
              </div>

              <div className="flex gap-8 mt-16" style={{ flexWrap: 'wrap' }}>
                <Button variant="ghost" icon={Columns3} onClick={() => openMap(t.id)}>Map columns</Button>
                <Button variant="ghost" icon={RefreshCcw} onClick={() => document.getElementById(`ver-${t.id}`)?.click()}>New version</Button>
                <a className="btn ghost sm" href={templateDownloadUrl(t.id, t.versions.at(-1).version)} download><Download size={13} /> Download copy</a>
                <Button variant="ghost" icon={Trash2} onClick={() => remove(t.id, t.name)}>Delete</Button>
                <input id={`ver-${t.id}`} type="file" accept=".xlsx,.xlsm" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addVersion(t, f).catch((err) => toast(`Upload failed: ${err.message}`, 'err')); }} />
              </div>

              {editors[t.id] && <MappingEditor t={t} ed={editors[t.id]} setRow={setRow} onClose={() => setEditors((ed) => ({ ...ed, [t.id]: undefined }))} onSave={() => saveMapping(t.id)} />}
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

function MappingEditor({ t, ed, setRow, onClose, onSave }) {
  if (ed.loading || !ed.info) {
    return <div className="mt-16 flex gap-8"><Spinner size={14} /> Building mapping…</div>;
  }
  const { info, rows } = ed;
  const headerOf = (col) => info.headers.find((h) => h.column === col)?.header || col;
  return (
    <div className="mt-16" style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div className="flex between">
        <b className="text-sm">Column mapping · {info.sheet.name} (start row {info.sheet.startRow})</b>
        <div className="flex gap-8">
          <Button variant="ghost" icon={Save} onClick={onSave}>Save mapping</Button>
          <Button variant="ghost" icon={X} onClick={onClose}>Close</Button>
        </div>
      </div>

      <div className="mt-12">
        {info.validation?.valid ? <Badge tone="ok">All columns valid</Badge> : <Badge tone="warn"><AlertTriangle size={12} /> {info.validation.issues.length} issue(s)</Badge>}
      </div>

      {info.validation?.autoCreate?.length > 0 && (
        <div className="mt-8 text-sm muted">
          Will auto-create: {info.validation.autoCreate.map((c) => `${c.column} (${c.header})`).join(', ')}
        </div>
      )}

      <div className="mt-12" style={{ overflowX: 'auto' }}>
        <table className="mini-table">
          <thead>
            <tr><th></th><th>AI field</th><th>Excel column</th><th>Header</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.aiField} style={{ opacity: r.included ? 1 : 0.45 }}>
                <td><input type="checkbox" checked={r.included} onChange={(e) => setRow(t.id, i, { included: e.target.checked })} /></td>
                <td className="mono">{r.aiField}</td>
                <td>
                  <select className="select sm" value={r.excelColumn} disabled={!r.included} onChange={(e) => setRow(t.id, i, { excelColumn: e.target.value })}>
                    {COLS.slice(0, Math.max(info.headers.length, 14)).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td>{headerOf(r.excelColumn)}</td>
                <td>{r.status === 'ok' ? <Badge tone="ok">ok</Badge> : r.status ? <Badge tone="warn">{r.status}</Badge> : <Badge>—</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {info.validation?.issues?.length > 0 && (
        <ul className="text-sm muted mt-12" style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          {info.validation.issues.map((iss, i) => <li key={i}>{iss.message}</li>)}
        </ul>
      )}
    </div>
  );
}

function Mini({ label, value }) {
  return <div><div className="muted text-sm">{label}</div><b style={{ fontSize: 13 }}>{value}</b></div>;
}

function fmtSize(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(0)} KB`;
}
