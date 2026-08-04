# TerraFlow Engine — Roadmap

> Companion to [VISION.md](VISION.md) and [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md).
> This file tracks the **versioned execution plan** (0.1 → 1.0). Status reflects
> what is done in the repo today.

Legend: ✅ done · 🔄 in progress · ⏳ planned

**North star:** TerraFlow Engine is an intelligent **workflow engine**, not an
Excel tool. Excel is one output adapter. The MVP ships one polished workflow —
KMZ → AI → Excel — with a universal **Job** model and **safe execution**
(draft → preview → review → apply). Later workflows (PDF → OCR → Database,
CSV → Cleaning → CRM, Images → AI → Metadata, API → Transformation → Database)
are new workflow definitions, not new products.

---

## v0.1 — Foundation (monorepo) ✅

- npm workspaces monorepo: `packages/*` + `apps/*`.
- Packages: `@terraflow/shared`, `@terraflow/ai`, `@terraflow/excel`,
  `@terraflow/database`, `@terraflow/engine`.
- First workflow extracted **unchanged** into the engine package (no business
  logic changes): extract → AI enrich → DB sync → Excel fill (+ in-place fill).
- All legacy scripts (`src/scripts/*`, `src/lib/*`) deleted; CLI restored via
  `node packages/engine/src/cli.js <cmd>`.
- Excel fill made robust against shared-formula masters in the template's
  `تطابق` column (clones promoted before clearing, see DECISIONS.md D8).
- Docker Compose schema mount moved under `packages/database/schema.sql`.

## v0.2 — Engine orchestration ✅

- `runPipeline()` in `@terraflow/engine` with structured events:
  `stage:start`, `stage:progress`, `stage:end`, `stage:error`, `log`,
  `pipeline:complete`, `pipeline:error`.
- Engine is UI-agnostic and callable programmatically (not just via CLI).
- `createProvider()` AI factory; Groq adapter implements `AIProvider` interface.

## v0.3 — REST API ✅

- `apps/api` (Express) serving `http://localhost:3000`.
- Endpoints:
  - `GET /api/health` — liveness + DB check.
  - `GET /api/config` — non-secret runtime config.
  - `GET /api/status` — current / last pipeline job state.
  - `POST /api/pipeline` — trigger `extract → ai → db → fill` (202, 409 if running).
  - `GET /api/pipeline/events` — SSE stream (replays history, then live).
  - `GET /api/properties` — property catalog from PostgreSQL.
- Verified end-to-end: full pipeline via API in ~3 s (AI stage resumes from cache).

## v0.4 — Workflow MVP: the safe import loop 🔄 (in progress)

> Scope redefined from the earlier "importer UI" plan to the product decision:
> TerraFlow Engine is a workflow engine; the frontend is the Basic-mode face of
> the MVP workflow.

**Workflow & Job model**
- Workflow becomes the core abstraction: a workflow is `input source → steps →
  destination`. The KMZ → AI → Excel workflow is the first definition.
- Universal **Job** record: id, start / finish time, duration, status, workflow
  type, processed files, created / updated / skipped records, warnings, errors,
  execution logs. Jobs persist and become the system history.

**Safe execution model**
- `Run Workflow → Generate Draft → Preview Changes → User Review → Apply → Update
  Destination`. The destination is **never** modified before the user reviews.
- Draft preview visually distinguishes: new rows, modified rows, skipped rows,
  warnings, AI uncertainties.

**Input sources**
- Single KMZ file, whole folder, and **watch mode** (watch a folder or a single
  file → auto-run the workflow on change; visible "Watching…" state, start/stop).
- Browser pickers (file + folder) for one-shot imports; server-side watch for
  automation.

**Destination understanding**
- `inspectExcel`: detect sheets, headers, sample rows, the data sheet, and how
  AI fields map to columns; auto-suggest a mapping; validate (missing / duplicate
  columns); support creating missing columns automatically. Mapping profiles are
  saved with the template.

**UI — Basic mode (6 visible steps)**
1. Choose input (KMZ file / folder / watch)
2. Choose Excel template
3. Run workflow
4. Progress
5. Review results (draft preview in-app)
6. Apply changes (download / write destination)

Everything else — provider, AI settings, advanced mapping, developer options,
logs, debug — stays hidden in Basic mode and unlocks in v0.5 (Professional mode).

**API**
- Job-based endpoints (upload, inspect-excel, mapping, run-with-mapping, draft
  preview, apply, watch start/stop/status, download). SSE extended to watch events.

## v0.5 — Professional mode & workflow building blocks ⏳

- **Professional mode unlocks:** AI provider, prompt configuration, workflow
  settings, column mapping, JSON inspection, dry run, developer logs, job
  history, advanced diagnostics. All collapsible panels.
- **AI configuration** (real, applied): provider / model / API key / temperature /
  max tokens / prompt templates; test connection; estimated cost & time.
- **Excel template manager**: upload workbook, sheet preview, mapping editor
  (rename / ignore / add columns), validation rules, version history.
- **Workflow builder**: reusable workflows (input source + AI config + template +
  mapping + output); save / duplicate / export / import / run.
- **Watch jobs as managed items**: folder / single-file watches, debounce,
  run-on-startup, per-watcher run history and status.
- **Persisted job history**: date, file, duration, success, download result,
  re-run.
- **Professional log viewer**: persisted logs + SSE stream, level filters,
  search, export.
- **Plugin contracts solidified**: the built-in adapters are declared as the
  first plugin-shaped implementations (input `read`, output
  `inspect/draft/preview/apply`, AI `extract`) so v0.6's plugin pair has a
  stable contract to ship against.

## v0.6 — A second workflow / adapter ⏳

- Ship a second, non-Excel destination workflow to prove Excel is one adapter,
  not the product (e.g. CSV → Cleaning → Database, or PDF → OCR → Database).
  It ships as a **plugin pair** (input plugin + output plugin), proving the
  plugin mechanism end-to-end. Reuses the same Job model, draft/preview/apply
  flow and engine.
- Ecosystem apps (Importer, CRM, public site) that all reuse `@terraflow/engine`
  and the `@terraflow/*` packages.

## v0.7 → v1.0 — Hardening & embedding ⏳

- **Engine as an embeddable module**: stable, input-parameter-driven
  `runPipeline({ job })` contract; documented event schema; workflow logic never
  depends on the UI.
- **Versioned REST API + API docs**; the UI is a thin adapter so TerraFlow
  ecosystem products (CRM, Cloud) can reuse the engine or the API.
- **Workspaces**: Projects / Workflows / Templates / Jobs / Settings stored
  locally per workspace; **backup/restore**; workspace switching (single default
  workspace before this).
- **Plugin system**: registry + manifest + discovery for input / output / AI /
  workflow plugins; local plugin directory; Professional UI lists installed
  plugins.
- **Local-first account scaffold**: "Continue as Local User"; offline-ready data
  model; no real auth/cloud yet.
- Migrations tooling (`node-pg-migrate`), backups, Docker Compose for the whole
  stack (db + api + web).
- v1.0 = a polished, production-ready, sellable workflow engine with the
  KMZ → AI → Excel workflow fully shipped.

---

*Next: [DECISIONS.md](DECISIONS.md) · [VISION.md](VISION.md) · [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md)*
