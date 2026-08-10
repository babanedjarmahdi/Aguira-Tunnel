import { readCsvSource } from '../csv.js';
import { validatePlugin } from '../plugins.js';

// INPUT PLUGIN — CSV (parse + row dedupe) → canonical records.
// read(source, ctx) where source is { kind:'file', path } | { kind:'files' }
// | { kind:'dir' } and ctx may carry { signal }. Returns { records, removed,
// failures, files }. Parsing only — value cleaning is a separate transform step.
export function createInputCsvPlugin({ id = 'input-csv', version = '1.0.0' } = {}) {
  const plugin = {
    manifest: {
      id,
      type: 'input',
      version,
      name: 'CSV input (parse + row dedupe)',
      description: 'Reads .csv files into canonical records (one record per data row, deduped by sourceFile@sourceRow).',
      contract: ['read'],
    },
    async read(source, ctx = {}) {
      if (ctx.signal?.aborted) throw new Error('Canceled during CSV read');
      return readCsvSource(source, ctx);
    },
  };
  validatePlugin(plugin);
  return plugin;
}
