import { X, Download, RotateCw, Square, FolderInput, FolderOutput, ListChecks, AlignLeft } from 'lucide-react';
import { Badge, Button, Dot } from './ui';

function Row({ label, value }) {
  return (
    <div className="jd-row">
      <span className="jd-label">{label}</span>
      <span className="jd-value">{value}</span>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="jd-sec">
      <div className="jd-sec-title">
        {Icon ? <Icon size={13} /> : null} {title}
      </div>
      {children}
    </div>
  );
}

export default function JobDetails({ job, flowName, onClose, onCancel, onRerun, downloadUrl }) {
  const count = (v) => (v != null ? v : '—');
  const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
  const dur = job.durationMs != null ? `${(job.durationMs / 1000).toFixed(1)}s` : '—';
  const steps = (job.steps || []).join(' → ') || '—';
  const logs = job.log || [];
  const error = job.error || null;

  return (
    <div className="modal-overlay job-overlay" onClick={onClose}>
      <div className="modal job-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex between mb-16">
          <div className="flex gap-8" style={{ alignItems: 'center' }}>
            <h3 className="card-title mono">Job #{job.id}</h3>
            <Badge tone={job.status === 'failed' ? 'err' : job.status === 'completed' ? 'ok' : job.status === 'canceled' ? 'warn' : 'info'}>
              <Dot tone={job.status === 'failed' ? 'err' : job.status === 'completed' ? 'ok' : job.status === 'canceled' ? 'warn' : 'info'} /> {job.status}
            </Badge>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><X /></button>
        </div>

        <div className="jd-body">
          <Section icon={AlignLeft} title="Overview">
            <Row label="Workflow" value={flowName || (job.watcherId ? 'Watch workflow' : job.workflowType || '—')} />
            <Row label="Type" value={job.workflowType || '—'} />
            <Row label="Started" value={fmt(job.startedAt)} />
            <Row label="Finished" value={fmt(job.finishedAt)} />
            <Row label="Duration" value={dur} />
            <Row label="Steps" value={steps} />
          </Section>

          <Section icon={ListChecks} title="Counters">
            <div className="jd-grid">
              <Row label="Files" value={count(job.processedFiles)} />
              <Row label="Created" value={count(job.recordsCreated)} />
              <Row label="Updated" value={count(job.recordsUpdated)} />
              <Row label="Skipped" value={count(job.recordsSkipped)} />
              <Row label="In DB" value={count(job.recordsInDb)} />
              <Row label="Errors" value={count(job.errors)} />
              <Row label="Warnings" value={count(job.warnings)} />
              <Row label="AI unsure" value={count(job.aiUncertainties)} />
            </div>
          </Section>

          {(job.input || job.destination) && (
            <Section icon={FolderInput} title="Source & destination">
              {job.input?.sourceDir ? <Row label="Source" value={job.input.sourceDir} /> : null}
              {job.destination?.originalPath ? <Row label="Workbook (original)" value={job.destination.originalPath} /> : null}
              {job.destination?.templatePath ? <Row label="Workbook (template)" value={job.destination.templatePath} /> : null}
              {job.destination?.outputDir ? <Row label="Output" value={job.destination.outputDir} /> : null}
              {job.destination?.mode ? <Row label="Mode" value={job.destination.mode} /> : null}
              {job.ai ? <Row label="AI" value={`${job.ai.model || 'default'}${job.ai.temperature != null ? ` · temp ${job.ai.temperature}` : ''}`} /> : null}
            </Section>
          )}

          {job.summary && (
            <Section icon={ListChecks} title="Stages result">
              <Row label="OK" value={(job.summary.ok || []).join(', ') || '—'} />
              <Row label="Failed" value={(job.summary.failed || []).join(', ') || '—'} />
            </Section>
          )}

          {error && (
            <Section icon={X} title="Error">
              <pre className="jd-error">{error}</pre>
            </Section>
          )}

          {logs.length > 0 && (
            <Section icon={FolderOutput} title={`Log (${logs.length})`}>
              <div className="jd-logs">
                {logs.map((l, i) => (
                  <div key={i} className={`jd-log jd-log-${l.level || 'info'}`}>
                    <span className="jd-log-ts">{l.ts ? new Date(l.ts).toLocaleTimeString() : ''}</span>
                    <span className="jd-log-msg">{l.message}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        <div className="flex gap-8 mt-16" style={{ justifyContent: 'flex-end' }}>
          {downloadUrl && (
            <a className="btn ghost sm" href={downloadUrl} title="Download result file"><Download size={14} /> Download</a>
          )}
          {(job.status === 'completed' || job.status === 'failed' || job.status === 'canceled') && (
            <Button variant="ghost" icon={RotateCw} onClick={() => { onRerun(job.id); onClose(); }}>Re-run</Button>
          )}
          {(job.status === 'running' || job.status === 'queued') && (
            <Button variant="ghost" icon={Square} onClick={() => { onCancel(job.id); onClose(); }}>Cancel</Button>
          )}
          <Button variant="primary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
