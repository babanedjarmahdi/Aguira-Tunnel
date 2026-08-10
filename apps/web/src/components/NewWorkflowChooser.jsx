import { Play, Eye, X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { WATCHER_ENABLED } from '../env';

export default function NewWorkflowChooser({ onClose }) {
  const nav = useNavigate();
  const go = (fn) => () => { onClose && onClose(); fn(); };
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex between mb-16">
          <div>
            <h3 className="card-title">Start a new workflow</h3>
            <p className="card-sub">Workflows are the unit of work — pick a type to begin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><X /></button>
        </div>
        <div className="grid cols-2">
          <div className="card pad hero-wf" onClick={go(() => nav('/import'))}>
            <Play size={18} style={{ color: 'var(--accent)' }} />
            <b style={{ fontSize: 14, display: 'block', marginTop: 8 }}>Import workflow</b>
            <p className="muted text-sm mt-8">Run once — pick a file or folder, review the draft, apply to your destination.</p>
            <span className="flex gap-8" style={{ color: 'var(--accent)', marginTop: 10, fontWeight: 600, fontSize: 12.5, alignItems: 'center' }}>
              Start import <ArrowRight size={13} />
            </span>
          </div>
          {WATCHER_ENABLED && (
          <div className="card pad hero-wf" onClick={go(() => nav('/watchers', { state: { createNew: true } }))}>
            <Eye size={18} style={{ color: 'var(--accent)' }} />
            <b style={{ fontSize: 14, display: 'block', marginTop: 8 }}>Watch workflow</b>
            <p className="muted text-sm mt-8">Run in the background — watch a folder, re-sync the destination automatically.</p>
            <span className="flex gap-8" style={{ color: 'var(--accent)', marginTop: 10, fontWeight: 600, fontSize: 12.5, alignItems: 'center' }}>
              Create watcher <ArrowRight size={13} />
            </span>
          </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
