import { planRecordSync, applyRecordSync, inspectRecordsTable } from '@terraflow/database';
import { validatePlugin } from '../plugins.js';

// OUTPUT PLUGIN — Database (generic Postgres `records` table).
// inspect(destination) -> what the destination holds today.
// draft(records, opts) -> insert/update/delete/unchanged plan (no writes).
// preview(draft)       -> reviewable rows for the UI.
// apply(draft, opts)   -> write the reviewed plan (idempotent upserts).
//
// This is the second, non-Excel destination: it proves an output adapter can
// implement the same inspect/draft/preview/apply contract against a totally
// different storage backend, with the engine never special-casing it.
export function createOutputDatabasePlugin({ id = 'output-database', version = '1.0.0', config = {} } = {}) {
  const plugin = {
    manifest: {
      id,
      type: 'output',
      version,
      name: 'Database output (Postgres records)',
      description: 'Drafts, previews and applies canonical records into the generic Postgres `records` table (safe execution: nothing is written before apply).',
      contract: ['inspect', 'draft', 'preview', 'apply'],
    },
    async inspect(destination = {}, opts = {}) {
      return inspectRecordsTable({
        workflowType: destination?.workflowType || opts.workflowType || null,
        client: opts.client,
        env: opts.env,
      });
    },
    async draft(records = [], opts = {}) {
      const plan = await planRecordSync({
        records,
        workflowType: opts.workflowType || config.workflowType || 'csv-db',
        client: opts.client,
        env: opts.env,
        prune: !!opts.prune,
      });
      return { ...plan, generatedAt: new Date().toISOString() };
    },
    async preview(draft = {}) {
      if (!draft || !Array.isArray(draft.inserts)) {
        throw new Error('preview requires a draft from draft()');
      }
      const rows = [
        ...(draft.inserts || []).map((r) => ({ action: 'insert', sourceFile: r.sourceFile, sourceRow: r.sourceRow, ...r.payload })),
        ...(draft.updates || []).map((r) => ({ action: 'update', sourceFile: r.sourceFile, sourceRow: r.sourceRow, ...r.payload })),
        ...(draft.deletes || []).map((r) => ({ action: 'delete', sourceFile: r.sourceFile, sourceRow: r.sourceRow })),
      ];
      return { table: draft.table || 'records', workflowType: draft.workflowType, rows, counts: draft.counts };
    },
    async apply(draft = {}, opts = {}) {
      if (!draft || !Array.isArray(draft.inserts)) {
        throw new Error('apply requires a draft from draft()');
      }
      return applyRecordSync({ draft, client: opts.client, env: opts.env });
    },
  };
  validatePlugin(plugin);
  return plugin;
}
