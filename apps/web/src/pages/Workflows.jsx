import { Workflow as WorkflowIcon, Plus, Play, MoreHorizontal, GitBranch } from 'lucide-react';
import { Card, Badge, Button, Empty } from '../components/ui';

export default function Workflows() {
  const workflows = [
    { name: 'Standard import', stages: ['extract', 'ai', 'db', 'fill'], enabled: true, runs: 3 },
    { name: 'Full pipeline', stages: ['extract', 'ai', 'db', 'fill', 'fill:original'], enabled: true, runs: 1 },
  ];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Workflows</h1>
          <p className="page-sub">Reusable stage combinations. Save a sequence and run it in one click.</p>
        </div>
        <Button variant="primary" icon={Plus}>New workflow</Button>
      </div>

      {workflows.length === 0 ? (
        <Card pad><Empty icon={WorkflowIcon} title="No workflows yet" text="Compose reusable stage sequences to run from the dashboard." /></Card>
      ) : (
        <div className="grid cols-2">
          {workflows.map((w) => (
            <Card key={w.name} className="hoverable pad">
              <div className="flex between">
                <div className="flex gap-8"><GitBranch size={17} style={{ color: 'var(--accent)' }} /><b style={{ fontSize: 14 }}>{w.name}</b></div>
                <Button variant="ghost" icon={MoreHorizontal} />
              </div>
              <p className="card-sub mt-8">{w.runs} runs · last run a few minutes ago</p>
              <div className="flex gap-8 mt-16 flex-wrap">
                {w.stages.map((s) => <Badge key={s} tone="info">{s}</Badge>)}
              </div>
              <div className="mt-16">
                <Button variant="primary" icon={Play} disabled>Run</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
