import { extractFromFiles, extractAll } from './extractor.js';
import { inspectExcel, buildMapping, previewRows, fillCopy, fillInPlace, fillInPlaceSync } from '@terraflow/excel';
import { createProvider } from '@terraflow/ai';

/**
 * Plugin contracts — the stable extension mechanism (ARCHITECTURE_PLAN §6).
 *
 * The engine talks to adapters only through these interfaces. Today's built-in
 * adapters are declared here as the first plugin-shaped implementations, so
 * v0.6's second workflow (a real plugin pair) ships against contracts that are
 * already proven in production paths:
 *
 *   input : read(source, ctx) -> { records, removed, failures }
 *   output: inspect(destination) -> info
 *           draft(records, opts) -> draft
 *           preview(draft)       -> rows
 *           apply(draft, opts)   -> result
 *   ai    : extract(record, prompt, opts) -> normalized JSON
 *
 * The registry (v0.7+) adds discovery + manifests validation for user-installed
 * plugins; the shape below is what it will validate.
 */

export const PLUGIN_TYPES = ['input', 'output', 'ai', 'workflow'];

// The contract method(s) every plugin of a type MUST expose.
export const CONTRACTS = {
  input: ['read'],
  output: ['inspect', 'draft', 'preview', 'apply'],
  ai: ['extract'],
  workflow: [],
};

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return { ok: false, errors: ['manifest must be an object'] };
  if (typeof manifest.id !== 'string' || !manifest.id) errors.push('id is required');
  if (!PLUGIN_TYPES.includes(manifest.type)) errors.push(`type must be one of: ${PLUGIN_TYPES.join(', ')}`);
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push('version must be semver (e.g. 1.0.0)');
  if (!Array.isArray(manifest.contract)) errors.push('contract must be a list of method names');
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [] };
}

// Asserts a plugin implementation actually exposes the methods its contract
// declares. Throws on mismatch so a broken plugin fails loudly at load time.
export function validatePlugin(plugin) {
  const m = validateManifest(plugin.manifest);
  if (!m.ok) throw new Error(`Plugin ${plugin.manifest?.id || '<unnamed>'} manifest invalid: ${m.errors.join('; ')}`);
  for (const method of plugin.manifest.contract) {
    if (typeof plugin[method] !== 'function') {
      throw new Error(`Plugin ${plugin.manifest.id} breaks its ${plugin.manifest.type} contract: missing method "${method}"`);
    }
  }
  return true;
}

// ---- Built-in plugins (declared, so the engine never special-cases them) ----

// INPUT PLUGIN — KMZ (unzip → KML → parse → dedupe) → canonical records.
// read(source, ctx) where source is { kind:'dir', dir } or { kind:'files', files }
// and ctx may carry { signal } (abortable). Returns { records, removed, failures }.
export function createInputPlugin({ id = 'input-kmz', version = '1.0.0' } = {}) {
  const plugin = {
    manifest: {
      id,
      type: 'input',
      version,
      name: 'KMZ input (KML parse + dedupe)',
      description: 'Reads .kmz placemarks into canonical records with coordinate/description dedupe.',
      contract: ['read'],
    },
    async read(source, ctx = {}) {
      const { signal } = ctx;
      if (signal?.aborted) throw new Error('Canceled during input read');
      if (source?.kind === 'files') {
        const { properties, removed, failures } = extractFromFiles(source.files);
        return { records: properties, removed, failures };
      }
      const dir = source?.kind === 'dir' ? source.dir : source;
      const { properties, removed, failures } = extractAll(dir);
      return { records: properties, removed, failures };
    },
  };
  validatePlugin(plugin);
  return plugin;
}

// OUTPUT PLUGIN — Excel (copy-first) → inspect / draft / preview / apply.
// draft() grounds a field→column mapping against the workbook and computes the
// exact rows; preview() re-computes them for review; apply() writes a copy, the
// original (with forced backup) or a watch reconcile of the original.
export function createOutputPlugin({ id = 'output-excel', version = '1.0.0' } = {}) {
  const plugin = {
    manifest: {
      id,
      type: 'output',
      version,
      name: 'Excel output (copy-first)',
      description: 'Inspects a workbook, drafts a field→column mapping + rows, previews and applies to a copy or the original with forced backup.',
      contract: ['inspect', 'draft', 'preview', 'apply'],
    },
    async inspect(destination = {}) {
      return inspectExcel({ templatePath: destination.templatePath });
    },
    async draft(records, { templatePath, mode = 'copy', profilesDir = null } = {}) {
      if (!templatePath) throw new Error('draft requires templatePath');
      const { sheet, headers, mapping, validation, profile } = await buildMapping({ templatePath, profilesDir });
      const preview = await previewRows({ templatePath, records, mode, autoCreate: validation.autoCreate });
      return {
        mode,
        templatePath,
        records,
        sheet,
        headers,
        mapping,
        validation,
        profile,
        rows: preview.rows,
        startRow: preview.startRow,
        lastRow: preview.lastRow,
        autoCreate: validation.autoCreate,
      };
    },
    async preview(draft = {}) {
      if (!draft.templatePath || !Array.isArray(draft.records)) {
        throw new Error('preview requires a draft from draft()');
      }
      return previewRows({
        templatePath: draft.templatePath,
        records: draft.records,
        mode: draft.mode || 'copy',
        autoCreate: draft.autoCreate,
      });
    },
    async apply(draft = {}, opts = {}) {
      const mode = opts.mode || draft.mode || 'copy';
      if (mode === 'copy') {
        if (!opts.outputPath) throw new Error('apply(copy) requires outputPath');
        return fillCopy({
          templatePath: draft.templatePath,
          outputPath: opts.outputPath,
          records: draft.records,
          autoCreate: opts.autoCreate ?? draft.autoCreate,
        });
      }
      if (mode === 'original') {
        if (!opts.originalPath) throw new Error('apply(original) requires originalPath');
        return fillInPlace({
          originalPath: opts.originalPath,
          records: draft.records,
          backupDir: opts.backupDir,
          autoCreate: opts.autoCreate ?? draft.autoCreate,
        });
      }
      if (mode === 'sync') {
        if (!opts.originalPath) throw new Error('apply(sync) requires originalPath');
        return fillInPlaceSync({
          originalPath: opts.originalPath,
          records: draft.records,
          backupDir: opts.backupDir,
          autoCreate: opts.autoCreate ?? draft.autoCreate,
          statePath: opts.statePath,
        });
      }
      throw new Error(`Unknown output mode: ${mode}`);
    },
  };
  validatePlugin(plugin);
  return plugin;
}

// AI PROVIDER PLUGIN — Groq today, provider-agnostic by contract.
// extract(record, prompt, opts) calls the configured provider (via createProvider)
// and returns the normalized JSON for the record. The prompt is the system
// instruction; the record is the source entry to enrich.
export function createAiPlugin({ id = 'ai-groq', version = '1.0.0', config = {} } = {}) {
  const provider = createProvider(config);
  const plugin = {
    manifest: {
      id,
      type: 'ai',
      version,
      name: 'AI extract',
      description: `Provider-agnostic field extraction via ${config.provider || 'cloud'} (model: ${config.model || 'default'}).`,
      contract: ['extract'],
    },
    async extract(record, prompt, opts = {}) {
      const enriched = await provider.enrich(record, { signal: opts.signal, retries: opts.retries });
      return enriched;
    },
    async test(opts) {
      return provider.test(opts);
    },
    pacingMs() {
      return provider.pacingMs();
    },
  };
  validatePlugin(plugin);
  return plugin;
}

// ---- Registry (small factory today; discovery + local plugin dir in v0.7+) ----

// Declarative audit list: every built-in plugin with its manifest. No config
// required, safe to show in the Professional UI "Installed plugins" panel.
export function listPlugins() {
  return [
    createInputPlugin().manifest,
    createOutputPlugin().manifest,
    createAiPlugin({ config: {} }).manifest,
  ];
}

// Resolve a built-in plugin by type + id, honoring the contracts only.
// Throws if the type/id is unknown or the implementation fails validation.
export function resolvePlugin(type, id, { config = {} } = {}) {
  if (type === 'input' && (!id || id === 'input-kmz')) return createInputPlugin();
  if (type === 'output' && (!id || id === 'output-excel')) return createOutputPlugin();
  if (type === 'ai' && (!id || id === 'ai-groq')) return createAiPlugin({ config });
  throw new Error(`Unknown ${type} plugin: ${id || '<none>'}`);
}

// Ready-made implementations for engine/API use.
export function createBuiltinPlugins({ config = {} } = {}) {
  return {
    input: createInputPlugin(),
    output: createOutputPlugin(),
    ai: createAiPlugin({ config }),
  };
}
