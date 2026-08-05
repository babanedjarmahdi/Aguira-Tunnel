import fs from 'fs';
import path from 'path';
import { TEMPLATES_DIR } from './config.js';
import { inspectExcel } from '@terraflow/excel';

// Persisted registry of destination workbooks (the files the fill stage writes
// into). Each upload of the same template name becomes a new version; the file
// bytes live in output/templates/<id>/v<N>/ and the metadata in index.json.
// JSON stores here must only be written via Node (PowerShell Set-Content writes
// a BOM that breaks JSON.parse — see docs/OPERATIONS.md).

const INDEX_FILE = path.join(TEMPLATES_DIR, 'index.json');

function readIndex() {
  if (!fs.existsSync(INDEX_FILE)) return { nextId: 1, templates: [] };
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch {
    return { nextId: 1, templates: [] };
  }
}

function writeIndex(index) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  fs.writeFileSync(`${INDEX_FILE}.tmp`, JSON.stringify(index, null, 2), 'utf8');
  fs.renameSync(`${INDEX_FILE}.tmp`, INDEX_FILE);
}

function publicVersion(v) {
  return { version: v.version, fileName: v.fileName, size: v.size, uploadedAt: v.uploadedAt, error: v.error || null };
}

function publicTemplate(t) {
  return {
    id: t.id,
    name: t.name,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    versions: t.versions.map(publicVersion),
    config: t.config || null,
  };
}

export function listTemplates() {
  return readIndex().templates.map(publicTemplate);
}

export function getTemplate(id) {
  const t = readIndex().templates.find((x) => x.id === id) || null;
  return t ? publicTemplate(t) : null;
}

// Copies the staged upload into the store as a new version and inspects it
// (sheets, start row, headers). Throws on invalid input; flags unreadable files.
export async function registerTemplate({ name, filePath }) {
  if (!name || !filePath) throw new Error('name and filePath are required');
  if (!fs.existsSync(filePath)) throw new Error(`Uploaded file not found: ${filePath}`);

  const idx = readIndex();
  let t = idx.templates.find((x) => x.name === name);
  if (!t) {
    t = {
      id: `t${idx.nextId++}`,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      versions: [],
      config: null,
    };
    idx.templates.push(t);
  }

  const version = t.versions.length + 1;
  const dir = path.join(TEMPLATES_DIR, t.id, `v${version}`);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(filePath);
  const dest = path.join(dir, base);
  fs.copyFileSync(filePath, dest);

  const record = { version, fileName: base, file: dest, size: fs.statSync(dest).size, uploadedAt: new Date().toISOString() };
  try {
    const inspection = await inspectExcel({ templatePath: dest });
    record.sheet = inspection.sheet.name;
    record.startRow = inspection.sheet.startRow;
    record.headers = inspection.headers;
  } catch {
    record.error = 'Not a readable Excel workbook';
  }

  t.versions.push(record);
  t.config = {
    sheet: record.sheet || t.config?.sheet || null,
    startRow: record.startRow ?? t.config?.startRow ?? null,
    headers: record.headers || t.config?.headers || [],
    mapping: t.config?.mapping || null,
    activeVersion: version,
  };
  t.updatedAt = new Date().toISOString();
  writeIndex(idx);
  return publicTemplate(t);
}

// Updates template metadata. Re-inspects the active workbook when `sheet` is
// provided (fresh start row + headers); `mapping` is stored verbatim.
export async function updateTemplate(id, patch = {}) {
  const idx = readIndex();
  const t = idx.templates.find((x) => x.id === id);
  if (!t) throw new Error(`Template not found: ${id}`);
  if (!t.versions.length) throw new Error(`Template has no versions: ${id}`);

  if (patch.name) t.name = patch.name;
  const cfg = { ...(t.config || {}) };
  if (patch.mapping !== undefined) cfg.mapping = patch.mapping;
  if (patch.sheet !== undefined) cfg.sheet = patch.sheet;
  if (patch.startRow !== undefined) cfg.startRow = patch.startRow;

  if (patch.sheet !== undefined || patch.startRow !== undefined) {
    const active = t.versions.find((v) => v.version === (cfg.activeVersion || t.versions[t.versions.length - 1].version)) || t.versions[t.versions.length - 1];
    try {
      const inspection = await inspectExcel({ templatePath: active.file });
      cfg.sheet = inspection.sheet.name;
      cfg.startRow = inspection.sheet.startRow;
      cfg.headers = inspection.headers;
    } catch {
      // keep existing config for unreadable files
    }
  }

  t.config = cfg;
  t.updatedAt = new Date().toISOString();
  writeIndex(idx);
  return publicTemplate(t);
}

export function deleteTemplate(id) {
  const idx = readIndex();
  const i = idx.templates.findIndex((x) => x.id === id);
  if (i === -1) throw new Error(`Template not found: ${id}`);
  const [t] = idx.templates.splice(i, 1);
  try {
    fs.rmSync(path.join(TEMPLATES_DIR, t.id), { recursive: true, force: true });
  } catch { /* best-effort cleanup */ }
  writeIndex(idx);
  return { ok: true, id };
}

// Absolute path of a stored version's workbook (for download / inspect / map).
export function templateVersionPath(id, version) {
  const t = readIndex().templates.find((x) => x.id === id);
  if (!t) throw new Error(`Template not found: ${id}`);
  const v = t.versions.find((x) => x.version === Number(version));
  if (!v) throw new Error(`Version ${version} not found`);
  return v.file;
}

// Path of the active (latest) version's workbook.
export function activeTemplatePath(id) {
  const t = readIndex().templates.find((x) => x.id === id);
  if (!t) throw new Error(`Template not found: ${id}`);
  const active = t.versions.find((v) => v.version === (t.config?.activeVersion || t.versions[t.versions.length - 1].version)) || t.versions[t.versions.length - 1];
  if (!active) throw new Error(`Template has no versions: ${id}`);
  return active.file;
}
