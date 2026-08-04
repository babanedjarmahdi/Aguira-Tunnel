import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCopyRows, computeInPlaceRows } from '../src/rows.js';
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
