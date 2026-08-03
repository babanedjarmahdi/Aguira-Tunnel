export const SHEET_NAME = 'العقارات';
export const SELLER = 'مع المالك';

// Prefixes for generated IDs (used by the copy-based fill).
export const TYPE_PREFIX = {
  'منزل': 'H',
  'أرض': 'L',
  'كركاس': 'K',
  'كراج': 'G',
  'محل': 'M',
  'محل تجاري': 'M',
  'شقة': 'A',
  'مزرعة': 'F',
  'منزل سومي فيني': 'S',
  'سومي فيني افونسي': 'SA',
};

// Prefixes replicating the original template's column-A ID formula.
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

export function statusValue(ai) {
  return ai.status === 'للإيجار' ? 'للإيجار' : 'متوفر';
}

export function buildNotes(ai) {
  const parts = [];
  if (ai.owner_name) parts.push(`المالك: ${ai.owner_name}`);
  if (ai.notes) parts.push(ai.notes);
  if (ai.price_note) parts.push(`السعر: ${ai.price_note}`);
  return parts.join(' | ');
}
