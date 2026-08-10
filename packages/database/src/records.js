import { createDb } from './client.js';

// Generic Database OUTPUT ADAPTER: a universal `records` table keyed by
// (workflow_type, source_file, source_row). Any workflow can draft / preview /
// apply its canonical records here without a workflow-specific schema — this is
// the second, non-Excel destination (v0.6).
//
// Every entry point self-heals the schema (CREATE TABLE IF NOT EXISTS), so the
// adapter works whether the table was created by schema.sql on a fresh Postgres
// or on an already-running instance.

export const RECORDS_TABLE = 'records';

// Key-order-insensitive JSON equality (Postgres JSONB reorders keys, so plain
// JSON.stringify comparison would mark every stored row as changed).
function canonicalJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
}

export function jsonEq(a, b) {
  return canonicalJson(a) === canonicalJson(b);
}

export async function ensureRecordsSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${RECORDS_TABLE} (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_type TEXT NOT NULL,
      source_file   TEXT NOT NULL,
      source_row    INT  NOT NULL DEFAULT 0,
      payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workflow_type, source_file, source_row)
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_records_workflow ON ${RECORDS_TABLE} (workflow_type)`);
}

// Runs a callback with a client (an injected one, or a fresh connect/end).
export async function withClient(opts = {}, fn) {
  const client = opts.client || createDb(opts.env);
  if (!opts.client) await client.connect();
  try {
    return await fn(client);
  } finally {
    if (!opts.client) await client.end().catch(() => {});
  }
}

// Output contract `inspect(destination)`: what the destination currently holds.
export async function inspectRecordsTable({ workflowType = null, client = null, env = {} } = {}) {
  return withClient({ client, env }, async (c) => {
    await ensureRecordsSchema(c);
    const rowCount = workflowType
      ? (await c.query(`SELECT count(*)::int AS n FROM ${RECORDS_TABLE} WHERE workflow_type = $1`, [workflowType])).rows[0].n
      : (await c.query(`SELECT count(*)::int AS n FROM ${RECORDS_TABLE}`)).rows[0].n;
    const distinct = await c.query(`SELECT DISTINCT workflow_type FROM ${RECORDS_TABLE} ORDER BY 1`);
    return {
      table: RECORDS_TABLE,
      workflowType: workflowType || null,
      rowCount,
      workflowTypes: distinct.rows.map((r) => r.workflow_type),
    };
  });
}

// Output contract `draft(records)`: compute an insert/update/delete plan against
// the destination WITHOUT writing anything. Matches rows by (source_file,
// source_row); identical payloads are "unchanged". With prune=true, rows that
// disappeared from the source are planned for deletion.
export async function planRecordSync({ records = [], workflowType = 'csv-db', client = null, env = {}, prune = false } = {}) {
  return withClient({ client, env }, async (c) => {
    await ensureRecordsSchema(c);
    const existingRows = await c.query(
      `SELECT source_file, source_row, payload FROM ${RECORDS_TABLE} WHERE workflow_type = $1`,
      [workflowType]
    );
    const existing = new Map();
    for (const r of existingRows.rows) existing.set(`${r.source_file}@${r.source_row}`, r.payload);

    const incoming = new Map();
    for (const r of records) incoming.set(`${r.source_file}@${r.source_row}`, r);

    const keyOf = (r) => `${r.sourceFile}@${r.sourceRow}`;
    const payloadOf = (r) => {
      const payload = { ...r };
      delete payload.sourceFile;
      delete payload.sourceRow;
      return payload;
    };

    const inserts = [];
    const updates = [];
    const unchanged = [];
    for (const r of records) {
      const prev = existing.get(keyOf(r));
      const payload = payloadOf(r);
      if (prev == null) inserts.push({ sourceFile: r.sourceFile, sourceRow: r.sourceRow, payload });
      else if (jsonEq(prev, payload)) unchanged.push({ sourceFile: r.sourceFile, sourceRow: r.sourceRow, payload });
      else updates.push({ sourceFile: r.sourceFile, sourceRow: r.sourceRow, payload, prev });
    }

    const deletes = [];
    if (prune) {
      for (const k of existing.keys()) {
        if (!incoming.has(k)) {
          const [sourceFile, sr] = k.split('@');
          deletes.push({ sourceFile, sourceRow: Number(sr), payload: existing.get(k) });
        }
      }
    }

    return {
      table: RECORDS_TABLE,
      workflowType,
      records: records.length,
      inserts,
      updates,
      deletes,
      unchanged,
      counts: {
        inserts: inserts.length,
        updates: updates.length,
        deletes: deletes.length,
        unchanged: unchanged.length,
      },
    };
  });
}

// Output contract `apply(draft)`: write the reviewed plan to the destination.
// Inserts upsert (idempotent), updates overwrite, deletes prune.
export async function applyRecordSync({ draft = {}, client = null, env = {} }) {
  return withClient({ client, env }, async (c) => {
    await ensureRecordsSchema(c);
    const workflowType = draft.workflowType || 'csv-db';
    const { inserts = [], updates = [], deletes = [] } = draft;

    for (const ins of inserts) {
      await c.query(
        `INSERT INTO ${RECORDS_TABLE} (workflow_type, source_file, source_row, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (workflow_type, source_file, source_row) DO UPDATE SET
           payload = EXCLUDED.payload, updated_at = now()`,
        [workflowType, ins.sourceFile, ins.sourceRow, JSON.stringify(ins.payload)]
      );
    }
    for (const up of updates) {
      await c.query(
        `UPDATE ${RECORDS_TABLE} SET payload = $4::jsonb, updated_at = now()
         WHERE workflow_type = $1 AND source_file = $2 AND source_row = $3`,
        [workflowType, up.sourceFile, up.sourceRow, JSON.stringify(up.payload)]
      );
    }
    for (const del of deletes) {
      await c.query(
        `DELETE FROM ${RECORDS_TABLE} WHERE workflow_type = $1 AND source_file = $2 AND source_row = $3`,
        [workflowType, del.sourceFile, del.sourceRow]
      );
    }

    const total = await c.query(`SELECT count(*)::int AS n FROM ${RECORDS_TABLE} WHERE workflow_type = $1`, [workflowType]);
    return {
      table: RECORDS_TABLE,
      workflowType,
      inserted: inserts.length,
      updated: updates.length,
      deleted: deletes.length,
      total: total.rows[0].n,
    };
  });
}

// Read back stored records (for previews, audits and the API).
export async function loadRecords({ workflowType = null, limit = 100, client = null, env = {} } = {}) {
  return withClient({ client, env }, async (c) => {
    await ensureRecordsSchema(c);
    const rows = workflowType
      ? (await c.query(
          `SELECT * FROM ${RECORDS_TABLE} WHERE workflow_type = $1 ORDER BY created_at DESC LIMIT $2`,
          [workflowType, limit]
        )).rows
      : (await c.query(
          `SELECT * FROM ${RECORDS_TABLE} ORDER BY created_at DESC LIMIT $1`,
          [limit]
        )).rows;
    return rows;
  });
}
