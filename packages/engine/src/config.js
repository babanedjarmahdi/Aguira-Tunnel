import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// monorepo root (CRM_PRO): packages/engine/src -> up 3
export const ROOT = path.resolve(__dirname, '../../..');

export const OUTPUT_JSON_DIR = path.join(ROOT, 'output', 'json');
export const JSON_FILE = path.join(OUTPUT_JSON_DIR, 'properties.json');
export const AI_FILE = path.join(OUTPUT_JSON_DIR, 'properties_ai.json');
export const REPORT_FILE = path.join(OUTPUT_JSON_DIR, 'dedupe_report.txt');
export const EXCEL_OUT_DIR = path.join(ROOT, 'output', 'excel');
export const BACKUP_DIR = path.join(ROOT, 'output', 'backup');
export const JOBS_DIR = path.join(ROOT, 'output', 'jobs');
export const DRAFTS_DIR = path.join(ROOT, 'output', 'drafts');
export const UPLOADS_DIR = path.join(ROOT, 'output', 'uploads');
export const MAPPINGS_DIR = path.join(ROOT, 'output', 'mappings');
export const SETTINGS_DIR = path.join(ROOT, 'output', 'settings');
export const AI_SETTINGS_FILE = path.join(SETTINGS_DIR, 'ai.json');
export const TEMPLATES_DIR = path.join(ROOT, 'output', 'templates');

// Env-configurable paths. Defaults replicate the original scripts.
export function loadConfig(env = process.env) {
  const sourceKmzDir = env.SOURCE_KMZ_DIR;
  const doneKmzDir = env.DONE_KMZ_DIR;
  const templatePath = env.EXCEL_TEMPLATE;
  const originalPath = env.ORIGINAL_EXCEL || path.join(ROOT, '..', 'CRM_GPT_Immobilier_Employees_V8_10_2_2.xlsx');
  const excelOutputName = env.EXCEL_OUTPUT_NAME || 'CRM_GPT_Immobilier_Employees_V8_10_2_2_filled.xlsx';
  const excelOutputPath = path.join(EXCEL_OUT_DIR, excelOutputName);

  return {
    sourceKmzDir,
    doneKmzDir,
    templatePath,
    originalPath,
    excelOutputPath,
    backupDir: BACKUP_DIR,
    ai: loadAiConfig(env),
    db: env,
  };
}

export const AI_DEFAULTS = {
  provider: 'groq',
  apiKey: '',
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'llama-3.3-70b-versatile',
  temperature: 0,
  maxTokens: 512,
  prompt: null,
  pacingTokensPerRequest: 700,
  pacingTpmLimit: 12000,
};

// Effective AI config: saved settings (output/settings/ai.json) win over env,
// env wins over hardcoded defaults. Only non-empty settings override.
export function loadAiConfig(env = process.env) {
  const ai = {
    provider: env.AI_PROVIDER || AI_DEFAULTS.provider,
    apiKey: env.GROQ_API_KEY || AI_DEFAULTS.apiKey,
    baseUrl: env.GROQ_BASE_URL || AI_DEFAULTS.baseUrl,
    model: env.GROQ_MODEL || AI_DEFAULTS.model,
    temperature: AI_DEFAULTS.temperature,
    maxTokens: AI_DEFAULTS.maxTokens,
    prompt: AI_DEFAULTS.prompt,
    pacingTokensPerRequest: AI_DEFAULTS.pacingTokensPerRequest,
    pacingTpmLimit: AI_DEFAULTS.pacingTpmLimit,
  };
  const saved = loadAiSettings(env);
  if (saved) {
    for (const k of Object.keys(ai)) {
      if (saved[k] != null) ai[k] = saved[k];
    }
  }
  return ai;
}

// Reads the persisted AI settings file (returns null if absent/corrupt).
export function loadAiSettings() {
  if (!fs.existsSync(AI_SETTINGS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(AI_SETTINGS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// Merges a patch into the persisted AI settings and writes atomically.
export function saveAiSettings(patch = {}) {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  const current = loadAiSettings() || {};
  const next = { ...current };
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) continue;
    if (k === 'apiKey' && patch[k] === '') continue; // empty = keep existing
    next[k] = patch[k];
  }
  next.updatedAt = new Date().toISOString();
  fs.writeFileSync(`${AI_SETTINGS_FILE}.tmp`, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(`${AI_SETTINGS_FILE}.tmp`, AI_SETTINGS_FILE);
  return next;
}
