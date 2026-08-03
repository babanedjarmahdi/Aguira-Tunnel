// Standard JSON is the single source of truth.
// Every import format becomes Standard JSON before anything else happens.

export const REQUIRED_FIELDS = ['sourceFile', 'placemarkIndex', 'name'];

export const AI_FIELDS = [
  'property_type', 'status', 'location', 'area_m2', 'price_in_million',
  'price_per_meter', 'price_note', 'owner_name', 'phone', 'notes',
];

export function validateProperty(rec) {
  const errors = [];
  for (const f of REQUIRED_FIELDS) {
    if (rec[f] == null || rec[f] === '') errors.push(`missing required field: ${f}`);
  }
  if (rec.ai != null && typeof rec.ai !== 'object') errors.push('ai must be an object or null');
  return { ok: errors.length === 0, errors };
}

export function validateAiFields(ai) {
  const errors = [];
  if (!ai) return { ok: true, errors };
  for (const f of AI_FIELDS) {
    const v = ai[f];
    if (v == null) continue;
    if (typeof v !== 'string' && typeof v !== 'number') {
      errors.push(`field "${f}" has unexpected type ${typeof v}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
