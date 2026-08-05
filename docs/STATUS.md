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
  - [x] Persisted settings store + `GET|PUT /api/settings/ai` + `POST /api/settings/ai/test`
    + AIConfig panel (Groq **free-tier models only**).
  - [ ] Estimated cost & time per run (cosmetic estimate, not critical).
- [ ] Excel template manager: upload workbook, sheet preview, mapping editor
  (rename/ignore/add columns), validation rules, version history.
  - [x] Store + versioning + API (`GET|POST /api/templates`, `GET|PUT|DELETE /api/templates/:id`,
    `POST /api/templates/:id/map`, version download) + manager UI.
  - [ ] Sheet preview rendered from the stored workbook (headers preview is done via map).
- [x] Workflow builder: reusable workflows (input + AI config + template +
  mapping + output); save/duplicate/export/import/run.
  - [x] Richer workflow definition: `input` (sourceDir), `templateId`, `ai`
    (model/temperature) override persisted per workflow; `runPipeline` merges
    per-job `destination` + `ai` over `loadConfig`.
  - [x] `duplicateWorkflow`/`exportWorkflow`/`importWorkflow` + API
    `POST /api/workflows/:id/duplicate`, `GET /api/workflows/:id/export`,
    `POST /api/workflows/import`; run resolves `templatePath` via
    `activeTemplatePath(workflow.templateId)`.
  - [x] Workflows UI: input folder + template dropdown + free-tier AI model +
    temperature in the create form, per-card Run/Duplicate/Export/Jobs, Import
    button, rename-in-place, run badge.
- [x] Watch jobs as managed items: folder/single-file watches, debounce,
  run-on-startup, per-watcher history/status.
  - [x] Persisted Watcher store `output/jobs/watchers.json`
    (`createWatcher`/`updateWatcher`/`deleteWatcher`/`pushWatcherHistory`,
    history capped at 20) + `createWatcherManager` (one debounced watch service
    per watcher, per-watcher run-on-startup boot, pending re-sync while busy).
  - [x] Watcher workflow settings: own stages, AI override, auto-apply, and a
    destination workbook (registered template's active version **or** an
    explicit file path, copy vs modify-original); `sync` builds the job with
    `destination` (`templatePath` via `activeTemplatePath`, or `originalPath`)
    + `ai`, merged per-job by `runPipeline`; history records status/records on
    job end (`JobService.run` returns the settled promise).
  - [x] API: `GET|POST /api/watchers`, `GET|PUT|DELETE /api/watchers/:id`,
    `POST /api/watchers/:id/start|stop|sync|history/clear`; legacy `/api/watch*`
    kept. Local path browser `GET /api/fs/roots` + `GET /api/fs/list`.
  - [x] Watchers page (PRO): create/edit form with **folder/file picker**
    (server-side explorer modal), stages editor, destination selector
    (template or explicit file + browse, copy/original), AI override; per-card
    Start/Stop/Sync now/Edit/Delete, run history table + clear.
  - [x] Import wizard "Watch folder" (step 1) linked to managed watchers:
    watcher picker + "Choose folder…" (creates/updates + starts a watcher) +
    collapsible watch-workflow editor (stages, copy/original, template or
    explicit file via browse, Save/Load) + "Manage watchers" link.
- [x] Persisted job history: date, file, duration, success, download result,
  re-run.
- [x] Professional log viewer: persisted logs + SSE, level filters, search, export.
- [x] Plugin contracts solidified: built-in adapters declared as the first
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
| 2026-08-04 | **Bugfix: black screen after "Continue" (upload → Excel destination)**: `ImportWizard.jsx` used `<Field>` without importing it → `ReferenceError` the moment `inspect` data rendered; added `Field` to the ui import. Rebuilt web → new bundle served on :3000; verified only :3000 listening (no Vite/5173) | `apps/web/src/pages/ImportWizard.jsx` | `43c7eba` |
| 2026-08-04 | **Reliability fixes**: (a) job cancellation — `AbortController` per running job, `abortableSleep`/`throwIfAborted` in `packages/shared`, signal threaded through `runPipeline` → stages → `provider.enrich`; `POST /api/jobs/:id/cancel` + `job:canceled` SSE + Cancel buttons (Jobs page + wizard progress); (b) Groq 429 — respect `Retry-After`, backoff capped 120s, retries=8 (verified: job #13 waited out the rate limit and completed instead of failing); (c) boot recovery — leftover `running` jobs marked `failed` + their workflow `failed` (verified job #11 → failed, wf #1 → failed). Live tests: job #12 canceled mid-AI; full smoke job #13 upload→complete→draft→apply→file OK; 13/13 tests | `shared/async.js`, `ai/groq.js`, `provider.js`, `engine/orchestrator.js`, `stages.js`, `api/server.js`, `web/api.js`, `Jobs.jsx`, `ImportWizard.jsx` | `254a9d2` |
| 2026-08-04 | **AI configuration (real) — Part 2 item 2**: persisted settings store `output/settings/ai.json` (`loadAiConfig`/`loadAiSettings`/`saveAiSettings` — saved settings override env, applied live by `loadConfig` each job); `GET|PUT /api/settings/ai` (key masked to hint, never returned; **Groq free-tier model allow-list** `GROQ_FREE_MODELS` enforced on save) + `POST /api/settings/ai/test` (connection probe → latency/model); AIConfig page rewritten as a real panel (free-tier model dropdown, key, baseUrl, temperature, maxTokens, pacing budget, custom system prompt, Save + Test); Professional mode toggle persisted; PRO nav tags; StatusBar corrected to `v0.5 · localhost:3000`. Verified live: save round-trip, `gpt-4o` rejected (400), test connection OK 498 ms, `/api/config` picks up saved model | `engine/config.js`, `ai/groq.js`, `ai/index.js`, `provider.js`, `api/server.js`, `web/api.js`, `pages/AIConfig.jsx`, `components/Layout.jsx`, `App.jsx`, `styles.css`, docs | `f6cbe4b` |
| 2026-08-04 | **Excel template manager (real) — Part 2 item 3**: engine template store `output/templates/<id>/v<N>/` + `index.json` (`registerTemplate` auto-inspects → sheets/start row/headers; `updateTemplate`/`deleteTemplate`/`templateVersionPath`/`activeTemplatePath`); `GET|POST /api/templates`, `GET|PUT|DELETE /api/templates/:id`, `POST /api/templates/:id/map` (reuses `buildMapping`), `GET /api/templates/:id/versions/:v/download`; ExcelTemplates page rewritten (upload workbook, per-template new version, mapping editor with include/remap + validation + autoCreate, download copy, delete, version history). Verified live with the real workbook: register → sheet `العقارات`/startRow 174/14 headers; map → 14 columns valid; save mapping; v2 versioning (mapping kept); download 200 / missing-version 404; delete | `engine/templates.js`, `api/server.js`, `web/api.js`, `pages/ExcelTemplates.jsx`, `styles.css` | `206fde1` |
| 2026-08-04 | **Workflow builder (real) — Part 2 item 4**: richer workflow definition — `createWorkflow`/`updateWorkflow` accept `input` (sourceDir), `templateId`, `ai` (model/temperature) override; `runPipeline` merges per-job `destination` + `ai` over `loadConfig`; new `duplicateWorkflow`/`exportWorkflow`/`importWorkflow` + API `POST /api/workflows/:id/duplicate`, `GET /api/workflows/:id/export` (JSON attachment), `POST /api/workflows/import`; `POST /api/workflows/:id/run` resolves the workbook via `activeTemplatePath(workflow.templateId)` (400 if the template is missing) and threads `templateId`/`ai`/`input` into the job. Workflows UI rewritten: create form with input folder + template dropdown + free-tier AI model + temperature, per-card Run/Duplicate/Export/Jobs, head Import button, rename-in-place, run badge. Verified live: create → duplicate → export → import round-trip; run created job #15 with template path + AI override + input, completed (151 records); docs updated | `engine/workflows.js`, `jobs.js`, `orchestrator.js`, `index.js`, `api/server.js`, `web/api.js`, `pages/Workflows.jsx` | `d248222` |
| 2026-08-05 | **Managed watchers (real) — Part 2 item 5**: persisted Watcher store (`output/jobs/watchers.json`) + `createWatcherManager` (folder **or single-file** watch, debounce, run-on-startup boot, pending re-sync, per-watcher history); watcher workflow settings (own stages, AI override, destination workbook = template active version or explicit file path, copy vs modify-original) — `sync` builds the job with `destination.templatePath`/`originalPath` + `ai`, merged per-job in `runPipeline` (added `originalPath` merge); `JobService.run` now returns the settled promise so history records the real end status; API `GET|POST /api/watchers`, `GET|PUT|DELETE /api/watchers/:id`, `POST /api/watchers/:id/start|stop|sync|history/clear` (legacy `/api/watch*` kept) + local path browser `GET /api/fs/roots|/api/fs/list`; Watchers PRO page (create/edit form with folder/file picker modal, stages editor, destination selector, AI override, Start/Stop/Sync now, history table + clear). Verified live: fs roots/list, create→start→sync→history (`completed`, records), PUT update, destination templatePath + originalPath carried into jobs, clear, delete. (Debug fix: `run()` was missing `return` before the pipeline promise chain — `await service.run` resolved `undefined` and history logged `failed` even though jobs completed.) | `engine/watchers.js`, `watch.js`, `jobs.js`, `orchestrator.js`, `index.js`, `api/server.js`, `web/api.js`, `pages/Watchers.jsx`, `components/PathBrowser.jsx`, `App.jsx`, `Layout.jsx`, `styles.css` | `5530673` |
| 2026-08-05 | **Import wizard watch-mode wired to managed watchers (fix + finish of item 5)**: replaced legacy `/api/watch*` calls in the wizard with managed `getWatchers`/`createWatcher`/`updateWatcher`/`startWatcher`/`stopWatcher` + `getTemplates`; "Choose folder…" opens the PathBrowser and creates/updates a watcher (named after the folder, `autoApply:true`) then starts it; watch picker dropdown defaults to the first watcher (poll 4s); collapsible watch-workflow editor (stage checkboxes, copy/original mode, template select or explicit destination file via browse, Save watch workflow / Load current); "Manage watchers" link → `/watchers`; PathBrowser modal mounted in the wizard. Bugfix: `Pencil2` was used but never imported → `ReferenceError` crashed the component on entering Watch mode (mode switch appeared broken). Verified live: switch to Watch mode renders; picker creates+starts watcher; workflow save/load round-trips. | `pages/ImportWizard.jsx` | `fbfd5e6` |
| 2026-08-05 | **Wizard "Create watch workflow…" (dashboard = new workflows)**: picking a folder in the wizard now creates a **new** watcher workflow (draft, named after the folder) instead of reusing/auto-starting the selected one — the dashboard flow is for creating new workflows; the user configures stages/destination then explicitly clicks Start watching. New workflow's settings auto-load into the workflow editor. | `pages/ImportWizard.jsx` | `8c15f5b` |
| 2026-08-05 | **Watch workflow destination required + always visible**: creating a watcher now needs a destination — a registered template or an explicit .xlsx ("choose the destination or create a new file"); guards in the wizard (`saveWatchWorkflow`) and the Watchers page (`save`) block saving a watcher with no `templateId` and no `targetPath`. Destination/workflow editor moved **out of the collapsed `<details>`** — it now renders always-visible in the watch card ("Destination & workflow": Create new file / Modify existing file segmented, required template dropdown, explicit file path + Browse, stages checkboxes, Save watch workflow); amber notice prompts for a destination, and **Start watching is disabled until a destination is set**. Mode labels clarified ("Create new file"/"Modify existing file"); template dropdown reads "— choose a template (required) —". | `pages/ImportWizard.jsx`, `pages/Watchers.jsx` | `1ae4103` |
| 2026-08-05 | **Dashboard surfaces watch workflows (clickable)**: new "Watch workflows" card lists every watcher (name, status badge Watching/Stopped/Off, folder path, stages + destination summary) — clicking a row navigates to `/watchers` with `state.editWatcherId`, and the Watchers page auto-opens that watcher's edit modal (deep link). "Recent activity" row is now clickable → `/jobs`; Quick actions gained "Watch a folder" → `/watchers` and "Manage workflows" → `/workflows`. Empty state offers "New watch workflow". | `pages/Dashboard.jsx`, `pages/Watchers.jsx` | `850785c` |
| 2026-08-05 | **Hero shows watch workflows + "Start new workflow"**: the hero section now lists the watch workflows as clickable cards (name, Watching/Stopped badge, folder, stages/destination) — click opens that watcher's editor — plus a "Manage all →" link; new "Start new workflow" hero button goes to `/watchers` with `state.createNew`, which auto-opens the create form. Added `.hero-workflows`/`.hero-wf` CSS. | `pages/Dashboard.jsx`, `pages/Watchers.jsx`, `styles.css` | (this commit) |
| 2026-08-05 | **Workflow-first reframe — the UI now treats workflows as the unit of work (Part 2, item 5 extension)**: new unified catalog `GET /api/workflows/all` merges one-shot imports + managed watch workflows, type-tagged (`import`/`watch`) and sorted by last activity; `web/api.js` gains `getAllWorkflows`. Dashboard hero rewritten ("Your workflows, one dashboard.") — "Start a new workflow" opens the new **NewWorkflowChooser** modal (Import workflow → `/import`, Watch workflow → `/watchers?createNew`); hero + Workflows card list **all** workflows with type/status badges and "Manage →" affordances; when a run is active a "Running now: \<workflow\> — stage X" banner identifies the exact running workflow (via `getJob(currentJobId)`) with an "Open run" button → `/jobs` (`.hero-running` + `.is-running` highlight CSS). **Workflows.jsx rewritten as the unified hub** (both types, per-type actions: watch → Start/Stop/Sync now/Edit/Delete, import → Run/Duplicate/Export/Delete, rename, JSON import/export, `usePoll(getAllWorkflows)`). **Jobs.jsx rewritten as "Run history"** — every run of any workflow, new clickable Workflow column (`flowLookup` for `import:<id>`/`watch:<id>`, "Open" links back to the right workflow) + Source column. **Layout nav reframed**: Workflows (now 2nd), Import workflow, Watch workflows (PRO). ImportWizard page title "Import workflow"; its watch pane reads as creating a watch workflow ("Manage workflows" link → `/workflows`, "Each watcher is a watch workflow…"). Watchers deep-link state (`createNew`, `editWatcherId`). Verified live: `/api/workflows/all` merges a created import (`[import:6]`) and a created watcher (`[watch:3]`) with type tags; build `index-CPqwsItW.js` served on :3000. | `api/server.js`, `web/api.js`, `pages/Dashboard.jsx`, `pages/Workflows.jsx`, `pages/Jobs.jsx`, `pages/ImportWizard.jsx`, `pages/Watchers.jsx`, `components/Layout.jsx`, `components/NewWorkflowChooser.jsx`, `styles.css`, docs | `d49d1b2` (pushed) |
| 2026-08-05 | **Watch sync now actually updates the Excel (add / update / remove)**: the watched-folder loop was broken end-to-end — every change re-ran the WHOLE folder through AI (job #28 stuck 15 min) then wrote rows append-only, and watcher #4's destination pointed at a garbage `~$` lock-file path. Fixes: (a) **incremental per-watcher AI cache + row state** in `output/watches/<id>/` — `watch.js` `sync()` now attaches `job.watch {dir, aiPath, excelStatePath}`; `orchestrator.buildContext` routes watch jobs to those persistent paths; `aiStage` resumes from cache so a new file only AIs itself (job #29: 151 cached → 5.8s vs 15 min); (b) **reconciliation fill** — `rows.computeInPlaceSyncRows` (update rows in place by `sourceFile@placemarkIndex`, splice rows whose KMZ vanished, fingerprint-adopt previously-written rows so the first sync doesn't duplicate, fresh ids for new files) + `fill.fillInPlaceSync` (`writeSyncRows` keeps existing id/added-date on updates; persisted `excel-state.json`); (c) **destination correctness** — `buildDestination` for `original` mode now resolves `targetPath` → `originalPath` (was setting `templatePath`), `runPipeline` already merged `destination.originalPath`; `sync()` fails fast with a history entry if the workbook file is missing; (d) **guards** — API `validateWatcherDestination` rejects missing files and Office `~$` lock/temp paths on create/update, `/api/fs/list` filters `~$*` so the browser never offers lock files; (e) **crash fix** — deleting rows via `spliceRows` broke shared formulas on save ("Shared Formula master must exist above and or left of clone for cell M302"); `fill.js` now `unshareSharedFormulas()` before splicing, writes via temp file + atomic rename (never leaves a 0-byte workbook), and backups are timestamped (`*_before_fill_<ts>.xlsx`). Verified live on watcher #4 ("Watch GOOGLE EARTH", 150 KMZ → `CRM_GPT_Immobilier_Employees_V8_10_2_2.xlsx`): full rebuild `Added 81, updated 70` (job 34), **remove** on deleting `test.kmz` → `removed 1` row, sheet re-saved clean (job 35), **add** on re-adding → `added 1` (job 37), repeated syncs idempotent (`added 0`), and the running watcher auto-synced on the file add (`pending change`) and remove (`remove: test.kmz`) events; workbook valid (318 KB), state `output/watches/4/excel-state.json` 151 entries → 151 unique rows. 18/18 excel tests pass. (Also restored the workbook after an external process truncated it to 0 bytes — recovered from the pristine `1785780680636_…xlsx` copy.) | `excel/rows.js`, `excel/fill.js`, `engine/stages.js`, `engine/orchestrator.js`, `engine/watch.js`, `engine/index.js`, `api/server.js`, `excel/test/rows.test.js`, docs | (this commit) |
| 2026-08-05 | **RTL + identity-safe writes (follow-up hardening of item 5)**: (a) **sheet views preserved on sync** — `fill.fillInPlaceSync` now snapshots `ws.views` before splicing/writing and restores them afterwards, so the Arabic workbook keeps its RTL direction, freeze panes and panes on every watch sync (verified `rightToLeft="1"` in the raw XML of all 6 sheets + `fullCalcOnLoad` so stale cached formulas recalc on open); (b) **write-in-place instead of rename** — sync no longer writes to a `.sync.tmp` then `renameSync` over the original (a rename changes the file's identity, trips OneDrive/Excel deny-locks and can `EPERM` on an open workbook); ExcelJS now streams straight to the original path so the file stays put; (c) **dry-run preview** — `fillInPlaceSync` gained a `dryRun` param and a `previewInPlaceSync` helper that computes exactly what a sync would add/update/remove (with deletions) without touching the workbook or the state file, ready to back an approval gate. 18/18 tests pass. | `packages/excel/src/fill.js` | (this commit) |
| 2026-08-05 | **Telegram bridge + task reports with decision buttons (v0.5.8)**: `scripts/telegram-bridge.mjs` — long-polls `getUpdates` (`message` + `callback_query`), answers callback queries, appends every inbound message/button-press to `output/telegram/inbox.jsonl`, exports `sendTelegram` (silent, keyboard), `decisionKeyboard()` (اكمل / انتظر / اقتراح تعديل), `startBridge()` (auto-started with the API server when `TELEGRAM_BOT_TOKEN` set in `.env`); JobService `finish()` pushes a ✅/❌/⏹ job-done notification to Telegram (best-effort, non-blocking). `scripts/telegram-ask.mjs` — sends a task report with the 3 buttons and blocks up to `--timeout` (default 60s) for the decision, printing `DECISION=continue|wait|modify|timeout` (+ `MODIFICATION=<text>`); on `modify` it re-prompts and collects the typed change. Verified end-to-end: report delivered (msg 266), all 3 buttons registered as callbacks, `wait` honored. `.env` holds `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (gitignored). | `scripts/telegram-bridge.mjs`, `scripts/telegram-ask.mjs`, `apps/api/src/server.js`, `.env` | `v0.5.8` (this commit) |
| 2026-08-05 | **Plugin contracts solidified — Part 2 item (v0.5.9)**: built-in adapters declared as the first plugin-shaped implementations. `packages/engine/src/plugins.js` — `PLUGIN_TYPES` + `CONTRACTS` (input `read`, output `inspect/draft/preview/apply`, ai `extract`), `validateManifest`/`validatePlugin` (fails loudly at load), built-in factories `createInputPlugin` (KMZ → `read` → `{records,removed,failures}`), `createOutputPlugin` (Excel → `inspect`/`draft`/`preview`/`apply` covering copy, original-with-backup and watch-sync reconcile modes), `createAiPlugin` (Groq → `extract`/`test`/`pacingMs` over `createProvider`); registry `listPlugins` (declarative audit manifests), `resolvePlugin(type,id,{config})`, `createBuiltinPlugins`. Exported from `@terraflow/engine`; `GET /api/plugins` audit list in the API. Verified: engine smoke test — all contracts resolve + real-workbook inspect/draft/preview (14 headers / 14-col mapping / validation / rows), unknown plugin throws, bad manifest rejected; 18/18 excel tests pass. v0.6 ships the second workflow as a real plugin pair against these contracts. | `engine/plugins.js`, `engine/index.js`, `api/server.js`, docs | `v0.5.9` (this commit) |

## 3. In progress (current)

- **Watch sync = real add/update/remove against the folder (Part 2 item 5, shipped)**: watch
  mode now keeps the destination workbook mirrored to the watched folder — each sync
  re-uses a persistent AI cache (`output/watches/<id>/ai.json`) and a persisted
  row map (`excel-state.json`), updates changed rows in place, appends new ones and
  splices out rows whose KMZ was deleted; the watcher auto-syncs on folder changes.
  Writes preserve RTL/views and go straight to the original path (no rename). Committed.
- **Plugin contracts solidified (Part 2, shipped v0.5.9)**: built-in adapters declared as the
  first plugin-shaped implementations in `packages/engine/src/plugins.js` — input `read`,
  output `inspect/draft/preview/apply`, AI `extract` — with manifests + validation, a small
  registry (`listPlugins`/`resolvePlugin`/`createBuiltinPlugins`) and `GET /api/plugins`.
  Committed and tagged.
- **Next:** Part 2 — estimated cost & time per run, then sheet preview from stored workbook.

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
  (sheet `العقارات`, header row 3: A معرف العقار … N تاريخ البيع); pristine backup copy
  `1785780680636_CRM_GPT_Immobilier_Employees_V8_10_2_2.xlsx`.
- Source dir: `C:\Users\USER\Documents\MEGA UPLOAUD\GOOGLE EARTH` (150 `.kmz`, watched by
  watcher #4 "Watch GOOGLE EARTH"); sync writes into the Desktop workbook.
- Test: `$env:EXCEL_TEMPLATE=...; node --test "packages/excel/test/*.test.js"` → 18/18.
- Live state: watcher #4 destination `C:\Users\USER\Desktop\CRM_GPT_Immobilier_Employees_V8_10_2_2.xlsx`
  (mode `original`, steps `extract/ai/db/fill:original`, runOnStartup on); per-watcher sync
  state in `output/watches/4/` (`ai.json` cache + `excel-state.json` row map); jobs #28–#38
  (watch-syncs) — #34 rebuild, #35 remove, #37 add, #38 auto-sync verified.
- Earlier live state: jobs #1–23 — #3, #7, #13, #15, #16–#23 completed; #12 canceled
  (live cancel test); #11 failed (boot recovery); workflows #1 "Smoke test flow" + #2
  "Listing import (test)"; watcher #1 "Source KMZ watch" (folder, extract+ai+db, copy →
  template t2); mapping profile saved for the template; template `t2` registered (14-col
  mapping). API runs on :3000, watch is user-controlled (start/stop via UI).
- **Groq free tier rate-limits:** during heavy runs the API returns 429; the AI
  stage now respects `Retry-After` and backs off (cap 120s, 8 retries) per record,
  so a run stays `running` longer instead of failing — a single record can wait
  a few minutes while the quota resets.
- **Cancel semantics:** `POST /api/jobs/:id/cancel` aborts a running/queued job →
  `status=canceled`, `error="Canceled by user"`; terminal jobs return 409. On
  server restart, leftover `running` jobs are marked `failed` (boot recovery).
- **⚠️ Watch-sync needs the destination workbook closed in Excel:** if the workbook is
  open in Excel when a sync tries to write it, the fill fails with `EBUSY`/`EPERM` (job #28's
  original failure). Keep `CRM_GPT_Immobilier_Employees_V8_10_2_2.xlsx` closed during
  watch syncs; failed syncs never corrupt the file anymore (write-in-place via ExcelJS,
  timestamped `output/backup/*_before_fill_<ts>.xlsx` backups before every sync,
  fail-fast destination check). Syncs preserve the workbook's RTL sheet views; a
  `previewInPlaceSync` dry-run exists to show add/update/remove before writing.

*Companion docs: [README](../README.md) · [ROADMAP.md](ROADMAP.md) ·
[VISION.md](VISION.md) · [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) ·
[PLAN.md](PLAN.md) (historical Phase-1) · [DECISIONS.md](DECISIONS.md) ·
[DATA_MODEL.md](DATA_MODEL.md) · [STANDARD_JSON.md](STANDARD_JSON.md) ·
[ARCHITECTURE.md](ARCHITECTURE.md) · [OPERATIONS.md](OPERATIONS.md)*
