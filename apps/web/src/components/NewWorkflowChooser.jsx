import { UploadCloud, FolderTree, X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';

export default function NewWorkflowChooser({ onClose }) {
  const nav = useNavigate();
  const go = (mode) => () => { onClose && onClose(); nav('/import', { state: { pickerMode: mode } }); };
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex between mb-16">
          <div>
            <h3 className="card-title">Start a new workflow</h3>
            <p className="card-sub">Workflows are the unit of work — pick how you want to provide your input.</p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><X /></button>
        </div>
        <div className="grid cols-2">
          <div className="card pad hero-wf" onClick={go('file')}>
            <UploadCloud size={18} style={{ color: 'var(--accent)' }} />
            <b style={{ fontSize: 14, display: 'block', marginTop: 8 }}>File uploading</b>
            <p className="muted text-sm mt-8">Upload one or more files and run them through the pipeline.</p>
            <span className="flex gap-8" style={{ color: 'var(--accent)', marginTop: 10, fontWeight: 600, fontSize: 12.5, alignItems: 'center' }}>
              Choose files <ArrowRight size={13} />
            </span>
          </div>
          <div className="card pad hero-wf" onClick={go('folder')}>
            <FolderTree size={18} style={{ color: 'var(--accent)' }} />
            <b style={{ fontSize: 14, display: 'block', marginTop: 8 }}>Folder</b>
            <p className="muted text-sm mt-8">Point at a whole folder — every file in it becomes part of the run.</p>
            <span className="flex gap-8" style={{ color: 'var(--accent)', marginTop: 10, fontWeight: 600, fontSize: 12.5, alignItems: 'center' }}>
              Choose folder <ArrowRight size={13} />
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
