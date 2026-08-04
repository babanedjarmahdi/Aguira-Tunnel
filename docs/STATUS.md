# TerraFlow Engine — Project Status & Task Tracker

> **This is the living master checklist for the whole project.** It records every
> step, task and feature — done vs. not done — and is updated after **every**
> completed step, task or feature.
>
> **Rule for future work:** before starting any task, read this file +
> [ROADMAP.md](ROADMAP.md). After finishing any step/task/feature, update this
> file **first**, then commit. The plan lives in
> [ROADMAP.md](ROADMAP.md) (versions), [VISION.md](VISION.md) (product),
> [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) (blueprint).

**Legend:** ✅ done · 🔄 in progress · ⏳ planned · ⛔ blocked · ⚠️ needs care

---

## 1. The plan — master checklist

The project ships in 4 parts, mapped to ROADMAP versions.

### Part 1 — Workflow MVP: the safe import loop (ROADMAP v0.4) ✅

The engine becomes a real workflow engine: Job model, safe execution
(draft → preview → review → apply), job-based API + SSE, a real 6-step Basic UI.

#### 1.1 Workflow & Job model ✅
- [x] `packages/engine/src/jobs.js` — persisted Job store (`output/jobs/jobs.json`):
  create/update/get/list, job logs. `createJob` accepts `workflowId`.
- [x] `packages/engine/src/workflows.js` — persisted Workflow store
  (`output/jobs/workflows.json`): create/get/list/update/delete, `markWorkflowRun`
  (status completed/failed on job end).
- [x] Engine index exports jobs + workflows.
- [x] Job lifecycle: `running → completed | failed`, timestamps, duration,
  processed counts, log lines.

#### 1.2 Safe execution (run → draft → preview → apply) ✅
- [x] `packages/engine/src/draft.js` — draft/build/apply state machine
  (`buildDraft`, `getDraft`, `applyDraft`, `readJobRecords`), job-scoped
  dirs (`output/jobs/<id>/`).
- [x] Destination never touched before apply; apply reads the draft, writes
  only on explicit apply.

#### 1.3 Input sources
- [x] Single KMZ file upload (browser picker → `/api/jobs/:id/input`).
- [x] Whole folder of KMZ (multi-file upload).
- [x] `extractFromFiles(fileList)` in `packages/engine/src/extractor.js`
  (single-file / file-list input, split from `extractAll`).
- [x] **Watch mode UI** — Basic step 1 input source "watch folder" with a
  visible **"Watching…" state** and start/stop.
  - [x] Server side: `createWatchService` in `packages/engine/src/watch.js`
    (debounced, reusable, start/stop/close, `autoStart`) + `runWatcher` creates a
    `watch-sync` Job; CLI `watch`.
  - [x] API: `POST /api/watch/start` + `POST /api/watch/stop` (toggle) +
    `GET /api/watch` status; `watch:state` SSE event.
  - [x] UI: "Watch folder" option in ImportWizard step 1 (Standby/Watching badge,
    start/stop button, debounce display, link to Jobs).

#### 1.4 Destination understanding ✅ (core)
- [x] `packages/excel/src/inspect.js` — `inspectExcel` (sheets/headers/sample
  rows/data sheet detection) + `buildMapping` (auto-suggest field→column map).
- [x] Row math split into `packages/excel/src/rows.js`
  (`computeCopyRows`/`computeInPlaceRows`/`findStartRow`/`excelDateSerial`);
  `fill.js` refactored to use it, added `previewRows`.
- [x] Mapping validation (`validateMapping`: ok / missing / duplicate-column /
  mismatch / duplicate-header, `valid`, `issues`, `autoCreate`) against
  `EXPECTED_HEADERS`.
- [x] Auto-create missing columns: `ensureHeaders` in `fill.js`; threaded
  `autoCreate` through `previewRows` → `buildDraft` → `applyDraft` → API → wizard.
- [x] **Mapping profiles saved with the template**: `saveMappingProfile` /
  `getMappingProfile` (`output/mappings/<hash>.json`), `POST /api/excel/mapping/profile`,
  profile shown/saved in wizard step 1.

#### 1.5 Basic mode UI (6 steps) ✅
- [x] `apps/web/src/pages/ImportWizard.jsx` — real 6-step flow:
  1 Input → 2 Excel destination → 3 Run → 4 Progress → 5 Review draft → 6 Apply/download.
- [x] `apps/web/src/pages/Jobs.jsx` — reads real persisted jobs.
- [x] `apps/web/src/components/PipelineVisual.jsx` — `JOB_STAGES` incl. draft/apply.

#### 1.6 Job-based REST + SSE API ✅
- [x] `apps/api/src/server.js` — JobService (background runs, SSE broadcast,
  stage counters), uploads, excel inspect/mapping, jobs CRUD/run/draft/apply/
  download, watch wiring, `GET /api/properties`.
- [x] SSE: `/api/pipeline/events` (legacy) + `/api/jobs/events`.
- [x] Workflow endpoints: `GET/POST /api/workflows`,
  `GET/PUT/DELETE /api/workflows/:id`, `POST /api/workflows/:id/run`.
- [x] Legacy `POST /api/pipeline` kept.

#### 1.7 Single-port serving (:3000) ✅
- [x] Web app built into `apps/api/public`, served by API on
  `http://localhost:3000`. Vite dev (5173) optional only.
- [x] `npm.cmd run build:web` = build web + copy `dist` → `apps/api/public`.
- [x] `docs/OPERATIONS.md` updated to the single-port flow.

#### 1.8 Verification ✅
- [x] 13/13 tests pass (`packages/excel/test/price.test.js` + `rows.test.js`).
- [x] `vite build` clean; runtime smoke test (upload → job → draft → apply →
  download) OK; workflow create→run→status verified.

#### 1.9 Docs-alignment pass (approved plan) ✅
- [x] `docs/VISION.md` — §3 "where we are" updated (safe loop Jobs/draft/apply,
  Watch mode start/stop, single-port monorepo); v0.4 section marked ✅.
- [x] `docs/ROADMAP.md` — v0.4 marked ✅ with full done breakdown (workflows/jobs,
  safe execution, input sources incl. watch, destination understanding, 6-step UI,
  API, single-port); v0.5–v0.7 rows aligned.
- [x] `docs/ARCHITECTURE_PLAN.md` — aligned: §4 folder tree (rows/inspect/workflows/
  kmz/mappings + serve-from-web note), §11 live-v0.4 API note, §15 roadmap (v0.4 ✅),
  §16 MVP "shipped in v0.4"; §6/§7/§8/§9/§18/§19 already aligned.
- [x] `docs/DECISIONS.md` — added **D18–D24** (engine/Excel-one-adapter, Jobs=system
  history, Basic/Professional=views not products, desktop-first/local-first, workflow
  logic never depends on UI, plugins, workspaces); D11–D17 already present.
- [x] `docs/PLAN.md` — header note now points to STATUS.md too.
- [x] `docs/ARCHITECTURE.md` — single-port diagram (`apps/web ←REST+SSE→ apps/api`
  served from :3000), module table updated, new §5 Watch mode section, folder
  listing; stale references removed.
- [x] `docs/STANDARD_JSON.md` — already reframed as canonical record contract; no
  change needed.
- [x] `docs/DATA_MODEL.md` — Job record fields updated (`workflowType` examples,
  `workflowId`, draft/output object rows), workspace reservations noted, draft/output
  paths (`output/jobs/job-<id>/`).
- [x] `docs/OPERATIONS.md` — watch rewritten to user-controlled WatchService +
  API/SSE events; outputs table (filled/jobs/workflows/mappings); API list expanded.
- [x] `README.md` — STATUS link + docs-table row, capabilities reframe (workflows/
  jobs, destination understanding, single-port, user-controlled watch), full
  job-based API table.

### Part 2 — Professional mode & workflow building blocks (ROADMAP v0.5) ⏳
- [ ] Professional mode unlocks: AI provider config, prompt configuration,
  workflow settings, column mapping editor, JSON inspection, dry run, developer
  logs, job history, diagnostics (collapsible panels).
- [ ] AI configuration (real): provider/model/key/temperature/max tokens/prompt
  templates; test connection; estimated cost & time.
- [ ] Excel template manager: upload workbook, sheet preview, mapping editor
  (rename/ignore/add columns), validation rules, version history.
- [ ] Workflow builder: reusable workflows (input + AI config + template +
  mapping + output); save/duplicate/export/import/run.
- [ ] Watch jobs as managed items: folder/single-file watches, debounce,
  run-on-startup, per-watcher history/status.
- [ ] Persisted job history: date, file, duration, success, download result,
  re-run.
- [ ] Professional log viewer: persisted logs + SSE, level filters, search, export.
- [ ] Plugin contracts solidified: built-in adapters declared as the first
  plugin-shaped implementations (input `read`, output
  `inspect/draft/preview/apply`, AI `extract`).

### Part 3 — A second workflow / adapter (ROADMAP v0.6) ⏳
- [ ] Ship a second, non-Excel destination workflow (CSV → Cleaning → Database or
  PDF → OCR → Database) as a **plugin pair** (input + output), proving the plugin
  mechanism end-to-end.
- [ ] Ecosystem apps (Importer, CRM, public site) reusing `@terraflow/engine`.

### Part 4 — Hardening & embedding (ROADMAP v0.7 → 1.0) ⏳
- [ ] Engine as embeddable module: stable `runPipeline({ job })` contract,
  documented event schema, workflow logic UI-independent.
- [ ] Versioned REST API + API docs; UI is a thin adapter.
- [ ] **Workspaces**: Projects / Workflows / Templates / Jobs / Settings per
  workspace; `workspaceId` reserved in schema now; backup/restore; switching.
- [ ] **Plugin system**: registry + manifest + discovery for input / output / AI /
  workflow plugins; local plugin directory; Professional UI lists plugins.
- [ ] Local-first account scaffold ("Continue as Local User"); offline-ready.
- [ ] Migrations tooling (`node-pg-migrate`), backups, Docker Compose for the
  whole stack (db + api + web).
- [ ] v1.0 = polished, production-ready, sellable engine with KMZ→AI→Excel shipped.

---

## 2. Done log (chronological)

| Date | What | Files | Commit |
|---|---|---|---|
| 2026-08-04 | Part 1 loop: input-driven `runPipeline({ job })`, Job store, draft/apply, job-based API, real Basic 6-step wizard, real Jobs page, rows/inspect refactor, WatchService | engine `jobs/draft/stages/orchestrator/extractor/watch`, excel `rows/inspect/fill`, `apps/api/server.js`, `apps/web/*` | `8bf0031` (pushed) |
| 2026-08-04 | Fixed "nothing changed in the software": replaced stale `apps/api/public` with fresh web build; API serving new UI on :3000 | `apps/api/public/*` | — |
| 2026-08-04 | Single-port model (:3000 only) + multi-workflow: workflow store, API routes, Workflows page, `build:web` script, OPERATIONS update | `engine/workflows.js`, `jobs.js`, `server.js`, `Workflows.jsx`, `api.js`, `package.json`, `docs/OPERATIONS.md` | `473cf3e` |
| 2026-08-04 | BOM corruption (PowerShell `Set-Content -Encoding UTF8`) diagnosed + repaired; stale `running` jobs reset to failed | `output/jobs/*.json` (via Node) | — |
| 2026-08-04 | Created this master tracker + README status link | `docs/STATUS.md`, `README.md` | `473cf3e` |
| 2026-08-04 | **Watch mode done (1.3)**: `createWatchService` start/stop/close + `autoStart`; `POST /api/watch/start|stop` + `watch:state` SSE; wizard "Watch folder" input (Standby/Watching badge, start/stop, debounce) | `engine/watch.js`, `server.js`, `api.js`, `ImportWizard.jsx` | `473cf3e` |
| 2026-08-04 | **Mapping validation + profiles done (1.4)**: `validateMapping` (ok/missing/duplicate-column/mismatch/duplicate-header + autoCreate), `ensureHeaders` auto-create threaded through draft/apply, `saveMappingProfile`/`getMappingProfile` (`output/mappings/`), `POST /api/excel/mapping/profile`, validation UI + save-profile in wizard | `excel/inspect.js`, `fill.js`, `engine/draft.js`, `config.js`, `index.js`, `server.js`, `api.js`, `ImportWizard.jsx` | `473cf3e` |
| 2026-08-04 | **Docs-alignment pass done (1.9)**: VISION, ROADMAP, ARCHITECTURE_PLAN, DECISIONS (D18–D24), PLAN, ARCHITECTURE, STANDARD_JSON (no-op), DATA_MODEL, OPERATIONS, README aligned to the v0.4 workflow-engine reality | `docs/*.md`, `README.md` | `25d557e` |
| 2026-08-04 | **Bugfix: black screen after "Continue" (upload → Excel destination)**: `ImportWizard.jsx` used `<Field>` without importing it → `ReferenceError` the moment `inspect` data rendered; added `Field` to the ui import. Rebuilt web → new bundle served on :3000; verified only :3000 listening (no Vite/5173) | `apps/web/src/pages/ImportWizard.jsx` | — (uncommitted) |

## 3. In progress (current)

- **Commit + push the docs-alignment wave** (1.9): stage, commit, push to `origin main`.
- **Next:** Part 2 — Professional mode (v0.5).

## 4. Not started / next up (backlog order)

1. Part 2 — Professional mode (v0.5): AI config, Excel template manager,
   workflow builder, watch jobs as managed items, persisted history, log viewer,
   plugin contracts solidified.
2. Part 3 — second workflow / plugin pair (v0.6).
3. Part 4 — hardening & embedding (v0.7→1.0).

## 5. Runtime & environment notes

- **Single-port model:** `npm.cmd run build:web` (build web + copy to
  `apps/api/public`) then `npm.cmd run api` → everything on
  `http://localhost:3000`. Vite dev (5173) is optional, API must be running.
- **⚠️ PowerShell `Set-Content -Encoding UTF8` writes a UTF-8 BOM** which breaks
  the engine's `JSON.parse` on `output/jobs/*.json` **silently** (store resets to
  empty). Only write/repair those JSON files via Node
  (`fs.writeFileSync(path, str, 'utf8')`); strip BOM if
  `raw.charCodeAt(0) === 0xfeff`.
- **npm** must be invoked as `npm.cmd` (PowerShell policy blocks `npm.ps1`).
- **git** needs `$env:PATH += ";C:\Program Files\Git\cmd"` first.
- Real template: `C:\Users\USER\Desktop\CRM_GPT_Immobilier_Employees_V8_10_2_2.xlsx`
  (sheet `العقارات`, header row 3: A معرف العقار … N تاريخ البيع).
- Source dir: `C:\Users\USER\Documents\MEGA UPLOAD\GOOGLE EARTH` (146 `.kmz`);
  smoke test used smallest `156م.kmz` (868 B).
- Test: `$env:EXCEL_TEMPLATE=...; node --test "packages/excel/test/*.test.js"` → 13/13.
- Live state: jobs #1–7 (`nextId: 8`) — #3 + #7 completed (smoke runs), rest
  failed; workflow #1 "Smoke test flow"; mapping profile saved for the template.
  API runs on :3000, watch is user-controlled (start/stop via UI).

*Companion docs: [README](../README.md) · [ROADMAP.md](ROADMAP.md) ·
[VISION.md](VISION.md) · [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) ·
[PLAN.md](PLAN.md) (historical Phase-1) · [DECISIONS.md](DECISIONS.md) ·
[DATA_MODEL.md](DATA_MODEL.md) · [STANDARD_JSON.md](STANDARD_JSON.md) ·
[ARCHITECTURE.md](ARCHITECTURE.md) · [OPERATIONS.md](OPERATIONS.md)*
