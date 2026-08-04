import { History, Play } from 'lucide-react';
import { getJobs, usePoll, useJobEvents } from '../api';
import { Card, Badge, Button, Empty, Dot } from '../components/ui';

export default function Jobs({ setStatusMsg }) {
  const { data: jobs, refresh } = usePoll(() => getJobs(50), 3000);

  useJobEvents((ev) => {
    if (ev.type === 'job:end' || ev.type === 'job:error') { setStatusMsg('Job finished.'); refresh(); }
  });

  const list = jobs || [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Import jobs</h1>
          <p className="page-sub">Every job is one extract → AI → database pass, with an optional reviewed Excel apply.</p>
        </div>
        <Button variant="primary" icon={Play} onClick={() => (window.location.hash = '#/import')}>New import</Button>
      </div>

      {list.length === 0 ? (
        <Card pad>
          <Empty icon={History} title="No jobs yet" text="Run your first import to see it here with stage timing and output details." />
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Job</th><th>Status</th><th>Workflow</th><th>Records</th><th>Errors</th><th>Duration</th><th>Finished</th></tr>
            </thead>
            <tbody>
              {list.map((j) => (
                <tr key={j.id}>
                  <td className="mono">#{j.id}</td>
                  <td><Badge tone={j.status === 'failed' ? 'err' : j.status === 'completed' ? 'ok' : j.status === 'running' ? 'info' : 'warn'}><Dot tone={j.status === 'failed' ? 'err' : j.status === 'completed' ? 'ok' : 'info'} /> {j.status}</Badge></td>
                  <td className="muted">{j.workflowType}</td>
                  <td className="muted">{j.recordsCreated ?? '—'}</td>
                  <td className="muted">{j.errors ?? 0}</td>
                  <td className="muted text-sm">{j.durationMs != null ? `${(j.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                  <td className="muted text-sm">{j.finishedAt ? new Date(j.finishedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
