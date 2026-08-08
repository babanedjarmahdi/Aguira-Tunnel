import { useEffect, useState } from 'react';
import { Folder, FileSpreadsheet, File, ArrowUp, X, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getFsRoots, listFs } from '../api';
import { Button, Field, Spinner } from './ui';

// Modal file explorer for picking absolute local paths.
// mode: 'folder' (select directories) | 'file' (select files, .xlsx highlighted)
export default function PathBrowser({ mode = 'folder', onPick, onClose }) {
  const [roots, setRoots] = useState([]);
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState([]);
  const [parent, setParent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const open = async (p) => {
    setLoading(true);
    setError(null);
    try {
      const r = await listFs(p);
      setPath(r.path);
      setParent(r.parent);
      setEntries(r.entries);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getFsRoots().then((r) => {
      setRoots(r.roots || []);
      if (r.roots?.[0]?.path) open(r.roots[0].path);
    }).catch((e) => setError(e.message));
  }, []);

  const select = (e) => {
    if (e.type === 'dir') open(`${path}\\${e.name}`);
    else if (mode === 'file') onPick(`${path}\\${e.name}`);
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex between mb-8">
          <b>{mode === 'folder' ? 'Choose a folder' : 'Choose a file'}</b>
          <button className="icon-btn" onClick={onClose} title="Close"><X /></button>
        </div>
        <div className="flex gap-8 flex-wrap mb-8">
          {roots.map((r) => (
            <button key={r.path} className="btn ghost sm" onClick={() => open(r.path)}>{r.name}</button>
          ))}
        </div>
        <div className="flex gap-8 items-center mb-8" style={{ minWidth: 0 }}>
          {parent && <button className="icon-btn" title="Up" onClick={() => open(parent)}><ArrowUp /></button>}
          <code className="path-crumb">{path}</code>
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
        <div className="path-list">
          {loading ? (
            <div className="flex center pad"><Spinner size={18} /></div>
          ) : (
            entries.map((e) => (
              <button
                key={e.name}
                className="path-row"
                onClick={() => select(e)}
                onDoubleClick={() => e.type === 'dir' && open(`${path}\\${e.name}`)}
                title={e.type === 'dir' ? 'Open folder' : mode === 'file' ? 'Pick this file' : ''}
              >
                {e.type === 'dir' ? <Folder size={15} className="row-icon" /> : e.xlsx ? <FileSpreadsheet size={15} className="row-icon" /> : <File size={15} className="row-icon" />}
                <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                {e.type === 'file' && <span className="text-sm" style={{ color: 'var(--text-3)' }}>{e.xlsx ? 'xlsx' : `${Math.round(e.size / 1024)} KB`}</span>}
              </button>
            ))
          )}
        </div>
        <div className="flex gap-8 mt-12 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {mode === 'folder' && (
            <Button variant="primary" icon={ChevronRight} onClick={() => onPick(path)} disabled={!path}>
              Use this folder
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
