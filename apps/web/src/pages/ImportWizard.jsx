import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud, Check, Sparkles, FileSpreadsheet, RefreshCcw, Play,
  ChevronLeft, ChevronRight, FolderOpen, X, CheckCircle2, Zap, Database,
  ClipboardList, Download, AlertTriangle, Clock, Radar, Square, ExternalLink, Bookmark, Pencil,
} from 'lucide-react';
import {
  uploadKmz, inspectExcel, buildExcelMapping, saveExcelMapping, createJob, getJob, buildDraft, applyDraft, cancelJob,
  useJobEvents, getConfig, usePoll, getWatchers, createWatcher, updateWatcher, startWatcher, stopWatcher, getTemplates,
} from '../api';
import { Button, Badge, Progress, Dot, useToast, Card, Spinner, Segmented, Empty, Field } from '../components/ui';
import PipelineVisual, { JOB_STAGES } from '../components/PipelineVisual';
import PathBrowser from '../components/PathBrowser';

const STEP_LABELS = ['Input', 'Excel destination', 'Run', 'Progress', 'Review draft', 'Apply'];

const WATCH_STEPS = [
  { id: 'extract', label: 'Extract' },
  { id: 'ai', label: 'AI' },
  { id: 'db', label: 'DB' },
  { id: 'fill', label: 'Copy fill' },
  { id: 'fill:original', label: 'Original fill' },
];

export default function ImportWizard() {
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [pickerMode, setPickerMode] = useState('file');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const [templatePath, setTemplatePath] = useState('');
  const [inspect, setInspect] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [destMode, setDestMode] = useState('copy');

  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [currentStage, setCurrentStage] = useState(null);
  const [done, setDone] = useState([]);
  const [creating, setCreating] = useState(false);

  const [draft, setDraft] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  const [applying, setApplying] = useState(false);

  const { data: watchers } = usePoll(getWatchers, 4000);
  const list = watchers || [];
  const [activeWatcherId, setActiveWatcherId] = useState(null);
  const [watchToggling, setWatchToggling] = useState(false);
  const [watchSaving, setWatchSaving] = useState(false);
  const [browse, setBrowse] = useState(null);
  const [wMode, setWMode] = useState('copy');
  const [wTemplateId, setWTemplateId] = useState('');
  const [wTargetPath, setWTargetPath] = useState('');
  const [wSteps, setWSteps] = useState(['extract', 'ai', 'db']);
  const [templates, setTemplates] = useState([]);
  const activeWatcher = list.find((w) => w.id === Number(activeWatcherId)) || list[0] || null;

  useEffect(() => {
    if (!activeWatcherId && list[0]) setActiveWatcherId(list[0].id);
  }, [list, activeWatcherId]);

  useEffect(() => {
    getTemplates().then((r) => setTemplates(r.templates)).catch(() => {});
  }, []);

  // ---- Step 1: Excel destination (inspect + mapping) ---------------------
  useEffect(() => {
    if (step !== 1 || inspect) return;
    (async () => {
      setMappingLoading(true);
      try {
        const cfg = await getConfig();
        setTemplatePath(cfg.templatePath || '');
        const [ins, map] = await Promise.all([inspectExcel(), buildExcelMapping()]);
        setInspect(ins);
        setMapping(map);
      } catch (e) {
        toast(e.message, 'err');
      } finally {
        setMappingLoading(false);
      }
    })();
  }, [step, inspect, toast]);

  // ---- Step 3: progress (poll job state) ---------------------------------
  useEffect(() => {
    if (step !== 3 || !jobId) return;
    let alive = true;
    const tick = async () => {
      try {
        const j = await getJob(jobId);
        if (!alive) return;
        setJob(j);
        if (j.currentStage) setCurrentStage(j.currentStage);
        if (j.summary?.ok) setDone(j.summary.ok);
        if (j.status === 'completed' || j.status === 'failed') {
          clearInterval(t);
        }
      } catch { /* transient */ }
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [step, jobId]);

  const onEvent = useCallback((ev) => {
    const p = ev.payload || {};
    if (ev.type === 'log') setLogs((l) => [...l.slice(-120), { level: p.level, message: p.message, ts: ev.ts }]);
    if (ev.type === 'stage:start') { setCurrentStage(p.stage); setDone([]); }
    if (ev.type === 'stage:end') setDone((d) => [...d, p.stage]);
    if (ev.type === 'job:end') { if (p.jobId) setDone((d) => [...d, p.summary?.ok || []]); }
    if (ev.type === 'job:error') { toast(p.error || 'Job failed', 'err'); }
    if (ev.type === 'draft:ready') setDraft((d) => (d ? { ...d, rows: d.rows } : d));
  }, [toast]);

  const { connected } = useJobEvents(onEvent, jobId);

  // ---- Uploads ------------------------------------------------------------
  const pick = async (fileList) => {
    const list = Array.from(fileList || []);
    if (!list.length) return;
    setUploading(true);
    const stored = [];
    try {
      for (const f of list) {
        const res = await uploadKmz(f);
        stored.push(res.file);
      }
      setFiles((prev) => [...prev, ...stored]);
      toast(`Uploaded ${stored.length} file${stored.length > 1 ? 's' : ''}`);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setUploading(false);
    }
  };

  const startJob = async () => {
    if (!files.length) { toast('Add at least one KMZ file first', 'err'); return; }
    setCreating(true);
    setLogs([]); setDone([]); setCurrentStage(null); setJob(null);
    try {
      const res = await createJob({
        workflowType: 'basic',
        steps: ['extract', 'ai', 'db'],
        input: { files },
        destination: { mode: destMode },
        autoApply: false,
      });
      setJobId(res.job.id);
      setJob(res.job);
      toast(`Job #${res.job.id} queued`);
      setStep(3);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setCreating(false);
    }
  };

  const doWatchStart = async () => {
    if (!activeWatcher) { toast('Choose a folder to watch first', 'err'); return; }
    setWatchToggling(true);
    try {
      await startWatcher(activeWatcher.id);
      toast('Watch started — new .kmz files will auto-sync');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setWatchToggling(false);
    }
  };

  const doWatchStop = async () => {
    if (!activeWatcher) return;
    setWatchToggling(true);
    try {
      await stopWatcher(activeWatcher.id);
      toast('Watch stopped');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setWatchToggling(false);
    }
  };

  const chooseWatchFolder = async (p) => {
    setWatchSaving(true);
    try {
      const leaf = p.split(/[/\\]/).filter(Boolean).pop() || 'folder';
      const w = await createWatcher({
        name: `Watch ${leaf}`,
        type: 'folder', path: p, debounceMs: 1500, runOnStartup: false, autoApply: true,
        steps: ['extract', 'ai', 'db'], mode: 'copy',
      });
      setActiveWatcherId(w.id);
      setWMode('copy');
      setWTemplateId('');
      setWTargetPath('');
      setWSteps([...w.steps]);
      toast(`New watch workflow "${w.name}" created — configure it below, then Start`);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setWatchSaving(false);
      setBrowse(null);
    }
  };

  const openWatchWorkflow = () => {
    if (!activeWatcher) return;
    setWMode(activeWatcher.mode || 'copy');
    setWTemplateId(activeWatcher.templateId || '');
    setWTargetPath(activeWatcher.targetPath || '');
    setWSteps([...activeWatcher.steps]);
  };

  const saveWatchWorkflow = async () => {
    if (!activeWatcher) return;
    if (!wSteps.length) { toast('Pick at least one stage', 'err'); return; }
    if (!wTemplateId && !wTargetPath.trim()) { toast('Choose a destination workbook or create a new file first', 'err'); return; }
    setWatchSaving(true);
    try {
      await updateWatcher(activeWatcher.id, {
        mode: wMode,
        templateId: wTemplateId || null,
        targetPath: wTargetPath.trim() || null,
        steps: wSteps,
      });
      toast('Watch workflow saved');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setWatchSaving(false);
    }
  };

  const toggleWStep = (id) => {
    setWSteps((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      await saveExcelMapping({ templatePath });
      setMapping((m) => ({ ...m, profile: { templatePath, savedAt: new Date().toISOString() } }));
      toast('Mapping profile saved for this template');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setProfileSaving(false);
    }
  };

  const doCancelJob = async () => {
    try {
      await cancelJob(jobId);
      toast(`Cancel requested for job #${jobId}`);
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const reviewDraft = async () => {
    setDraftLoading(true);
    try {
      const d = await buildDraft(jobId, { mode: destMode, autoCreate: mapping?.validation?.autoCreate || [] });
      setDraft(d);
      setStep(4);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setDraftLoading(false);
    }
  };

  const doApply = async () => {
    setApplying(true);
    try {
      const r = await applyDraft(jobId, { mode: destMode, autoCreate: mapping?.validation?.autoCreate || [] });
      setApplyResult(r);
      setStep(5);
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setApplying(false);
    }
  };

  const reset = () => {
    setStep(0); setFiles([]); setJobId(null); setJob(null); setDraft(null);
    setApplyResult(null); setLogs([]); setInspect(null); setMapping(null);
  };

  const headers = {};
  (mapping?.headers || []).forEach((h) => { headers[h.column] = h.header; });
  const jobDone = job?.status === 'completed';
  const jobFailed = job?.status === 'failed';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">New import job</h1>
          <p className="page-sub">Upload a KMZ export, review the Excel destination, run the pipeline, review the draft, then apply.</p>
        </div>
        <Button variant="ghost" icon={RefreshCcw} onClick={reset}>Reset</Button>
      </div>

      <div className="wizard-steps">
        {STEP_LABELS.map((l, i) => (
          <div key={l} className="flex" style={{ alignItems: 'center' }}>
            {i > 0 && <div className="wz-connector" />}
            <div className={`wz-step ${step === i ? 'active' : step > i ? 'done' : ''}`}>
              <span className="num">{step > i ? <Check size={13} /> : i + 1}</span>
              <span className="lbl">{l}</span>
            </div>
          </div>
        ))}
      </div>

      {/* STEP 0 — Input */}
      {step === 0 && (
        <Card className="pad">
          <Segmented
            value={pickerMode}
            onChange={setPickerMode}
            options={[
              { value: 'file', label: 'Single file' },
              { value: 'folder', label: 'Whole folder' },
              { value: 'watch', label: 'Watch folder' },
            ]}
          />
          {pickerMode === 'watch' ? (
            <div className="mt-16">
              <div className="grid cols-2">
                <Card pad>
                  <div className="flex gap-8 mb-12">
                    <Badge tone={activeWatcher?.runtime?.watching ? 'ok' : activeWatcher?.runtime?.enabled ? 'info' : 'warn'}>
                      <Dot tone={activeWatcher?.runtime?.watching ? 'ok' : activeWatcher?.runtime?.enabled ? 'info' : 'err'} />
                      {activeWatcher?.runtime?.watching ? 'Watching…' : activeWatcher?.runtime?.enabled ? 'Stopped' : 'No watcher'}
                    </Badge>
                    <Badge tone="info">debounce {activeWatcher?.debounceMs ?? 1500} ms</Badge>
                  </div>
                  <div className="flex gap-8 mb-8">
                    <select className="select" style={{ minWidth: 0, flex: 1 }} value={activeWatcher?.id || ''}
                      onChange={(e) => setActiveWatcherId(e.target.value)}>
                      <option value="">Select a watcher…</option>
                      {list.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <Button variant="ghost" icon={FolderOpen} onClick={() => setBrowse('watch')} disabled={watchSaving}>
                      {watchSaving ? <Spinner /> : 'Create watch workflow…'}
                    </Button>
                  </div>
                  <p className="hint">
                    {activeWatcher ? (
                      <>Folder: <span className="mono" style={{ color: 'var(--text)' }}>{activeWatcher.path}</span></>
                    ) : (
                      'Pick a folder to create a new watch workflow — configure it below, then Start watching.'
                    )}
                  </p>
                  <div className="flex gap-8 mt-16 flex-wrap">
                    {activeWatcher?.steps.map((s) => <Badge key={s} tone="info">{s}</Badge>)}
                    {activeWatcher && (
                      <Badge tone={activeWatcher.mode === 'original' ? 'warn' : 'ok'}>
                        {activeWatcher.mode === 'original' ? 'modify existing' : 'create new file'}
                        {activeWatcher.templateId ? ' · template' : activeWatcher.targetPath ? ' · file' : ''}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-8 mt-16 flex-wrap">
                    {activeWatcher?.runtime?.watching
                      ? <Button variant="primary" icon={Square} onClick={doWatchStop} loading={watchToggling}>Stop watching</Button>
                      : <Button variant="primary" icon={Radar} onClick={doWatchStart} disabled={!activeWatcher || !activeWatcher.path} loading={watchToggling}>Start watching</Button>}
                    <Button variant="ghost" icon={ExternalLink} onClick={() => navigate('/watchers')}>Manage watchers</Button>
                    <Button variant="ghost" icon={ExternalLink} onClick={() => navigate('/jobs')}>Open Jobs</Button>
                  </div>
                  <details className="mt-16" style={{ cursor: 'pointer' }}>
                    <summary className="text-sm" style={{ color: 'var(--text-3)' }}>Watch workflow · choose the file to fill / modify</summary>
                    <div className="flex-col gap-16 mt-12">
                      <div className="flex gap-16 flex-wrap">
                        {WATCH_STEPS.map((s) => (
                          <label key={s.id} className="row" style={{ cursor: 'pointer' }}>
                            <input type="checkbox" checked={wSteps.includes(s.id)} onChange={() => toggleWStep(s.id)} />
                            <span className="text-sm">{s.label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-16 flex-wrap">
                        <Segmented
                          value={wMode}
                          onChange={setWMode}
                          options={[
                            { value: 'copy', label: 'Create new file' },
                            { value: 'original', label: 'Modify existing file' },
                          ]}
                        />
                      </div>
                      <Field label="Destination workbook" hint={wMode === 'copy'
                        ? 'Pick a template — a new filled workbook is created from it on each sync.'
                        : 'Pick a template or an existing .xlsx to fill in place (backed up first).'}>
                        <select className="select" value={wTemplateId} onChange={(e) => setWTemplateId(e.target.value)}>
                          <option value="">{wTargetPath.trim() ? '— or use the file below —' : '— choose a template (required) —'}</option>
                          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </Field>
                      <div className="flex gap-8">
                        <input className="input" placeholder={wMode === 'copy' ? 'C:/…/source.xlsx — base for the new file (optional)' : 'C:/…/workbook.xlsx — file to modify (required)'} value={wTargetPath} onChange={(e) => setWTargetPath(e.target.value)} />
                        <Button variant="ghost" icon={FolderOpen} onClick={() => setBrowse('target')}>Browse</Button>
                      </div>
                      <div className="flex gap-8">
                        <Button variant="primary" icon={Bookmark} onClick={saveWatchWorkflow} disabled={watchSaving || !activeWatcher}>
                          {watchSaving ? <><Spinner /> Saving…</> : 'Save watch workflow'}
                        </Button>
                        {activeWatcher && <Button variant="ghost" icon={Pencil} onClick={openWatchWorkflow}>Load current</Button>}
                      </div>
                    </div>
                  </details>
                </Card>
                <Card pad title="When to use watch mode">
                  <div className="flex-col gap-4" style={{ paddingLeft: 18 }}>
                    <li className="muted text-sm">You keep adding .kmz files to the same folder over time.</li>
                    <li className="muted text-sm">You want the destination re-synced automatically, hands-off.</li>
                    <li className="muted text-sm">Each watcher is a managed item on the Watchers page — pick the folder, the file to fill and the stages.</li>
                    <li className="muted text-sm">One-shot imports still use Single file / Whole folder above.</li>
                  </div>
                </Card>
              </div>
            </div>
          ) : (
          <>
          <input ref={fileInputRef} type="file" accept=".kmz,.kml" hidden
            onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
          <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple hidden
            onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />

          <div className={`dropzone ${uploading ? '' : ''}`} style={{ marginTop: 14 }}
            onClick={() => (pickerMode === 'folder' ? folderInputRef.current?.click() : fileInputRef.current?.click())}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}>
            {uploading ? <Spinner size={22} /> : <UploadCloud />}
            <h4>{pickerMode === 'folder' ? 'Drop a folder of KMZ files here' : 'Drop your KMZ export here'}</h4>
            <p>…or click to browse. Placemark collections from Google Earth are ideal.</p>
          </div>

          {files.length > 0 && (
            <div className="mt-16">
              <h3 className="card-title" style={{ marginBottom: 8 }}>Uploaded ({files.length})</h3>
              <div className="flex-col gap-8">
                {files.map((f, i) => (
                  <div className="row" key={i}>
                    <span className="avatar" style={{ background: 'rgba(34,211,238,0.12)' }}><FolderOpen size={15} /></span>
                    <div className="flex-col" style={{ flex: 1 }}>
                      <b style={{ fontSize: 13 }}>{f.name}</b>
                      <span className="muted text-sm">{(f.size / 1024).toFixed(1)} KB · stored on server</span>
                    </div>
                    <Badge tone="ok"><Dot tone="ok" /> Uploaded</Badge>
                    <Button variant="ghost" icon={X} onClick={() => setFiles((p) => p.filter((x) => x !== f))}>Remove</Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
          )}

          <div className="flex between mt-16">
            <span className="hint">
              {pickerMode === 'watch'
                ? 'Watch runs in the background — no manual upload needed.'
                : 'KMZ is decompressed locally — nothing leaves your machine until you run the pipeline.'}
            </span>
            {pickerMode === 'watch' ? (
              <Button variant="primary" icon={ChevronRight} onClick={() => navigate('/jobs')}>Open Jobs</Button>
            ) : (
              <Button variant="primary" icon={ChevronRight} onClick={() => files.length ? setStep(1) : toast('Upload at least one KMZ file first', 'err')}>Continue</Button>
            )}
          </div>
        </Card>
      )}

      {browse && (
        <PathBrowser
          mode={browse === 'target' ? 'file' : 'folder'}
          onPick={(p) => {
            if (browse === 'target') setWTargetPath(p);
            else chooseWatchFolder(p);
            setBrowse(null);
          }}
          onClose={() => setBrowse(null)}
        />
      )}

      {/* STEP 1 — Excel destination */}
      {step === 1 && (
        <div className="grid cols-2">
          <Card className="pad" title="Target workbook" sub={mappingLoading ? 'Reading workbook…' : 'Real columns from the template'}>
            {inspect && (
              <div className="flex-col gap-8 mb-16">
                <Field label="Template path">
                  <input className="input" readOnly value={templatePath} />
                </Field>
                <div className="flex gap-16 flex-wrap">
                  <div className="muted text-sm">Sheet <b style={{ color: 'var(--text)' }}>{inspect.sheet.name}</b></div>
                  <div className="muted text-sm">Headers on row <b style={{ color: 'var(--text)' }}>{inspect.sheet.headerRow}</b></div>
                  <div className="muted text-sm">Next free row <b style={{ color: 'var(--text)' }}>{inspect.sheet.startRow}</b></div>
                  <div className="muted text-sm">Existing rows <b style={{ color: 'var(--text)' }}>{inspect.sheet.existingRows}</b></div>
                </div>
              </div>
            )}

            <h3 className="card-title" style={{ marginBottom: 10 }}>Write mode</h3>
            <div className="segmented" style={{ width: '100%' }}>
              <button className={destMode === 'copy' ? 'on' : ''} onClick={() => setDestMode('copy')} style={{ flex: 1 }}>
                Copy (new file)
              </button>
              <button className={destMode === 'original' ? 'on' : ''} onClick={() => setDestMode('original')} style={{ flex: 1 }}>
                Original (backup)
              </button>
            </div>
            <p className="hint mt-8">
              {destMode === 'copy'
                ? 'Creates a brand-new filled workbook in output/excel — the template is never touched.'
                : 'Writes rows into the original workbook, with a forced backup first.'}
            </p>

            <div className="flex between mt-16">
              <Button variant="ghost" icon={ChevronLeft} onClick={() => setStep(0)}>Back</Button>
              <Button variant="primary" icon={ChevronRight} onClick={() => setStep(2)}>Continue</Button>
            </div>
          </Card>

          <Card className="pad" title="Column mapping" sub="AI/engine field → Excel column (auto-detected from the template)">
            {mapping ? (
              <>
                <div className="flex between mb-12">
                  <div className="flex gap-8">
                    {mapping.validation?.valid ? (
                      <Badge tone="ok"><Dot tone="ok" /> Mapping valid</Badge>
                    ) : (
                      <Badge tone="err"><Dot tone="err" /> {mapping.validation?.issues?.length || 0} issue{(mapping.validation?.issues?.length || 0) > 1 ? 's' : ''}</Badge>
                    )}
                    {mapping.profile && <Badge tone="info"><Dot tone="info" /> Profile saved</Badge>}
                  </div>
                  <Button variant="ghost" icon={Bookmark} onClick={saveProfile} disabled={mapping.validation?.valid === false} loading={profileSaving}>
                    {mapping.profile ? 'Re-save profile' : 'Save profile'}
                  </Button>
                </div>
                {!mapping.validation?.valid && (
                  <div className="card mb-12" style={{ background: 'rgba(248,113,113,0.06)', borderColor: 'rgba(248,113,113,0.25)', padding: 10 }}>
                    {mapping.validation.issues.map((iss, i) => (
                      <div key={i} className="muted text-sm" style={{ color: 'var(--error)' }}>• {iss.message}</div>
                    ))}
                  </div>
                )}
                {!!mapping.validation?.autoCreate?.length && (
                  <div className="card mb-12" style={{ background: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.3)', padding: 10 }}>
                    <div className="muted text-sm" style={{ color: 'var(--warning)' }}>
                      • {mapping.validation.autoCreate.length} missing column{mapping.validation.autoCreate.length > 1 ? 's' : ''} will be created automatically on apply:
                      {mapping.validation.autoCreate.map((a) => ` ${a.column} (${a.header})`).join(',')}
                    </div>
                  </div>
                )}
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Field</th><th>Col</th><th>Excel header</th><th>Confidence</th><th>Status</th></tr></thead>
                    <tbody>
                      {mapping.mapping.map((m) => (
                        <tr key={m.aiField}>
                          <td className="mono" style={{ fontSize: 12 }}>{m.aiField}</td>
                          <td className="mono" style={{ color: 'var(--accent)' }}>{m.excelColumn}</td>
                          <td className="muted">{m.header}</td>
                          <td><div className="flex gap-8"><Progress value={m.confidence} thin /><span className="mono muted">{m.confidence}%</span></div></td>
                          <td>
                            <Badge tone={m.status === 'ok' ? 'ok' : 'warn'}>
                              <Dot tone={m.status === 'ok' ? 'ok' : 'warn'} /> {m.status || '—'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <Empty icon={FileSpreadsheet} title="Loading mapping…" text="Reading the workbook header row." />
            )}
          </Card>
        </div>
      )}

      {/* STEP 2 — Run */}
      {step === 2 && (
        <Card className="pad">
          <div className="flex gap-12 mb-16">
            <span className="avatar" style={{ background: 'rgba(34,211,238,0.12)' }}><Zap size={16} /></span>
            <div>
              <h3 className="card-title">Ready to run</h3>
              <p className="card-sub">The pipeline extracts placemarks, runs AI analysis, then syncs the database. Excel writing happens after you review the draft.</p>
            </div>
          </div>
          <div className="grid cols-2 mb-16">
            <Card pad title="Input">
              <div className="flex-col gap-4">
                {files.slice(0, 5).map((f, i) => <div key={i} className="muted text-sm">• {f.name}</div>)}
                {files.length > 5 && <div className="muted text-sm">…and {files.length - 5} more</div>}
              </div>
            </Card>
            <Card pad title="Destination">
              <div className="muted text-sm">Mode: <b style={{ color: 'var(--text)' }}>{destMode}</b></div>
              <div className="muted text-sm mt-4">Template: <b style={{ color: 'var(--text)' }}>{templatePath}</b></div>
            </Card>
          </div>
          <PipelineVisual current={null} done={['extract', 'ai', 'db']} stages={JOB_STAGES.slice(0, 3)} />
          <div className="flex between mt-16">
            <Button variant="ghost" icon={ChevronLeft} onClick={() => setStep(1)}>Back</Button>
            <Button variant="primary" icon={Play} onClick={startJob} disabled={creating || !files.length}>
              {creating ? <><Spinner /> Creating job…</> : <>Create job & run</>}
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 3 — Progress */}
      {step === 3 && (
        <Card className="pad">
          <div className="flex between mb-16">
            <div>
              <h3 className="card-title">Running job #{jobId}</h3>
              <p className="card-sub">
                {jobDone ? 'Finished.' : jobFailed ? 'Failed.' : job?.status === 'running' ? 'Live stage telemetry below.' : 'Waiting to start…'}
              </p>
            </div>
            <div className="flex gap-8">
              <Badge tone={connected ? 'info' : 'warn'}>{connected ? 'live' : 'reconnecting'}</Badge>
              <Badge tone={jobDone ? 'ok' : jobFailed ? 'err' : 'info'}>{job?.status || 'queued'}</Badge>
            </div>
          </div>
          <PipelineVisual current={currentStage} done={done} stages={JOB_STAGES.slice(0, 3)} />
          {!jobDone && !jobFailed && <div className="mt-16"><Progress indeterminate /></div>}
          <div className="mt-24">
            <h3 className="card-title" style={{ marginBottom: 10 }}>Live log</h3>
            <div className="card" style={{ background: '#0b0c11', borderColor: 'var(--border)', padding: 12, maxHeight: 320, overflow: 'auto' }}>
              {logs.length === 0 && <div className="muted mono" style={{ padding: 8 }}>Waiting for events…</div>}
              {logs.map((l, i) => (
                <div key={i} className="log-line">
                  <span className="ts">{(l.ts || '').slice(11, 19)}</span>
                  <span className={`lv ${l.level || 'info'}`}>{(l.level || 'info').toUpperCase()}</span>
                  <span className="msg">{l.message || ''}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex between mt-16">
            <Button variant="ghost" onClick={() => setStep(2)} disabled={!!job?.status && job?.status === 'running'}>Back</Button>
            <div className="flex gap-8">
              {(job?.status === 'running' || job?.status === 'queued') && (
                <Button variant="ghost" icon={Square} onClick={doCancelJob}>Cancel job</Button>
              )}
              <Button variant="primary" icon={CheckCircle2} onClick={reviewDraft} disabled={!jobDone} loading={draftLoading}>
                {draftLoading ? <><Spinner /> Building draft…</> : <>Review draft</>}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* STEP 4 — Review draft */}
      {step === 4 && (
        <Card className="pad">
          <div className="flex between mb-16">
            <div>
              <h3 className="card-title">Draft review — {draft?.rows?.length || 0} rows</h3>
              <p className="card-sub">These are the exact rows that will be written to the {draft?.mode} workbook (starting at row {draft?.startRow}).</p>
            </div>
            <Button variant="ghost" icon={RefreshCcw} onClick={reviewDraft} disabled={draftLoading}>Rebuild</Button>
          </div>
          {draft ? (
            <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Row</th>
                    {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'].map((c) => (
                      <th key={c}>{c}{headers[c] ? <span className="muted" style={{ fontWeight: 400 }}> · {headers[c]}</span> : null}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.rows.slice(0, 200).map((r) => (
                    <tr key={r.row}>
                      <td className="mono muted">{r.row}</td>
                      {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'].map((c) => (
                        <td key={c} className={r.cells[c] == null || r.cells[c] === '' ? 'muted' : ''} style={{ fontSize: 12 }}>
                          {String(r.cells[c] ?? '—').slice(0, 60)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={ClipboardList} title="No draft yet" text="Build the draft preview to inspect rows before writing." />
          )}
          {draft && draft.rows.length > 200 && <p className="hint mt-8">Showing first 200 of {draft.rows.length} rows.</p>}
          <div className="flex between mt-16">
            <Button variant="ghost" icon={ChevronLeft} onClick={() => setStep(3)}>Back</Button>
            <Button variant="primary" icon={Play} onClick={doApply} disabled={!draft || applying}>
              {applying ? <><Spinner /> Applying…</> : <>Apply to Excel</>}
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 5 — Apply */}
      {step === 5 && (
        <Card className="pad">
          <div className="flex gap-12 mb-16">
            <span className="avatar" style={{ background: 'rgba(52,211,153,0.12)' }}><CheckCircle2 size={18} /></span>
            <div>
              <h3 className="card-title">Workbook updated</h3>
              <p className="card-sub">Applied {applyResult?.rows || 0} rows into the {applyResult?.mode} workbook.</p>
            </div>
          </div>
          <div className="grid cols-2">
            <Card pad title="Output">
              <div className="mono text-sm" style={{ wordBreak: 'break-all' }}>{applyResult?.outputPath || '—'}</div>
              {applyResult?.backup && (
                <div className="muted text-sm mt-8">Backup: <span className="mono" style={{ wordBreak: 'break-all' }}>{applyResult.backup}</span></div>
              )}
              <div className="mt-8">
                <div className="muted text-sm">Rows written: <b style={{ color: 'var(--text)' }}>{applyResult?.rows}</b></div>
                <div className="muted text-sm">Row range: <b style={{ color: 'var(--text)' }}>{applyResult?.startRow}..{applyResult?.lastRow}</b></div>
              </div>
            </Card>
            <Card pad title="Next steps">
              <div className="flex-col gap-8">
                <a href={`/api/jobs/${jobId}/download`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  <Button variant="primary" icon={Download} style={{ width: '100%' }}>Download workbook</Button>
                </a>
                <Button variant="ghost" icon={UploadCloud} onClick={reset}>New import</Button>
              </div>
            </Card>
          </div>
          {jobFailed && (
            <div className="flex gap-8 text-sm mt-16" style={{ color: 'var(--error)' }}>
              <AlertTriangle size={14} /> Job ended with errors — check the log.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
