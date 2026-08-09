import { useEffect, useState } from 'react';
import { X, FileSpreadsheet } from 'lucide-react';
import { createPortal } from 'react-dom';
import { templatePreview } from '../api';
import { Spinner } from './ui';

const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function SheetPreview({ id, name, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    templatePreview(id, { rows: 12, cols: 14 })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  return createPortal(
    <div className="modal-overlay job-overlay" onClick={onClose}>
      <div className="modal sheet-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flex between mb-16">
          <div>
            <h3 className="card-title">Sheet preview</h3>
            <p className="card-sub">
              {name}{data ? ` · ${data.sheet} (start row ${data.startRow})` : ''} — live cells from the stored workbook
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><X /></button>
        </div>

        {error ? (
          <div className="flex gap-8"><FileSpreadsheet size={16} style={{ color: 'var(--error)' }} /><span className="text-sm" style={{ color: 'var(--error)' }}>{error}</span></div>
        ) : !data ? (
          <div className="flex gap-8"><Spinner size={18} /> Reading workbook…</div>
        ) : (
          <div className="sheet-preview-scroll">
            <table className="mini-table sheet-preview-tbl">
              <thead>
                <tr>
                  <th className="sheet-corner"></th>
                  {Array.from({ length: data.shownCols }, (_, i) => <th key={i} className="sheet-colhead">{COLS[i]}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.grid.map((row, r) => (
                  <tr key={r} className={r + 1 === data.headerRow ? 'sheet-hdr' : ''}>
                    <th className="sheet-rowhead">{r + 1}</th>
                    {row.map((cell, c) => (
                      <td key={c} className={r + 1 === data.headerRow ? 'sheet-hdr-cell' : ''}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
