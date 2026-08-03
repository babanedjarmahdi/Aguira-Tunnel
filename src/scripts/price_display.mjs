const DIG = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };

export function toWest(s) {
  return String(s || '').replace(/[٠-٩۰-۹]/g, (d) => DIG[d]).replace(/٫/g, '.').replace(/[،,]/g, ' ');
}

function nums(s) {
  const out = [];
  const re = /\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(s))) out.push(parseFloat(m[0]));
  return out;
}

function fmtNum(n) {
  if (!isFinite(n)) return null;
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
}

function range(vals) {
  const uniq = [...new Set(vals)];
  if (uniq.length === 1) return fmtNum(uniq[0]);
  return `${fmtNum(Math.min(...uniq))} - ${fmtNum(Math.max(...uniq))}`;
}

function perMeter(t) {
  const hasMilWord = /مليون/.test(t);
  const hasKWord = /الف/.test(t);
  const scale = (v) => (hasMilWord ? v * 1e6 : hasKWord ? v * 1000 : v < 100 ? v * 1000 : v);
  const mA = /\d+(?:\.\d+)?\s*(?:الى|إلى|ال)\s*\d+(?:\.\d+)?\s*للمترا?/.test(t);
  let vals = [];
  if (mA) {
    const m = t.match(/(\d+(?:\.\d+)?)\s*(?:الى|إلى|ال)\s*(\d+(?:\.\d+)?)\s*للمترا?/);
    vals = [scale(parseFloat(m[1])), scale(parseFloat(m[2]))];
  } else {
    const re = /(\d+(?:\.\d+)?)\s*(?:دج|مليون|الف)?\s*للمترا?/g;
    let mm;
    while ((mm = re.exec(t))) vals.push(scale(parseFloat(mm[1])));
  }
  if (!vals.length) return null;
  return range(vals);
}

function connectors(t) {
  const res = [];
  const re = /او|أو/g;
  let m;
  while ((m = re.exec(t))) {
    const before = t[m.index - 1];
    if (!before || /[\s\d]/.test(before)) res.push(m.index);
  }
  return res;
}

function billion(t) {
  const Btoks = [...t.matchAll(/(\d+(?:\.\d+)?)?\s*(?:مليار|ملاير|ميليار)/g)].map((x) => x[1] ? parseFloat(x[1]) : 1);
  const B = Math.max(...Btoks);
  const beforeAw = (() => { const c = connectors(t); return c.length ? t.slice(0, c[0]) : t; })();
  const milMain = [...beforeAw.matchAll(/(\d+(?:\.\d+)?)\s*مليون/g)].map((x) => parseFloat(x[1]));
  const totalB = B + milMain.reduce((s, v) => s + v / 1000, 0);
  const alts = [];
  for (const c of connectors(t)) {
    const slice = t.slice(c + 2);
    const mm = slice.match(/(\d+(?:\.\d+)?)/);
    if (!mm) continue;
    const v = parseFloat(mm[0]);
    const after = slice.slice(mm.index + mm[0].length, mm.index + mm[0].length + 6);
    if (/مليار|ملاير/.test(after)) alts.push(`${fmtNum(v)}B`);
    else alts.push(`${fmtNum(v)}M`);
  }
  const parts = [`${fmtNum(totalB)}B`];
  const uniqueAlts = [...new Set(alts)];
  for (const a of uniqueAlts) if (!parts.includes(a)) parts.push(a);
  return parts.join(' / ');
}

function million(t) {
  const vals = nums(t);
  if (!vals.length) return null;
  const above = /فوق/.test(t);
  const uniq = [...new Set(vals)];
  if (uniq.length === 1) return `${fmtNum(uniq[0])}M${above ? '+' : ''}`;
  return `${fmtNum(Math.min(...uniq))}M - ${fmtNum(Math.max(...uniq))}M`;
}

function thousand(t) {
  const re = /(\d+(?:\.\d+)?)\s*الف/g;
  const vals = [];
  let m;
  while ((m = re.exec(t))) vals.push(parseFloat(m[1]) * 1000);
  if (!vals.length) return null;
  return range(vals);
}

export function formatPrice(ai) {
  const t = toWest(ai.price_note || '');
  if (!t.trim()) {
    const alt = toWest(`${ai.notes || ''}`);
    if (/الكور/.test(alt)) return 'حسب الكور';
    return null;
  }
  if (/للمتر/.test(t)) return perMeter(t);
  if (/مليار|ملاير|ميليار/.test(t)) return billion(t);
  if (/مليون|ملاين|مليو/.test(t)) return million(t);
  if (/\d+\s*م(?=\s|$|قابل|،)/.test(t)) return million(t);
  if (/الف/.test(t)) return thousand(t);
  if (/على باب الله|باب الله/.test(t)) return 'على باب الله';
  if (/مزال|مازال|مزايال/.test(t)) return 'مزال';
  if (/الكور/.test(t)) return 'حسب الكور';
  if (ai.price_per_meter != null && /-?\d/.test(t)) {
    const v = ai.price_per_meter;
    return fmtNum(v < 100 ? v * 1000 : v);
  }
  const bn = nums(t);
  if (bn.length && /الى|إلى|بين/.test(t)) {
    return bn.length >= 2 ? `${fmtNum(Math.min(...bn))}B - ${fmtNum(Math.max(...bn))}B` : `${fmtNum(bn[0])}B`;
  }
  const bn2 = nums(t);
  if (bn2.length) {
    const v = bn2[0];
    return fmtNum(v < 100 ? v * 1000 : v);
  }
  return null;
}

export function locationDisplay(ai, p) {
  if (ai.location && ai.location.trim()) return ai.location.trim();
  if (p.lat != null && p.lon != null) return `${Number(p.lat).toFixed(4)}, ${Number(p.lon).toFixed(4)}`;
  return '';
}

// ID price component, replicating the template's ROUND(F/1000000) scheme.
export function priceMils(display) {
  if (!display) return 0;
  if (/^\d+$/.test(display)) return Math.round(parseFloat(display) / 1e6);
  const seg = String(display).split('/')[0].trim();
  if (/^\d+(\.\d+)?B$/.test(seg)) return Math.round(parseFloat(seg) * 1000);
  if (/^\d+(\.\d+)?M/.test(seg)) return Math.round(parseFloat(seg));
  return 0;
}

// Type -> ID prefix, matching the template's column-A formula.
export function typePrefix(type) {
  const map = {
    'أرض': 'L',
    'منزل سومي فيني': 'S',
    'سومي فيني افونسي': 'SA',
    'منزل': 'H',
    'كراج': 'G',
    'محل تجاري': 'C',
    'محل': 'C',
    'كركاس': 'K',
    'شقة': 'A',
    'مزرعة': 'F',
  };
  return map[type] || '?';
}
