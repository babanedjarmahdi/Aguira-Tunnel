import { createContext, useCallback, useContext, useState } from 'react';

export function Button({ variant = 'ghost', size, icon: Icon, children, ...props }) {
  return (
    <button className={`btn ${variant} ${size ? 'sm' : ''}`} {...props}>
      {Icon && <Icon />}
      {children}
    </button>
  );
}

export function Card({ title, sub, className = '', pad, glass, children, ...props }) {
  const cls = ['card', pad && 'pad', glass && 'glass', className].filter(Boolean).join(' ');
  return (
    <div className={cls} {...props}>
      {title && <h3 className="card-title">{title}</h3>}
      {sub && <p className="card-sub">{sub}</p>}
      {children}
    </div>
  );
}

export function Stat({ label, value, delta, up, icon: Icon }) {
  return (
    <div className="card stat">
      {Icon && <span className="icon"><Icon /></span>}
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {delta && <span className={`delta ${up ? 'up' : ''}`}>{delta}</span>}
    </div>
  );
}

export function Badge({ tone = '', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Progress({ value, thin, indeterminate, max = 100 }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`progress ${thin ? 'thin' : ''} ${indeterminate ? 'indeterminate' : ''}`}>
      {!indeterminate && <div style={{ width: `${pct}%` }} />}
    </div>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="empty">
      <div className="ico">{Icon && <Icon />}</div>
      <h4>{title}</h4>
      <p>{text}</p>
      {action && <div className="mt-16">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange && onChange(e.target.checked)} />
      <span className="track" />
      {label}
    </label>
  );
}

export function Spinner({ size = 14 }) {
  return (
    <svg className="spin" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <div key={t.value} className={`tab ${value === t.value ? 'on' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
        </div>
      ))}
    </div>
  );
}

export function Dot({ tone = 'ok' }) {
  const map = { ok: 'var(--success)', warn: 'var(--warning)', err: 'var(--error)', info: 'var(--accent)' };
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: map[tone] || map.ok, display: 'inline-block' }} />;
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

let seq = 0;
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, tone = 'ok') => {
    const id = ++seq;
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <Dot tone={t.tone} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
