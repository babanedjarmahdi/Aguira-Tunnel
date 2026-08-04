import fs from 'fs';
import path from 'path';
import { previewRows, fillCopy, fillInPlace } from '@terraflow/excel';
import { getJob, updateJob } from './jobs.js';
import { JOBS_DIR, EXCEL_OUT_DIR, BACKUP_DIR } from './config.js';

export function jobWorkDir(jobId) {
  return path.join(JOBS_DIR, `job-${jobId}`);
}

export function jobAiPath(jobId) {
  return path.join(jobWorkDir(jobId), 'properties_ai.json');
}

export function jobDraftPath(jobId) {
  return path.join(jobWorkDir(jobId), 'draft.json');
}

export function readJobRecords(jobId, { withAi = true } = {}) {
  const aiPath = jobAiPath(jobId);
  if (!fs.existsSync(aiPath)) throw new Error('No AI output for this job yet — run the pipeline first.');
  const records = JSON.parse(fs.readFileSync(aiPath, 'utf8'));
  return withAi ? records.filter((d) => d.ai) : records;
}

// Build a reviewable draft (computed Excel rows) without writing anything.
export async function buildDraft(jobId, { mode = 'copy', templatePath = null } = {}) {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  const records = readJobRecords(jobId);
  const template = templatePath || job.destination?.templatePath || process.env.EXCEL_TEMPLATE;
  if (!template) throw new Error('No Excel template configured');

  const preview = await previewRows({ templatePath: template, records, mode });
  const draft = {
    jobId,
    mode,
    templatePath: template,
    generatedAt: new Date().toISOString(),
    startRow: preview.startRow,
    lastRow: preview.lastRow,
    rows: preview.rows,
  };

  fs.mkdirSync(jobWorkDir(jobId), { recursive: true });
  fs.writeFileSync(jobDraftPath(jobId), JSON.stringify(draft, null, 2), 'utf8');

  updateJob(jobId, {
    draft: {
      mode,
      templatePath: template,
      generatedAt: draft.generatedAt,
      rows: draft.rows.length,
      startRow: draft.startRow,
      lastRow: draft.lastRow,
      path: jobDraftPath(jobId),
    },
  });
  return draft;
}

export function getDraft(jobId) {
  const draftPath = jobDraftPath(jobId);
  if (fs.existsSync(draftPath)) return JSON.parse(fs.readFileSync(draftPath, 'utf8'));
  const job = getJob(jobId);
  return job?.draft || null;
}

// Apply a reviewed draft: write rows into the Excel workbook (copy or original).
export async function applyDraft(jobId, { mode = null, templatePath = null, outputName = null } = {}) {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  const records = readJobRecords(jobId);

  const mode2 = mode || job.draft?.mode || job.destination?.mode || 'copy';
  const template = templatePath || job.draft?.templatePath || job.destination?.templatePath || process.env.EXCEL_TEMPLATE;
  if (!template) throw new Error('No Excel template configured');

  let result;
  if (mode2 === 'original') {
    result = await fillInPlace({ originalPath: template, records, backupDir: BACKUP_DIR });
  } else {
    const outputPath = job.destination?.outputPath
      || path.join(EXCEL_OUT_DIR, outputName || `job-${jobId}_filled.xlsx`);
    result = await fillCopy({ templatePath: template, outputPath, records });
  }

  updateJob(jobId, { status: 'completed', output: result, appliedAt: new Date().toISOString() });
  return { ...result, mode: mode2 };
}
