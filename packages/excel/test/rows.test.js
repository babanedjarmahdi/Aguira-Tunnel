import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCopyRows, computeInPlaceRows, computeInPlaceSyncRows } from '../src/rows.js';
import { previewRows } from '../src/fill.js';

function fakeWs(existingRows = []) {
  const cells = new Map();
  for (const { row, col, value } of existingRows) cells.set(`${col}${row}`, { value, text: String(value ?? '') });
  return {
    rowCount: 1000,
    getCell(ref) {
      const m = ref.match(/^([A-Z]+)(\d+)$/);
      const col = m[1]; const row = Number(m[2]);
      const cell = cells.get(`${col}${row}`) || { value: undefined, text: '' };
      return { ...cell, value: cell.value };
    },
  };
}

const records = [
  { sourceFile: 'a.kmz', placemarkIndex: 0, name: 'Villa', areaM2: 400,
    ai: { property_type: 'أرض', status: 'متوفر', location: 'صالوحة', area_m2: 400,
          price_note: '9 مليون', price_in_million: 9, owner_name: 'حمو خضير', phone: '0671550545', notes: 'قابل للتقسيم' } },
];

test('computeCopyRows: generated ids, numeric DA price, notes', () => {
  const ws = fakeWs([{ row: 4, col: 'A', value: 'L4001' }]);
  const { startRow, rows } = computeCopyRows(ws, records);
  assert.equal(startRow, 5);
  const r = rows[0];
  assert.equal(r.cells.A, 'L4001A');           // genId avoids existing L4001 with suffix
  assert.equal(r.cells.B, 'أرض');
  assert.equal(r.cells.C, 'متوفر');
  assert.equal(r.cells.D, 'صالوحة');
  assert.equal(r.cells.E, 400);
  assert.equal(r.cells.F, 90000);              // numeric DA from price_in_million (9M centimes)
  assert.equal(r.cells.G, 'حمو خضير');
  assert.equal(r.cells.I, '0671550545');
  assert.equal(r.cells.J.includes('حمو خضير'), true);
  assert.equal(r.cells.H, 'مع المالك');
  assert.equal(r.cells.L, r.row - 3);
  assert.equal(r.cells.M, null);
  assert.equal(r.cells.N, null);
});

test('computeInPlaceRows: template id scheme + display price', () => {
  const ws = fakeWs([]);
  const { startRow, rows } = computeInPlaceRows(ws, records);
  assert.equal(startRow, 4);
  const r = rows[0];
  assert.equal(r.cells.A, 'L4009');            // prefix L + area 400 + mils 9
  assert.equal(r.cells.F, '9M');
  assert.equal(r.cells.D, 'صالوحة');
});

test('computeInPlaceRows: duplicate type/area/mil gets letter suffix', () => {
  const ws = fakeWs([]);
  const two = [...records, { ...records[0] }];
  const { rows } = computeInPlaceRows(ws, two);
  assert.equal(rows[0].cells.A, 'L4009');
  assert.equal(rows[1].cells.A, 'L4009A');
});

test('previewRows reads a real template path', async () => {
  const template = process.env.EXCEL_TEMPLATE;
  if (!template) return;
  const preview = await previewRows({ templatePath: template, records, mode: 'copy' });
  assert.ok(preview.rows.length >= 1);
  assert.ok(preview.startRow >= 4);
  assert.equal(preview.mode, 'copy');
});

// ---- Watch-mode sync reconciliation (computeInPlaceSyncRows) ----
function syncedWs(existingRows = []) {
  const cells = new Map();
  for (const { row, col, value } of existingRows) cells.set(`${col}${row}`, { value, text: String(value ?? '') });
  return {
    rowCount: 1000,
    getCell(ref) {
      const m = ref.match(/^([A-Z]+)(\d+)$/);
      const col = m[1]; const row = Number(m[2]);
      const cell = cells.get(`${col}${row}`) || { value: undefined, text: '' };
      return { ...cell, value: cell.value };
    },
  };
}

const rec = (sourceFile, patch = {}) => ({
  sourceFile,
  placemarkIndex: 0,
  name: 'Villa',
  areaM2: 400,
  ai: {
    property_type: 'أرض', status: 'متوفر', location: 'صالوحة', area_m2: 400,
    price_note: '9 مليون', price_in_million: 9, owner_name: 'حمو خضير', phone: '0671550545', notes: 'قابل للتقسيم',
    ...patch,
  },
});

test('sync: empty sheet + empty state appends every record', () => {
  const ws = syncedWs([]);
  const { rows, state, updated, removed, appended, lastRow } = computeInPlaceSyncRows(ws, [rec('a.kmz'), rec('b.kmz')], {});
  assert.equal(updated, 0);
  assert.equal(removed, 0);
  assert.equal(appended, 2);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].row, 4);
  assert.equal(rows[1].row, 5);
  assert.equal(rows[0].keepId, false);
  assert.equal(rows[0].id, 'L4009');
  assert.equal(rows[1].id, 'L4009A');
  assert.equal(state['a.kmz@0'], 4);
  assert.equal(state['b.kmz@0'], 5);
  assert.equal(lastRow, 5);
});

test('sync: existing state rows update in place and keep their id', () => {
  const ws = syncedWs([
    { row: 4, col: 'A', value: 'L4009' }, { row: 4, col: 'B', value: 'أرض' },
    { row: 4, col: 'D', value: 'صالوحة' }, { row: 4, col: 'E', value: 400 }, { row: 4, col: 'F', value: '9M' },
  ]);
  const { rows, state, appended, removed } = computeInPlaceSyncRows(
    ws, [rec('a.kmz', { price_note: '12 مليون', price_in_million: 12 })], { 'a.kmz@0': 4 });
  assert.equal(removed, 0);
  assert.equal(appended, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].row, 4);
  assert.equal(rows[0].keepId, true);        // id column is preserved
  assert.equal(state['a.kmz@0'], 4);
  assert.equal(rows[0].cells.F, '12M');      // changed price is written
});

test('sync: deleted KMZ removes its row and shifts the block up', () => {
  const ws = syncedWs([
    { row: 5, col: 'A', value: 'L4009' }, { row: 5, col: 'B', value: 'أرض' },
    { row: 5, col: 'D', value: 'صالوحة' }, { row: 5, col: 'E', value: 400 }, { row: 5, col: 'F', value: '9M' },
    { row: 6, col: 'A', value: 'L4009A' }, { row: 6, col: 'B', value: 'أرض' },
    { row: 6, col: 'D', value: 'صالوحة' }, { row: 6, col: 'E', value: 400 }, { row: 6, col: 'F', value: '9M' },
  ]);
  const { rows, state, removed, deletions } = computeInPlaceSyncRows(
    ws, [rec('b.kmz')], { 'a.kmz@0': 5, 'b.kmz@0': 6 });
  assert.deepEqual(deletions, [5]);          // a.kmz is gone -> row 5 deleted
  assert.equal(removed, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].row, 5);              // b.kmz shifts up from 6 to 5
  assert.equal(state['b.kmz@0'], 5);
  assert.equal(state['a.kmz@0'], undefined);
});

test('sync: unmanaged matching rows are adopted, not duplicated', () => {
  const ws = syncedWs([
    { row: 4, col: 'A', value: 'L4009' }, { row: 4, col: 'B', value: 'أرض' },
    { row: 4, col: 'D', value: 'صالوحة' }, { row: 4, col: 'E', value: 400 }, { row: 4, col: 'F', value: '9M' },
  ]);
  const { rows, appended, updated } = computeInPlaceSyncRows(ws, [rec('a.kmz')], {});
  assert.equal(appended, 0);                 // matched the existing row
  assert.equal(updated, 1);
  assert.equal(rows[0].row, 4);
  assert.equal(rows[0].keepId, true);
});

test('sync: record with no ai is left untouched (no write, no delete)', () => {
  const ws = syncedWs([
    { row: 4, col: 'A', value: 'L4009' }, { row: 4, col: 'B', value: 'أرض' },
    { row: 4, col: 'D', value: 'صالوحة' }, { row: 4, col: 'E', value: 400 }, { row: 4, col: 'F', value: '9M' },
  ]);
  const { rows, state, removed } = computeInPlaceSyncRows(
    ws, [{ sourceFile: 'a.kmz', placemarkIndex: 0, ai: null }], { 'a.kmz@0': 4 });
  assert.equal(removed, 0);
  assert.equal(rows.length, 0);
  assert.equal(state['a.kmz@0'], undefined);
});
