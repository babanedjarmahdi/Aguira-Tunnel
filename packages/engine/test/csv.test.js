import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, headersFromRows, recordsFromCsv, scanCsvFiles, readCsvSource, resolveCsvFiles } from '../src/csv.js';
import { cleanRecords, cleanRecord, coerceValue } from '../src/cleaning.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

test('parseCsv handles quotes, commas, embedded newlines, CRLF and BOM', () => {
  const text = '\uFEFFname,price,note\r\n"plot A",4.5,"hello, world"\r\n"multi\nline",7,""';
  const { rows, starts } = parseCsv(text);
  assert.deepEqual(rows, [
    ['name', 'price', 'note'],
    ['plot A', '4.5', 'hello, world'],
    ['multi\nline', '7', ''],
  ]);
  assert.deepEqual(starts, [1, 2, 3]);
});

test('parseCsv handles doubled quotes inside a field', () => {
  const { rows } = parseCsv('a,b\n"say ""hi""",2');
  assert.deepEqual(rows, [['a', 'b'], ['say "hi"', '2']]);
});

test('recordsFromCsv maps headers to records with physical sourceRow', () => {
  const { rows, starts } = parseCsv('name,price\nA,1\nB,2');
  const recs = recordsFromCsv({ sourceFile: 'x.csv', rows, starts });
  assert.deepEqual(recs, [
    { sourceFile: 'x.csv', sourceRow: 2, name: 'A', price: '1' },
    { sourceFile: 'x.csv', sourceRow: 3, name: 'B', price: '2' },
  ]);
});

test('recordsFromCsv skips blank rows and names blank/duplicate headers', () => {
  const { rows, starts } = parseCsv(',price\n,5\nA,6\n\nB,7');
  const headers = headersFromRows(rows);
  assert.deepEqual(headers, ['col1', 'price']);
  const recs = recordsFromCsv({ sourceFile: 'x.csv', rows, starts });
  assert.equal(recs.length, 3);
  assert.equal(recs[0].col1, '');
  assert.equal(recs[0].price, '5');
});

test('headersFromRows disambiguates duplicate headers', () => {
  const { rows } = parseCsv('a,a,b\n1,2,3');
  assert.deepEqual(headersFromRows(rows), ['a', 'a_2', 'b']);
});

test('scanCsvFiles lists only .csv files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-csv-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.csv'), 'x\n');
    fs.writeFileSync(path.join(dir, 'b.CSV'), 'x\n');
    fs.writeFileSync(path.join(dir, 'c.txt'), 'x\n');
    fs.mkdirSync(path.join(dir, 'sub'));
    const files = scanCsvFiles(dir);
    assert.equal(files.length, 2);
    assert.ok(files.some((f) => f.name === 'a.csv'));
    assert.ok(files.some((f) => f.name === 'b.CSV'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readCsvSource reads a file source and dedupes by sourceFile@sourceRow', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-csvsrc-'));
  const p = path.join(dir, 'data.csv');
  fs.writeFileSync(p, 'name,price\nA,1\nB,2\n', 'utf8');
  try {
    // The same file listed twice must not produce duplicate records.
    const { records, removed, failures } = await readCsvSource({ kind: 'files', files: [{ path: p, name: 'data.csv' }, { path: p, name: 'data.csv' }] });
    assert.equal(records.length, 2);
    assert.equal(removed.length, 2);
    assert.equal(failures.length, 0);
    assert.equal(records[0].name, 'A');
    assert.equal(records[1].sourceRow, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readCsvSource scans a directory and reports missing files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tf-csvdir-'));
  fs.writeFileSync(path.join(dir, 'one.csv'), 'x,y\n1,2\n', 'utf8');
  try {
    const { records } = await readCsvSource({ kind: 'dir', dir });
    assert.equal(records.length, 1);
    assert.equal(records[0].sourceFile, 'one.csv');
    const dirRecs = await readCsvSource(dir);
    assert.equal(dirRecs.records.length, 1);
    const missing = await readCsvSource({ kind: 'file', path: path.join(dir, 'nope.csv') });
    assert.equal(missing.failures.length, 1);
    assert.equal(resolveCsvFiles([]).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cleaning coerces numerics (incl. Arabic digits) and nulls empties', () => {
  assert.equal(coerceValue('١٢٣'), 123);
  assert.equal(coerceValue(' 4.5 '), 4.5);
  assert.equal(coerceValue('-7'), -7);
  assert.equal(coerceValue('plot A'), 'plot A');
  assert.equal(coerceValue(''), '');
  const cleaned = cleanRecord({ sourceFile: 'f.csv', sourceRow: 2, name: 'مزرعة', price: '١٢٣', note: '', area: '0.5' });
  assert.deepEqual(cleaned, { sourceFile: 'f.csv', sourceRow: 2, name: 'مزرعة', price: 123, note: null, area: 0.5 });
});

test('cleanRecords drops rows with no data and keeps the rest', () => {
  const { records, dropped } = cleanRecords([
    { sourceFile: 'f.csv', sourceRow: 2, name: 'A', price: '1' },
    { sourceFile: 'f.csv', sourceRow: 3, name: '', price: '  ' },
  ]);
  assert.equal(records.length, 1);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].sourceRow, 3);
  assert.equal(records[0].price, 1);
});
