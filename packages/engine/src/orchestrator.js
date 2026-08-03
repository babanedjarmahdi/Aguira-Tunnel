import { loadConfig } from './config.js';
import { createEmitter } from './events.js';
import { extractStage, aiStage, dbStage, fillStage, fillOriginalStage } from './stages.js';

const STAGES = {
  extract: extractStage,
  ai: aiStage,
  db: dbStage,
  fill: fillStage,
  'fill:original': fillOriginalStage,
};

// Run any ordered subset of stages, emitting structured events.
// Emits: stage:start, stage:progress, log, stage:end, stage:error,
//        pipeline:complete, pipeline:error
export async function runPipeline({ stages = ['extract', 'ai', 'db', 'fill'], env = process.env, emitter = createEmitter() } = {}) {
  const config = loadConfig(env);
  const results = {};
  const summary = { stages: [], ok: [], failed: [] };

  for (const name of stages) {
    const fn = STAGES[name];
    if (!fn) {
      const err = new Error(`Unknown stage: ${name}`);
      emitter.emit('stage:error', { stage: name, error: err });
      emitter.emit('pipeline:error', { stage: name, error: err });
      throw err;
    }
    emitter.emit('stage:start', { stage: name });
    try {
      const result = await fn({ config, emitter });
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
