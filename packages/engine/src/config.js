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
    ai: {
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      provider: env.AI_PROVIDER || 'groq',
    },
    db: env,
  };
}
