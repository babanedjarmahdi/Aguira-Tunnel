import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runPipeline } from './orchestrator.js';
import { loadConfig, OUTPUT_JSON_DIR } from './config.js';
import { createEmitter } from './events.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

function errorFile(name) {
  return path.join(ROOT, 'output', name);
}

function print(emitter) {
  emitter.on('log', ({ message }) => console.log(message));
  emitter.on('stage:progress', ({ message }) => console.log(message));
}

const STAGE_ORDER = ['extract', 'ai', 'db', 'fill'];

const cmds = {
  extract: async (opts) => {
    try {
      await runPipeline({ stages: ['extract'], ...opts });
    } catch (e) {
      console.error(e && (e.stack || e.message));
      process.exit(1);
    }
  },

  ai: async (opts) => {
    try {
      const { results, summary } = await runPipeline({ stages: ['ai'], ...opts });
      if (summary.failed.length) process.exit(2);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  },

  loaddb: async (opts) => {
    try {
      await runPipeline({ stages: ['db'], ...opts });
    } catch (e) {
      const msg = e && (e.stack || e.message) ? e.stack || e.message : String(e);
      fs.writeFileSync(errorFile('db_load_error.log'), msg, 'utf8');
      console.error('ERROR written to output/db_load_error.log');
      process.exit(1);
    }
  },

  fill: async (opts) => {
    try {
      await runPipeline({ stages: ['fill'], ...opts });
    } catch (e) {
      fs.writeFileSync(errorFile('excel_fill_error.log'), String(e && (e.stack || e.message)), 'utf8');
      console.error('ERROR:', e.message);
      process.exit(1);
    }
  },

  'fill:original': async (opts) => {
    try {
      await runPipeline({ stages: ['fill:original'], ...opts });
    } catch (e) {
      console.error('ERROR:', e && (e.stack || e.message));
      process.exit(1);
    }
  },

  pipeline: async (opts) => {
    try {
      await runPipeline({ stages: STAGE_ORDER, ...opts });
    } catch (e) {
      console.error(e && (e.stack || e.message));
      process.exit(1);
    }
  },

  watch: async (opts) => {
    const { runWatcher } = await import('./watch.js');
    runWatcher({ emitter: opts.emitter });
  },
};

async function main() {
  const [cmd] = process.argv.slice(2);
  if (!cmd || !cmds[cmd]) {
    console.error(`Usage: node packages/engine/src/cli.js <${Object.keys(cmds).join('|')}>`);
    process.exit(1);
  }
  const emitter = createEmitter();
  print(emitter);
  await cmds[cmd]({ env: process.env, emitter });
}

main().catch((e) => {
  console.error(e && (e.stack || e.message));
  process.exit(1);
});
