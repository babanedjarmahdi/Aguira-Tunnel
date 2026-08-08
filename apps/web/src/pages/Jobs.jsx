import { useEffect, useState } from 'react';
import { History, Play, Square, ExternalLink, RotateCw, Download, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getJobs, getAllWorkflows, usePoll, useJobEvents, cancelJob, rerunJob, jobDownloadUrl } from '../api';
import { Card, Badge, Button, Empty, Dot, useToast } from '../components/ui';
import JobDetails from '../components/JobDetails';

export default function Jobs({ setStatusMsg }) {
  const toast = useToast();
  const nav = useNavigate();
  const { data: jobs, refresh } = usePoll(() => getJobs(50), 3000);
  const { data: workflows } = usePoll(getAllWorkflows, 6000);
  const [flowLookup, setFlowLookup] = useState({});
  const [selJob, setSelJob] = useState(null);

  useJobEvents((ev) => {
    if (ev.type === 'job:end' || ev.type === 'job:error' || ev.type === 'job:canceled') { setStatusMsg('Job finished.'); refresh(); }
  });

  useEffect(() => {
    const map = {};
    (workflows || []).forEach((w) => {
      map[`${w.type}:${w.id}`] = w;
    });
    setFlowLookup(map);
  }, [workflows]);

  const doCancel = async (id) => {
    try {
      await cancelJob(id);
      toast(`Cancel requested for job #${id}`);
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const doRerun = async (id) => {
    try {
      const { job, started } = await rerunJob(id);
      toast(started ? `Re-run started as job #${job.id}` : `New job #${job.id} created but not started`);
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const flowOf = (j) => {
    if (j.workflowId) return flowLookup[`import:${j.workflowId}`] || null;
    if (j.watcherId) return flowLookup[`watch:${j.watcherId}`] || null;
    return null;
  };

  const openFlow = (j) => {
    if (j.watcherId) return nav('/watchers', { state: { editWatcherId: j.watcherId } });
    return nav('/workflows');
  };

  const list = jobs || [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Run history</h1>
          <p className="page-sub">Every run of any workflow — import (one-shot) or watch (background) — with its source and result.</p>
        </div>
        <Button variant="primary" icon={Play} onClick={() => nav('/workflows')}>Workflows</Button>
      </div>

      {list.length === 0 ? (
        <Card pad>
          <Empty icon={History} title="No runs yet" text="Run a workflow to see it here with stage timing and output details." />
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Job</th><th>Status</th><th>Workflow</th><th>Source</th><th>Records</th><th>Errors</th><th>Duration</th><th>Finished</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((j) => {
                const flow = flowOf(j);
                return (
                  <tr key={j.id} className="job-row" onClick={() => setSelJob(j)} title="Click for full job details">
                    <td className="mono">#{j.id}</td>
                    <td><Badge tone={j.status === 'failed' ? 'err' : j.status === 'completed' ? 'ok' : j.status === 'canceled' ? 'warn' : j.status === 'running' ? 'info' : 'warn'}><Dot tone={j.status === 'failed' ? 'err' : j.status === 'completed' ? 'ok' : j.status === 'canceled' ? 'warn' : 'info'} /> {j.status}</Badge></td>
                    <td>
                      {flow ? (
                        <button className="link-like" onClick={(e) => { e.stopPropagation(); openFlow(j); }} style={{ fontWeight: 600 }}>
                          {flow.name}
                          <ExternalLink size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                        </button>
                      ) : (
                        <span className="muted">{j.workflowType === 'watch-sync' ? 'watch' : j.workflowType}</span>
                      )}
                    </td>
                    <td className="muted text-sm" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {j.input?.sourceDir || (j.workflowType === 'watch-sync' ? 'folder watch' : '—')}
                      {j.destination?.outputDir ? <><br /><span className="text-xs">{j.destination.outputDir}</span></> : null}
                    </td>
                    <td className="muted">{j.recordsCreated ?? '—'}</td>
                    <td className="muted">{j.errors ?? 0}</td>
                    <td className="muted text-sm">{j.durationMs != null ? `${(j.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                    <td className="muted text-sm">{j.finishedAt ? new Date(j.finishedAt).toLocaleString() : '—'}</td>
                    <td>
                      <div className="flex gap-8" style={{ justifyContent: 'flex-end' }}>
                        <Button variant="ghost" size="sm" icon={Info} onClick={(e) => { e.stopPropagation(); setSelJob(j); }}>Details</Button>
                        {j.output?.outputPath && (
                          <a className="btn ghost sm" title="Download result file" href={jobDownloadUrl(j.id)} onClick={(e) => e.stopPropagation()}>
                            <Download size={14} />
                          </a>
                        )}
                        {(j.status === 'completed' || j.status === 'failed' || j.status === 'canceled') && (
                          <Button variant="ghost" icon={RotateCw} onClick={(e) => { e.stopPropagation(); doRerun(j.id); }}>Re-run</Button>
                        )}
                        {j.status === 'running' || j.status === 'queued'
                          ? <Button variant="ghost" icon={Square} onClick={(e) => { e.stopPropagation(); doCancel(j.id); }}>Cancel</Button>
                          : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selJob && (
        <JobDetails
          job={selJob}
          flowName={flowOf(selJob)?.name}
          onClose={() => setSelJob(null)}
          onCancel={(id) => { doCancel(id); }}
          onRerun={(id) => { doRerun(id); }}
          downloadUrl={selJob.output?.outputPath ? jobDownloadUrl(selJob.id) : null}
        />
      )}
    </div>
  );
}
