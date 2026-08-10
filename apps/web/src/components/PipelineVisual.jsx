import { Layers, Sparkles, Database, FileSpreadsheet, RefreshCcw, ClipboardList, Check } from 'lucide-react';

export const STAGES = [
  { id: 'extract', label: 'Extract', icon: Layers },
  { id: 'ai', label: 'AI Analysis', icon: Sparkles },
  { id: 'db', label: 'Database', icon: Database },
  { id: 'fill', label: 'Copy Fill', icon: FileSpreadsheet },
  { id: 'fill:original', label: 'Original Fill', icon: RefreshCcw },
];

export const JOB_STAGES = [
  { id: 'extract', label: 'Extract', icon: Layers },
  { id: 'ai', label: 'AI Analysis', icon: Sparkles },
  { id: 'db', label: 'Database', icon: Database },
  { id: 'draft', label: 'Review draft', icon: ClipboardList },
  { id: 'apply', label: 'Apply', icon: Check },
];

// stageId -> index; a running pipeline lights current + dashes completed
export default function PipelineVisual({ current = null, done = [], compact, stages }) {
  const list = stages || STAGES;
  const idx = (s) => list.findIndex((x) => x.id === s);
  const curIdx = current ? idx(current) : -1;

  return (
    <div className="pipeline">
      {list.map((s, i) => {
        const Icon = s.icon;
        const state = done.includes(s.id) ? 'done' : i <= curIdx && current ? 'active' : '';
        return (
          <div key={s.id} className="flex" style={{ alignItems: 'center' }}>
            {i > 0 && <div className={`pipe-edge ${done.includes(list[i - 1].id) ? 'done' : ''}`}>{current && (i - 1) <= curIdx && <span className="flow" />}</div>}
            <div className={`pipe-node ${state}`} style={compact ? { minWidth: 74 } : {}}>
              <div className="node" style={compact ? { width: 46, height: 46, borderRadius: 14 } : {}}>
                <Icon />
              </div>
              <span className="node-label">{s.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
