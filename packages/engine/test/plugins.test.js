import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  PLUGIN_TYPES, CONTRACTS, validateManifest, validatePlugin,
  createInputPlugin, createInputCsvPlugin, createOutputPlugin, createOutputDatabasePlugin,
  createAiPlugin, listPlugins, resolvePlugin, createBuiltinPlugins,
} from '../src/plugins.js';
import { createDb, loadRecords } from '@terraflow/database';

const DB_AVAILABLE = (() => {
  try {
    const client = createDb(process.env);
    return true; // only the real connect tells us; each test guards itself
  } catch {
    return false;
  }
})();

async function dbUp() {
  const client = createDb(process.env);
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

test('plugin types and contracts are stable', () => {
  assert.deepEqual(PLUGIN_TYPES, ['input', 'output', 'ai', 'workflow']);
  assert.deepEqual(CONTRACTS.output, ['inspect', 'draft', 'preview', 'apply']);
  assert.deepEqual(CONTRACTS.input, ['read']);
  assert.deepEqual(CONTRACTS.ai, ['extract']);
});

test('validateManifest rejects bad manifests', () => {
  assert.equal(validateManifest({}).ok, false);
  assert.equal(validateManifest({ id: 'x', type: 'bogus', version: '1.0.0', contract: [] }).ok, false);
  assert.equal(validateManifest({ id: 'x', type: 'input', version: 'v1', contract: ['read'] }).ok, false);
  assert.equal(validateManifest({ id: 'x', type: 'input', version: '1.0.0', contract: ['read'] }).ok, true);
});

test('every built-in plugin validates and lists', () => {
  const manifests = listPlugins();
  const ids = manifests.map((m) => m.id);
  assert.ok(ids.includes('input-kmz'));
  assert.ok(ids.includes('input-csv'));
  assert.ok(ids.includes('output-excel'));
  assert.ok(ids.includes('output-database'));
  assert.ok(ids.includes('ai-groq'));
  for (const m of manifests) assert.equal(validateManifest(m).ok, true);
});

test('resolvePlugin returns contract-compliant instances by type+id', () => {
  assert.equal(resolvePlugin('input', 'input-kmz').manifest.type, 'input');
  assert.equal(resolvePlugin('input', 'input-csv').manifest.type, 'input');
  assert.equal(resolvePlugin('output', 'output-excel').manifest.type, 'output');
  assert.equal(resolvePlugin('output', 'output-database').manifest.type, 'output');
  assert.equal(resolvePlugin('ai', 'ai-groq', { config: {} }).manifest.type, 'ai');
  assert.throws(() => resolvePlugin('input', 'input-unknown'), /Unknown input plugin/);
  assert.throws(() => resolvePlugin('output', 'output-unknown'), /Unknown output plugin/);
  assert.throws(() => resolvePlugin('ai', 'ai-unknown'), /Unknown ai plugin/);
});

test('createBuiltinPlugins exposes both output adapters', () => {
  const all = createBuiltinPlugins({ config: {} });
  assert.ok(all.input && all.inputCsv && all.output && all.outputDb && all.ai);
  assert.ok(all.outputDb.apply && all.outputDb.preview && all.outputDb.draft && all.outputDb.inspect);
});

test('input-csv plugin reads a real file into records', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-plugins-'));
  const p = path.join(dir, 'leads.csv');
  fs.writeFileSync(p, 'name,phone,city\nAli,0550,Algiers\nSara,0660,Constantine\n', 'utf8');
  try {
    const plugin = createInputCsvPlugin();
    const result = await plugin.read({ kind: 'file', path: p });
    assert.equal(result.records.length, 2);
    assert.equal(result.records[0].name, 'Ali');
    assert.deepEqual(result.records[0], { sourceFile: 'leads.csv', sourceRow: 2, name: 'Ali', phone: '0550', city: 'Algiers' });
    assert.equal(validatePlugin(plugin), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('output-database plugin: draft computes an insert plan without writing', async (t) => {
  if (!(await dbUp())) { t.skip('PostgreSQL not reachable'); return; }
  const wf = `test-${Date.now()}`;
  const plugin = createOutputDatabasePlugin({ config: { workflowType: wf } });
  const records = [
    { sourceFile: 'leads.csv', sourceRow: 2, name: 'Ali', phone: '0550', city: 'Algiers' },
    { sourceFile: 'leads.csv', sourceRow: 3, name: 'Sara', phone: '0660', city: 'Constantine' },
  ];
  const draft = await plugin.draft(records, { workflowType: wf });
  assert.equal(draft.table, 'records');
  assert.equal(draft.counts.inserts, 2);
  assert.equal(draft.counts.updates, 0);
  assert.equal(draft.counts.deletes, 0);
  // nothing written yet
  assert.equal((await loadRecords({ workflowType: wf })).length, 0);
  const preview = await plugin.preview(draft);
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[0].action, 'insert');
  assert.equal(preview.rows[0].name, 'Ali');
});

test('output-database plugin: apply writes and a re-draft is empty (idempotent)', async (t) => {
  if (!(await dbUp())) { t.skip('PostgreSQL not reachable'); return; }
  const wf = `test-${Date.now()}`;
  const plugin = createOutputDatabasePlugin({ config: { workflowType: wf } });
  const records = [
    { sourceFile: 'leads.csv', sourceRow: 2, name: 'Ali', phone: '0550', city: 'Algiers' },
    { sourceFile: 'leads.csv', sourceRow: 3, name: 'Sara', phone: '0660', city: 'Constantine' },
  ];
  try {
    const draft = await plugin.draft(records, { workflowType: wf });
    const result = await plugin.apply(draft, {});
    assert.equal(result.inserted, 2);
    assert.equal(result.total, 2);
    const rows = await loadRecords({ workflowType: wf });
    assert.equal(rows.length, 2);
    assert.ok(rows.some((r) => r.payload.name === 'Ali'));
    // Second draft: unchanged, no inserts/updates.
    const draft2 = await plugin.draft(records, { workflowType: wf });
    assert.equal(draft2.counts.inserts, 0);
    assert.equal(draft2.counts.updates, 0);
    assert.equal(draft2.counts.unchanged, 2);
    // Change one value -> update.
    const changed = [{ ...records[0], city: 'Oran' }, records[1]];
    const draft3 = await plugin.draft(changed, { workflowType: wf });
    assert.equal(draft3.counts.updates, 1);
    const res3 = await plugin.apply(draft3, {});
    assert.equal(res3.updated, 1);
    const after = await loadRecords({ workflowType: wf });
    const payloads = after.map((r) => r.payload);
    assert.ok(payloads.some((p) => p.city === 'Oran'));
    await assert.rejects(plugin.preview({}), /draft from draft/);
    await assert.rejects(plugin.apply({}), /draft from draft/);
  } finally {
    const client = createDb(process.env);
    await client.connect();
    await client.query('DELETE FROM records WHERE workflow_type = $1', [wf]);
    await client.end().catch(() => {});
  }
});
