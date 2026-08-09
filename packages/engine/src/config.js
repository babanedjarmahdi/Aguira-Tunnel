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
export const AI_USAGE_FILE = path.join(SETTINGS_DIR, 'ai-usage.json');
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
  // Daily free-tier credit guard: the AI stage stops calling when the budget
  // for the day is spent (default = Groq llama-3.3-70b free daily cap).
  usageEnabled: true,
  usageLimitTokens: 60000,
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
    usageEnabled: AI_DEFAULTS.usageEnabled,
    usageLimitTokens: AI_DEFAULTS.usageLimitTokens,
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

// ---- Daily AI token usage (Groq free-tier credit guard) ---------------------
function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const EMPTY_USAGE = { date: '', inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0, history: [] };

function atomicWriteUsage(u) {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(`${AI_USAGE_FILE}.tmp`, JSON.stringify(u, null, 2), 'utf8');
  fs.renameSync(`${AI_USAGE_FILE}.tmp`, AI_USAGE_FILE);
}

// Reads the persisted daily usage counter (null when absent/corrupt).
export function loadAiUsage() {
  if (!fs.existsSync(AI_USAGE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(AI_USAGE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// Rolls a finished day into `history` (capped at 30 days) and starts today.
// Counters are only reset when the day actually changes.
function rollover(u, today) {
  if (u.date && u.date !== today) {
    u.history = [...(u.history || []), { date: u.date, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, calls: u.calls }].slice(-30);
    u.date = today;
    u.inputTokens = 0;
    u.outputTokens = 0;
    u.totalTokens = 0;
    u.calls = 0;
  } else if (!u.date) {
    u.date = today;
  }
  return u;
}

// Adds real token counts from one completed AI call (daily key, atomic write).
export function addAiUsage({ input = 0, output = 0 } = {}) {
  const u = loadAiUsage() || { ...EMPTY_USAGE, history: [] };
  rollover(u, localDateKey());
  u.inputTokens += input;
  u.outputTokens += output;
  u.totalTokens += input + output;
  u.calls += 1;
  atomicWriteUsage(u);
  return u;
}

// User-facing reset: clears today's totals (a finished day rolls into history).
export function resetAiUsage() {
  const u = loadAiUsage() || { ...EMPTY_USAGE, history: [] };
  const today = localDateKey();
  if (u.date && u.date !== today) {
    u.history = [...(u.history || []), { date: u.date, inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens, calls: u.calls }].slice(-30);
  }
  u.date = today;
  u.inputTokens = 0;
  u.outputTokens = 0;
  u.totalTokens = 0;
  u.calls = 0;
  atomicWriteUsage(u);
  return u;
}

// Snapshot for the API/UI: today's used tokens vs the configured daily budget.
export function usageStatus(ai = loadAiConfig()) {
  const u = loadAiUsage() || { ...EMPTY_USAGE, history: [] };
  const today = localDateKey();
  const used = u.date === today ? u.totalTokens : 0;
  const limit = ai.usageEnabled && ai.usageLimitTokens > 0 ? ai.usageLimitTokens : 0;
  return {
    enabled: !!ai.usageEnabled,
    limitTokens: ai.usageLimitTokens,
    date: today,
    usedTokens: used,
    calls: u.date === today ? u.calls : 0,
    inputTokens: u.date === today ? u.inputTokens : 0,
    outputTokens: u.date === today ? u.outputTokens : 0,
    remainingTokens: limit ? Math.max(0, limit - used) : null,
    percentUsed: limit ? Math.min(100, Math.round((used / limit) * 100)) : 0,
    history: u.history || [],
  };
}

// Builds the provider `usage` hook from the AI config (null when disabled).
// The provider calls remainingTokens() before each request and add() with the
// real token counts the API reports after each successful call.
export function makeUsageAdapter(ai) {
  if (!ai.usageEnabled) return null;
  const limitTokens = ai.usageLimitTokens > 0 ? ai.usageLimitTokens : 0;
  return {
    limitTokens,
    remainingTokens() {
      if (limitTokens <= 0) return Infinity;
      const u = loadAiUsage();
      const used = u && u.date === localDateKey() ? u.totalTokens : 0;
      return Math.max(0, limitTokens - used);
    },
    add({ input = 0, output = 0 } = {}) {
      addAiUsage({ input, output });
    },
  };
}
