const DIG = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };

export function toWest(s) {
  return String(s || '').replace(/[٠-٩۰-۹]/g, (d) => DIG[d]).replace(/٫/g, '.').replace(/[،,]/g, ' ');
}

export function normalizeText(text) {
  return (text || '')
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[\u0600-\u0605\u06DD\u08E2\u066A\u066B\u066C]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseAreaFromName(name) {
  const normalized = toWest(name);
  if (/هكتار/.test(normalized)) {
    const m = normalized.match(/(\d+(?:\.\d+)?)/);
    if (m) return Math.round(parseFloat(m[1]) * 10000); // 1 هكتار = 10000 m2
    return null;
  }
  const m = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]));
}
