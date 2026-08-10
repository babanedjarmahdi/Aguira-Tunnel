import fs from 'fs';
import path from 'path';
import { previewRows, fillCopy, fillInPlace } from '@terraflow/excel';
import { getJob, updateJob } from './jobs.js';
import { JOBS_DIR, EXCEL_OUT_DIR, BACKUP_DIR } from './config.js';
import { resolvePlugin } from './plugins.js';

export function jobWorkDir(jobId) {
  return path.join(JOBS_DIR, `job-${jobId}`);
}

export function jobAiPath(jobId) {
  return path.join(jobWorkDir(jobId), 'properties_ai.json');
}

export function jobDraftPath(jobId) {
  return path.join(jobWorkDir(jobId), 'draft.json');
}

// A workflow is "database-destination" when the output adapter is the generic
// records table (the v0.6 second workflow). Its cleaned records live in the
// job's properties.json (no AI stage).
export function isDbWorkflow(job) {
  return job?.workflowType === 'csv-db' || job?.destination?.outputType === 'database';
}

export function readJobRecords(jobId, { withAi = true } = {}) {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (isDbWorkflow(job)) {
    const file = path.join(jobWorkDir(jobId), 'properties.json');
    if (!fs.existsSync(file)) throw new Error('No cleaned CSV output for this job yet — run the pipeline first.');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const aiPath = jobAiPath(jobId);
  if (!fs.existsSync(aiPath)) throw new Error('No AI output for this job yet — run the pipeline first.');
  const records = JSON.parse(fs.readFileSync(aiPath, 'utf8'));
  return withAi ? records.filter((d) => d.ai) : records;
}

// Build a reviewable draft without writing anything. Excel workflows ground a
// field→column mapping against the workbook; database workflows (csv-db) ask
// the output-database plugin to plan inserts/updates/deletes against the
// generic `records` table.
export async function buildDraft(jobId, { mode = 'copy', templatePath = null, autoCreate = null, workflowType = null, prune = false } = {}) {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (isDbWorkflow(job)) return buildDbDraft(jobId, { workflowType, prune });
  const records = readJobRecords(jobId);
  const template = templatePath || job.destination?.templatePath || process.env.EXCEL_TEMPLATE;
  if (!template) throw new Error('No Excel template configured');

  const preview = await previewRows({ templatePath: template, records, mode, autoCreate });
  const draft = {
    jobId,
    mode,
    templatePath: template,
    generatedAt: new Date().toISOString(),
    startRow: preview.startRow,
    lastRow: preview.lastRow,
    autoCreate: preview.autoCreate,
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
      autoCreate: draft.autoCreate,
      path: jobDraftPath(jobId),
    },
  });
  return draft;
}

async function buildDbDraft(jobId, { workflowType = null, prune = false } = {}) {
  const job = getJob(jobId);
  const records = readJobRecords(jobId);
  const plugin = resolvePlugin('output', 'output-database');
  const draft = await plugin.draft(records, {
    workflowType: workflowType || job.workflowType || 'csv-db',
    prune,
  });
  draft.jobId = jobId;
  fs.mkdirSync(jobWorkDir(jobId), { recursive: true });
  fs.writeFileSync(jobDraftPath(jobId), JSON.stringify(draft, null, 2), 'utf8');

  updateJob(jobId, {
    draft: {
      table: draft.table,
      workflowType: draft.workflowType,
      generatedAt: draft.generatedAt,
      rows: draft.records,
      counts: draft.counts,
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

// Apply a reviewed draft: database workflows run the output-database plugin's
// apply() against Postgres; Excel workflows write the workbook (copy or
// original) as before.
export async function applyDraft(jobId, { mode = null, templatePath = null, outputName = null, autoCreate = null } = {}) {
  const job = getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (isDbWorkflow(job)) return applyDbDraft(jobId);
  const records = readJobRecords(jobId);

  const mode2 = mode || job.draft?.mode || job.destination?.mode || 'copy';
  const template = templatePath || job.draft?.templatePath || job.destination?.templatePath || process.env.EXCEL_TEMPLATE;
  if (!template) throw new Error('No Excel template configured');
  const autoCreate2 = autoCreate != null ? autoCreate : job.draft?.autoCreate;

  let result;
  if (mode2 === 'original') {
    result = await fillInPlace({ originalPath: template, records, backupDir: BACKUP_DIR, autoCreate: autoCreate2 });
  } else {
    const outputPath = job.destination?.outputPath
      || path.join(EXCEL_OUT_DIR, outputName || `job-${jobId}_filled.xlsx`);
    result = await fillCopy({ templatePath: template, outputPath, records, autoCreate: autoCreate2 });
  }

  updateJob(jobId, { status: 'completed', output: result, appliedAt: new Date().toISOString() });
  return { ...result, mode: mode2 };
}

async function applyDbDraft(jobId) {
  const job = getJob(jobId);
  const draft = getDraft(jobId);
  if (!draft || !Array.isArray(draft.inserts)) {
    throw new Error('No database draft yet — build one first (POST /api/jobs/:id/draft).');
  }
  const plugin = resolvePlugin('output', 'output-database');
  const result = await plugin.apply(draft, {});
  updateJob(jobId, {
    status: 'completed',
    output: { ...result, table: 'records' },
    recordsCreated: result.inserted,
    recordsUpdated: result.updated,
    appliedAt: new Date().toISOString(),
  });
  return result;
}
