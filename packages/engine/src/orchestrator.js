import path from 'path';
import { loadConfig, JOBS_DIR, JSON_FILE, AI_FILE, REPORT_FILE } from './config.js';
import { createEmitter } from './events.js';
import { createAbortError } from '@terraflow/shared';
import { extractStage, aiStage, dbStage, fillStage, fillOriginalStage } from './stages.js';
import { jobWorkDir } from './draft.js';
import { readKmzFiles } from './kmz.js';

const STAGES = {
  extract: extractStage,
  ai: aiStage,
  db: dbStage,
  fill: fillStage,
  'fill:original': fillOriginalStage,
};

// Default steps for a job. The Basic workflow defers Excel writing to the
// review/apply step, so the pipeline itself stops after database sync.
export function defaultStagesFor(job) {
  if (job?.autoApply) return ['extract', 'ai', 'db', 'fill'];
  return ['extract', 'ai', 'db'];
}

// Build the per-run context: job-scoped file paths + input source.
function buildContext(config, job) {
  const base = {
    inputFiles: job?.input?.files || null,
    inputSourceDir: job?.input?.sourceDir || null,
  };
  if (!job) {
    return { ...base, jsonPath: JSON_FILE, aiPath: AI_FILE, reportPath: REPORT_FILE };
  }
  const workDir = jobWorkDir(job.id);
  return {
    ...base,
    workDir,
    jsonPath: path.join(workDir, 'properties.json'),
    aiPath: path.join(workDir, 'properties_ai.json'),
    reportPath: path.join(workDir, 'dedupe_report.txt'),
  };
}

export function resolveInput(config, ctx) {
  if (ctx.inputSourceDir) return { kind: 'dir', files: readKmzFiles(ctx.inputSourceDir) };
  if (ctx.inputFiles) return { kind: 'files', files: ctx.inputFiles };
  return { kind: 'dir', files: readKmzFiles(config.sourceKmzDir) };
}

// Run any ordered subset of stages, emitting structured events.
// Input-driven: pass a `job` (persisted Job record) to scope every write to the
// job's own directory and pull the input from the job's `input` field.
// Pass an optional AbortSignal to cancel the run (stages check it between and
// within loops; aborted runs reject with an AbortError).
// Emits: stage:start, stage:progress, log, stage:end, stage:error,
//        pipeline:complete, pipeline:error
export async function runPipeline({ job = null, stages = null, env = process.env, emitter = createEmitter(), signal = null } = {}) {
  const config = loadConfig(env);
  const ctx = buildContext(config, job);
  ctx.signal = signal;
  const names = stages || (job?.steps?.length ? job.steps : defaultStagesFor(job));
  const results = {};
  const summary = { stages: [], ok: [], failed: [] };

  for (const name of names) {
    if (signal?.aborted) {
      const err = createAbortError();
      emitter.emit('stage:error', { stage: name, error: err });
      emitter.emit('pipeline:error', { stage: name, error: err });
      throw err;
    }
    const fn = STAGES[name];
    if (!fn) {
      const err = new Error(`Unknown stage: ${name}`);
      emitter.emit('stage:error', { stage: name, error: err });
      emitter.emit('pipeline:error', { stage: name, error: err });
      throw err;
    }
    emitter.emit('stage:start', { stage: name });
    try {
      const result = await fn({ config, emitter, ctx });
      results[name] = result;
      summary.stages.push(name);
      summary.ok.push(name);
      emitter.emit('stage:end', { stage: name, result });
    } catch (err) {
      summary.failed.push(name);
      emitter.emit('stage:error', { stage: name, error: err });
      emitter.emit('pipeline:error', { stage: name, error: err });
      throw err;
    }
  }

  emitter.emit('pipeline:complete', { results, summary });
  return { results, summary };
}

export const engineStages = STAGES;
