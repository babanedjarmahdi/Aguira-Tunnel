# TerraFlow Engine — Architecture Plan

> **Role:** Senior Software Architect / Product Architect blueprint.
> **Status:** Planning document — describes *what* and *why*, not implementation code.
> **Scope:** The architecture of TerraFlow Engine as an **intelligent workflow
> engine** that will evolve over several years. The first workflow is KMZ → AI →
> Excel; the engine is destination-agnostic so future workflows (PDF → OCR →
> Database, CSV → Cleaning → CRM, Images → AI → Metadata, API → Transformation →
> Database) are definitions, not rewrites.

---

## 1. Product Vision

TerraFlow Engine is a **workflow engine for data transformation pipelines**.

It reads files, imports their data, **understands the destination** (today: an
Excel workbook), and fills that destination with the structured result — safely,
reviewably, and automatically. It is **not** an Excel tool and not a CRM.

Its goal is to:

- **Reduce cognitive load** — the user never has to re-type data or remember
  "which sheet had the price of that 900-million plot in صالوحة".
- **Eliminate repetitive work** — importing pins, extracting fields, re-typing
  data into reports.
- **Centralize information** — one canonical record store (plus the user's
  existing destination files) for properties, clients, documents, follow-ups.
- **Become the orchestration layer** of data movement — a component that larger
  products (TerraFlow CRM, TerraFlow Cloud, TerraFlow Studio) can embed.

Every feature must answer one question:

> **"Does this reduce mental effort or save time for the user?"**

If a feature does not, it does not ship.

---

## 2. Core Philosophy

1. **The workflow is the product.** A workflow is a pipeline:
   `input source → transform steps → destination`. The MVP workflow is
   KMZ → AI → Excel. Future workflows are new *definitions*, not new products.
2. **Excel is one destination, not the product.** Excel integration is an output
   *adapter*. The engine must stay destination-agnostic.
3. **We are NOT building a CRM first.** We are solving one painful workflow at a
   time. Relationship management emerges later and will reuse the same Job model
   and engine.
4. **Safe by default.** The engine never modifies a destination immediately:
   run → generate draft → preview → user review → apply.
5. **Every execution is a Job.** Jobs are the history of the system and are
   reusable across TerraFlow products.
6. **Standard JSON is the single source of truth.** Everything else (PostgreSQL,
   Excel export, REST API, future adapters) is derived from it.
7. **Two modes, one product.** Basic mode guides non-technical users; Professional
   mode unlocks configuration and diagnostics. A mode is a view, not a product.
8. **Desktop-first, local-first now; cloud later.** The MVP runs on the user's
   machine. Accounts, sync and multi-user are future ecosystem milestones.
9. **Plugins, not forks.** The long-term extension mechanism is a plugin system —
   new inputs, outputs, AI providers and whole workflows are plugins against
   stable contracts, never engine rewrites.
10. **Workspaces organize.** Projects, Workflows, Templates, Jobs and Settings
    belong to a workspace — the unit of organization and local-first persistence.
    Deferred in implementation, fixed in the vision.

---

## 3. System Architecture

Clean, modular architecture. Every module is independent with clear
responsibilities. **No monolithic business logic.**

```
                         ┌───────────────────────────────┐
                         │     TERRAFLOW ENGINE (app)      │
                         │  (apps/api  +  apps/web)        │
                         └──────────────┬────────────────┘
                                        │ REST + SSE (thin adapters)
                                        ▼
             ┌──────────────────────────────────────────┐
             │             WORKFLOW ENGINE               │
             │               @terraflow/engine           │
             │                                          │
             │  Workflow definitions  •  Job runner      │
             │  Steps (read→transform→write)             │
             │  Draft / preview / apply state machine    │
             │  Watch service (file/folder automation)   │
             │  Plugin registry (in/out/AI/workflow)     │
             │  Workspace context (projects, settings)   │
             └──────┬───────────┬───────────┬────────────┘
                    │           │           │
        ┌───────────▼──┐  ┌────▼────────┐  └───▼──────────────┐
        │ INPUT PLUGINS│  │ TRANSFORMS  │      │ OUTPUT PLUGINS │
        │ (adapters)   │  │            │      │ (adapters)      │
        │              │  │ AI provider │      │                │
        │ KMZ (unzip    │  │  plugins    │      │ Excel (copy-first)│
        │  → KML → parse)│  │ (Groq now,  │      │ Database (Postgres)│
        │ CSV    (future)│  │  any later) │      │ CRM      (future)  │
        │ PDF/OCR (future)│ │ cleaning/   │      │ Metadata (future)  │
        │ Images  (future)│ │ validation  │      │ API/webhook (fut.) │
        │ API/webhook (fut)│ │            │      │                  │
        └───────────┬──┘  └────┬────────┘      └───┬──────────────┘
                    │           │                  │
        ┌───────────▼───────────▼──────────────────▼──────────────┐
        │     CANONICAL RECORD JSON (single source of truth)        │
        │     versioned, validated, immutable per workflow          │
        └───────────────────────────────────────────────────────────┘
```

**Principles**

- **Backend and frontend are completely separated.** The workflow engine never
  depends on React; business logic never depends on the UI. The UI is a thin
  adapter over the API/SSE.
- **Workflow logic lives in the engine**, never in the API handlers or UI.
- Modules communicate through the canonical JSON and the Job model — never by
  reaching into each other's internals.
- The AI layer is **provider-independent** and replaceable.
- Excel is one **output adapter** — swapping or adding a destination does not
  change the engine core.
- **Today's adapters are the first plugins by contract.** The plugin registry and
  discovery are implemented later, but adapters already expose the plugin-shaped
  interfaces, so no rework is required.

---

## 4. Folder Structure

The current monorepo with clear seams:

```
CRM_PRO/
  package.json           # npm workspaces: packages/* + apps/*
  .env                   # git-ignored secrets & paths
  .env.example
  docker-compose.yml     # PostgreSQL 16

  packages/
    shared/              # pure domain logic, no I/O side effects
      normalize.js       #   Arabic text normalization
      price.js           #   DZD price conventions
      standard.js        #   canonical record JSON validation
    ai/                  # AI PROVIDER PLUGINS (provider-independent layer)
      provider.js        #   AIProvider interface
      groq.js            #   Groq implementation (today's plugin)
      index.js           #   createProvider() factory
    excel/               # Excel OUTPUT PLUGIN (one of several)
      mapping.js         #   field → column mapping
      inspect.js         #   sheet/header detection + mapping validation + mapping profiles (v0.4)
      rows.js            #   read/write rows against a mapped sheet                (v0.4)
      fill.js            #   copy + in-place fill (D7 clone promotion)
      price.js           #   price/location display formatters
    database/            # Database OUTPUT PLUGIN
      client.js          #   pg pool wrapper
      sync.js            #   upsert + prune
      schema.sql         #   bootstrap schema (properties, later jobs)
    engine/              # the WORKFLOW ENGINE (UI-agnostic)
      config.js          #   runtime config (env + workspace)
      events.js          #   structured event emitter
      stages.js          #   stage definitions (extract/ai/db/fill/...)
      orchestrator.js    #   runPipeline({ job })  (v0.4: input-driven)
      jobs.js            #   Job record + persistence            (v0.4)
      workflows.js       #   workflow definitions + persistence  (v0.4)
      draft.js           #   draft / preview / apply state machine (v0.4)
      watch.js           #   WatchService: start/stop/status     (v0.4)
      extractor.js       #   per-input processing orchestration
      kmz.js             #   KMZ input adapter (unzip → KML → parse → dedupe)
      plugins.js         #   plugin registry + contracts         (v0.7+)
      workspaces.js      #   workspace context / persistence     (v0.7+)
      cli.js             #   CLI subcommands
      index.js           #   public API surface

  apps/
    api/                 # Express REST API + SSE (thin adapter)
      src/server.js
      public/            # built web app served from :3000 (copy of apps/web/dist)
    web/                 # React + Vite frontend (thin adapter)
      src/components/
      src/pages/

  docs/                  # this documentation suite
  output/                # generated artifacts (git-ignored)
    json/                #   canonical records
    excel/               #   filled workbook copies (job-<id>_filled.xlsx)
    uploads/<jobId>/     #   staged input files (v0.4)
    jobs/                #   persisted Job records + workflows (v0.4)
    jobs/job-<id>/       #   per-job draft.json (v0.4)
    mappings/            #   saved mapping profiles (v0.4)
    workspaces/          #   workspace persistence (v0.7+)
    *.log                #   runtime logs
```

---

## 5. Module Responsibilities

| Module | Responsibility | Not responsible for |
|---|---|---|
| **Workflow Engine** | Workflow definitions, Job runner, draft/preview/apply, watch service, canonical record validation | UI, transport, destinations |
| **Input plugins** | Turn a source into canonical records (KMZ unzip/parse, later CSV/PDF/Images/API) | Business rules of the destination |
| **AI provider plugins** | Field extraction, classification, matching; **provider-agnostic** | Persistence, destinations |
| **Excel output plugin** | Understand a workbook (sheets/columns), map fields, fill a copy or in-place | Anything outside Excel |
| **Database output plugin** | Canonical record store (Postgres): sync/upsert, query | Destination business logic |
| **Jobs/history** | Persist Job records, counts, logs; the history of the system | Workflow behavior |
| **Plugin registry** *(future)* | Manifest validation, discovery, lifecycle of input/output/AI/workflow plugins | Workflow behavior |
| **Workspaces** *(future)* | Scope Projects, Workflows, Templates, Jobs, Settings; local persistence + backup | Workflow behavior |
| **API (apps/api)** | REST + SSE transport over the engine — thin | Business logic (D3) |
| **Web (apps/web)** | Two-mode UI: Basic guided flow + Professional panels — thin | Business logic |
| **Future CRM/Cloud** | Higher products reusing the engine, Job model, plugins, workspaces | — |

Every module has: a **contract** (JSON), **storage** (where needed), an **API
surface**, and a **UI slice** (where needed). Modules are independently testable
and independently replaceable.

---

## 6. Plugin System (Extension Mechanism)

The long-term way TerraFlow grows is **plugins against stable contracts**, not
engine rewrites. Today's adapters already follow these contracts; the registry
and discovery are implemented in a later milestone (v0.7+), but the shape is
fixed now so nothing needs to be reworked later.

### 6.1 Plugin types

| Plugin type | Contract | Today | Future |
|---|---|---|---|
| **Input Plugins** | `read(source, ctx) → canonical records + progress events` | KMZ (unzip → KML → parse) | CSV, PDF/OCR, Images, API/webhook, folders |
| **Output Plugins** | `inspect(destination)` · `draft(records) → draft` · `preview(draft)` · `apply(draft)` | Excel, Database | CRM, Metadata store, API/webhook |
| **AI Provider Plugins** | `extract(record, prompt) → normalized JSON` | Groq | OpenRouter, OpenAI, local models |
| **Workflow Plugins** | A bundled end-to-end definition: input + steps + destination + mapping profile | KMZ → AI → Excel | CSV → Cleaning → CRM, PDF → OCR → DB |

### 6.2 Plugin manifest & registry

Every plugin declares a manifest:

```
{
  "id": "input-kmz",
  "type": "input",                 // input | output | ai | workflow
  "version": "1.0.0",
  "entry": "packages/kmz/index.js",
  "displayName": "Google Earth KMZ",
  "supportedRecordTypes": ["property"]
}
```

The **registry** (`@terraflow/engine`'s plugin subsystem, v0.7+):

- Discovers plugins (bundled + user-installed, e.g. a local plugin directory).
- Validates manifests and contracts at load time.
- Resolves a plugin by id; the engine only ever talks to plugin interfaces.
- Exposes an audit list of installed plugins to the Professional UI.

### 6.3 Migration path (no rework)

1. **Now:** adapters expose the plugin-shaped interfaces (input `read`, output
   `inspect/draft/preview/apply`, AI `extract`). The registry is just a small
   factory (`createProvider`, `createExcelAdapter`, …).
2. **v0.6:** the second workflow/adapter ships as a real plugin pair, proving the
   mechanism end-to-end.
3. **v0.7+:** manifest + discovery + local plugin directory; workflow plugins are
   installable units; the Professional UI lists and manages plugins.

**Rules**

- The engine never special-cases a plugin by name — only by contract.
- Built-in adapters are plugins too; there is no privileged path.
- A plugin must be able to fail loudly and be skipped without breaking the Job.

---

## 7. Workspaces (Organization & Persistence)

A **Workspace** is the unit of organization and local-first persistence in
TerraFlow. Implementation is deferred to v0.7, but every data model and endpoint
from v0.4 must be workspace-aware in shape so nothing needs restructuring.

### 7.1 What a workspace contains

- **Projects** — user-defined groupings (an agency, a portfolio, a client
  folder) with their own workflows, templates and jobs.
- **Workflows** — saved workflow definitions (input source + steps + destination
  + mapping profile + AI config).
- **Templates** — destination templates (Excel workbooks + saved mapping
  profiles) owned by the workspace.
- **Jobs** — the persisted run history, scoped to the workspace.
- **Settings** — workspace-level configuration (AI provider default, paths,
  defaults, two-mode preference).

### 7.2 Persistence & backup

- One workspace = one directory (`output/workspaces/<id>/`): `workspace.json`
  (metadata + settings), `workflows/`, `templates/`, `mappings/`, `jobs/`.
- **Backup / restore** = archiving and restoring that directory; natural and
  offline-friendly (the local-first story).
- Job records and canonical JSON already live under `output/`, so a workspace
  backup is one consistent snapshot.

### 7.3 Relationship to the roadmap

- **v0.4–v0.5:** the engine runs under an implicit single local workspace; Job
  records, mappings and saved workflows are stored with a `workspaceId` reserved
  in the schema (default workspace).
- **v0.7:** workspace switching, persistence, backup/restore, and the
  "Continue as Local User" scaffold.
- **Cloud/SaaS era:** a workspace maps cleanly to a tenant (`tenant_id`), and
  collaboration happens between users of the same workspace.

---

## 8. Data Flow

### The MVP workflow (KMZ → AI → Excel)

```
KMZ file added to watched folder
        │  (WatchService, fs.watch / upload)
        ▼
Input adapter: unzip → KML → parse → dedupe
        │
        ▼
Canonical records  v1   (output/json/properties.json)
        │
        ▼
AI transform (provider-independent, Groq today)
        │  enrich each record with ai object
        ▼
Canonical records + ai (output/json/properties_ai.json)
        │
        ├─────────────►  Database adapter (PostgreSQL, properties table)
        │
        └─────────────►  Excel adapter (draft → preview → apply to a copy)
```

At every arrow, the data is **validated against the canonical record contract**.
The pipeline is **idempotent** — re-running produces the same result; the AI
stage caches by `sourceFile@placemarkIndex`; the DB load is an upsert; the Excel
fill is append-only.

### The generic spine (all workflows)

Every workflow follows the same spine, so future workflows reuse the machinery:

```
read (input adapter) → transform steps (incl. AI) → validate → draft → review → apply (output adapter)
```

A workflow definition describes only *which* adapters and steps are used and how
records map to the destination. The engine provides the runner, the Job record,
the safety model and the events.

---

## 9. Workflow Execution Model

### 9.1 Workflow definitions

A workflow is a declarative pipeline definition:

```
{
  "id": "kmz-ai-excel",
  "name": "KMZ → AI → Excel",
  "input": "kmz",                    // input adapter
  "steps": ["extract", "ai", "db", "fill"],
  "destination": "excel",            // output adapter
  "mapping": "default"               // mapping profile id
}
```

Future workflows (e.g. `csv-clean-crm`, `pdf-ocr-db`) reuse the same shape with
different adapters and steps. In the plugin era, `input`, `ai` and `destination`
are plugin ids resolved by the registry; in v0.4 they are adapter references.

### 9.2 The Job record

Every execution is a **Job**. A Job is the history of the system and is reusable
by future TerraFlow products (including CRM):

```
{
  "id": 27,
  "workflowType": "kmz-ai-excel",
  "status": "completed",              // queued | running | completed | failed | canceled
  "startedAt": "2026-06-01T09:00:00Z",
  "finishedAt": "2026-06-01T09:00:12Z",
  "durationMs": 12000,
  "processedFiles": 12,
  "recordsCreated": 248,
  "recordsUpdated": 0,
  "recordsSkipped": 2,
  "warnings": 5,
  "errors": 0,
  "log": [ /* execution events */ ]
}
```

Example (as shown to a user):

```
Job #27 — Completed
12 KMZ files · 248 properties detected · 241 imported
5 warnings · 2 skipped
```

### 9.3 Safe execution (draft → preview → apply)

The destination is **never** modified immediately:

```
Run Workflow
    ↓
Generate Draft      (compute all writes into an in-memory + on-disk draft)
    ↓
Preview Changes     (UI shows new / modified / skipped rows, warnings,
                     and AI uncertainties, visually distinguished)
    ↓
User Review
    ↓
Apply Changes       (only now write to the destination — Excel copy or in-place)
```

- **New rows** — to be inserted.
- **Modified rows** — existing destination rows the job would change.
- **Skipped rows** — detected duplicates or records the user chose to ignore.
- **Warnings** — ambiguous values that need attention.
- **AI uncertainties** — fields where the model was not confident.

The apply step remains idempotent and backup-safe (see D2/D7).

---

## 10. Database Strategy

- **PostgreSQL** is the operational record store (the *Database output adapter*).
- **Canonical record JSON is the interchange truth.** Postgres is a materialized,
  indexed view of that truth for querying. Raw JSON (`ai_raw`, source JSON) is
  preserved for audit and re-derivation.
- **Schema:** `packages/database/schema.sql` bootstraps the `properties` table
  today (the KMZ workflow's record type). From v0.4+, versioned migrations manage
  evolution. A suggested layout:

```
jobs         (id, workflow_type, status, started_at, finished_at, duration_ms,
              processed_files, records_created, records_updated, records_skipped,
              warnings, errors, log_json, created_at)
properties   (id, source_file, placemark_idx, name, area_m2, description,
              lat, lon, alt, property_type, status, location, price,
              price_note, owner_name, seller, owner_phone, notes, ai_raw,
              job_id?, created_at, UNIQUE(source_file, placemark_idx))
clients      (id, name, phone, type [buyer|seller|investor], preferences,
              hotness, notes, created_at)                      [future]
visits       (id, property_id, client_id, scheduled_at, outcome, notes) [future]
tasks        (id, assignee_id, due_at, priority, status, ...)  [future]
users        (id, name, email, password_hash, role)            [future]
files        (id, entity_type, entity_id, storage_key, mime, size, created_at) [future]
```

- **Workspace-aware:** `workspace_id` and `workflow_id` columns are reserved on
  `jobs` (and relevant business tables) for the v0.7 workspace milestone.
- **Geo:** `lat`/`lon` columns + index today. **PostGIS** (`geography(Point)`)
  is a planned, non-breaking addition.
- **Excel migration:** Excel remains a supported destination (and optionally an
  input), keeping two-way compatibility and removing migration fear.
- **Backups:** Docker volume snapshot + `pg_dump`; workspace backup/restore
  (templates, mappings, workflows, history) in v0.7.

---

## 11. API Strategy

- **REST, versioned** (`/api/v1/...`). Express modular routers.
- JSON in/out matching the canonical record naming where applicable.
- **Job-centric endpoints** (v0.4+):

```
POST   /api/v1/uploads                 # stage a file or whole folder
GET    /api/v1/excel/inspect           # sheets, headers, sample rows
POST   /api/v1/excel/mapping           # suggest + validate column mapping
POST   /api/v1/jobs                    # create + run a workflow (202; 409 if busy)
GET    /api/v1/jobs                    # history (persisted)
GET    /api/v1/jobs/:id                # Job record + status
GET    /api/v1/jobs/:id/draft          # draft preview data (new/modified/skipped…)
POST   /api/v1/jobs/:id/apply          # apply the reviewed draft
GET    /api/v1/jobs/:id/download       # resulting destination file
POST   /api/v1/jobs/:id/dry-run        # Professional mode dry run
POST   /api/v1/watch                   # start watching a folder/file
DELETE /api/v1/watch/:id               # stop a watch
GET    /api/v1/watch                   # list watch jobs + status
GET    /api/v1/pipeline/events         # SSE: jobs + watch events
```

**Live today (v0.4, unversioned under `/api`):** `POST /api/uploads`,
`POST /api/excel/inspect` · `POST /api/excel/mapping` ·
`POST /api/excel/mapping/profile`, the job routes `POST /api/jobs`,
`GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/run`,
`POST /api/jobs/:id/draft`, `GET /api/jobs/:id/draft`,
`POST /api/jobs/:id/apply`, `POST /api/jobs/:id/cancel`,
`GET /api/jobs/:id/download`, workflow CRUD under
`/api/workflows`, watch as `POST /api/watch/start` · `POST /api/watch/stop` ·
`GET /api/watch`, and SSE on `/api/pipeline/events` / `/api/jobs/events`
(`job:*` plus `watch:change`, `watch:log`, `watch:state`). The `/api/v1/`
list above is the target contract; the current server is its working
implementation, and the versioned prefix is a v1.0 task.

- **Workspace-aware:** every route accepts an (optional) workspace context in
  v0.4; v0.7 adds explicit workspace selection. Validation happens at the
  boundary using the canonical record contract schema.
- **Auth middleware** protects internal routes later (v1.0 local-first scaffold,
  then real auth in the cloud era).

---

## 12. AI Layer Design

The AI layer is **provider-independent and replaceable** — in the plugin era it
is literally a family of AI Provider Plugins against one interface:

```
packages/ai/provider.js     # the interface (AIProvider plugin contract)
  { name, model, extract(record, prompt) -> structured json }

packages/ai/groq.js         # today's implementation (fetch -> chat/completions)
packages/ai/openrouter.js   # tomorrow (same interface)
packages/ai/local.js        # later (same interface)
```

- Today: **Groq**, model `llama-3.3-70b-versatile`, key in `.env`.
- Tomorrow: **OpenRouter, OpenAI, or local models** — switching providers changes
  configuration, not the system.
- The provider is chosen by config (`AI_PROVIDER=groq`). Every provider returns
  the **same normalized JSON schema** (the `ai` part of the canonical record).
- Guardrails: `temperature 0`, `response_format: json_object`, strict prompt
  rules, and a **never-invent-fields** policy. Raw provider output is kept in
  `ai_raw` for audit.
- Resume-safe + paced: results cached by `sourceFile@placemarkIndex`, writes
  incremental, throttled to the free-tier TPM (D10).

---

## 13. Scalability Strategy

- **Modular boundaries first:** engine, plugins, API, UI are isolated now, so
  they can be split into separate processes/services later without rewrites.
- **Long runs are Jobs, not requests:** the Job runner is the abstraction; the
  watcher is the first trigger; later it becomes a worker process / TerraFlow
  Agent.
- **Read-heavy paths are queryable:** Postgres indexes (name, lat/lon, status,
  type) cover search and dashboard reads.
- **Caching later:** dashboard KPIs and search results can be cached when data
  volume demands it; the canonical record contract makes cache keys stable.
- **Plugins scale with the platform:** new capabilities arrive as plugins; the
  registry can later load plugins across process boundaries.
- **Multi-tenant (SaaS, future):** a workspace/tenant context on every business
  table and a tenant context in the API/auth layer. Designed for later; adding a
  column + isolation middleware, not restructuring.

---

## 14. Security Considerations

- **Secrets:** API keys and paths only in `.env` (git-ignored). `.env.example`
  documents placeholders. Never commit secrets.
- **Plugins:** manifests validated at load; plugins run sandboxed by contract
  (no privileged engine internals); the Professional UI shows installed plugins
  and their versions for audit.
- **Authentication (future):** hashed passwords, JWT sessions, role-based access
  (admin / agent). v0.7 ships a **local-first** scaffold only ("Continue as Local
  User"), offline-ready.
- **Safe execution:** destinations are never modified before the user reviews a
  draft; applies are backup-safe (D2/D7).
- **Files:** uploads validated (type/size), staged under `output/uploads/<jobId>/`,
  served through controlled routes.
- **AI prompts:** no secrets are ever sent to the AI provider; only source
  descriptions.
- **Audit:** keep raw source + AI raw output + Job logs so any derived value can
  be re-derived and verified.

---

## 15. Development Roadmap

| Version | Scope | Entry criteria |
|---|---|---|
| **0.1–0.3** (✅) | Monorepo, engine orchestration, REST API | Shipped and verified |
| **0.4** (✅) | Workflow MVP: Job model, draft/preview/apply, input sources (file/folder/watch), destination understanding, Basic-mode 6 steps, job-based API, multi-workflow, single-port serving; plugin-shaped adapter contracts; workspace-aware schema | Shipped and verified (see ROADMAP.md) |
| **0.5** (⏳) | Professional mode, AI configuration, Excel template manager, workflow builder, log viewer; plugin contracts solidified | v0.4 reviewed in real use |
| **0.6** (⏳) | Second workflow/adapter shipped as a **plugin pair** (proves the plugin mechanism end-to-end) + ecosystem apps | v0.5 stable |
| **0.7 → 1.0** (⏳) | Embeddable engine contract, versioned API + docs, **workspace persistence + backup/restore**, **plugin registry + manifest/discovery**, local-first scaffold, migrations, Docker Compose, GA | v0.6 validated |

---

## 16. MVP Definition

The MVP is **one polished workflow** — KMZ → AI → Excel — shipped
production-ready. **That loop is live as of v0.4**:

- Basic mode, 6 steps: choose input (file/folder/watch) → choose Excel → run →
  progress → review draft (in-app) → apply.
- Real destination understanding: sheet/column detection, suggested mapping,
  validation, auto-create missing columns.
- Universal Job records with persisted history.
- Safe execution: nothing touches the user's workbook before review.
- Live progress via SSE; file/folder watch automation (user-controlled
  start/stop).

**Non-goals for the MVP:** real auth, multi-user, cloud sync, second
workflows/adapters, CRM modules, billing, the plugin registry UI, and workspace
switching. The *contracts* are plugin-shaped and the *schema* is
workspace-aware — the mechanisms arrive in v0.6/v0.7.

---

## 17. Future Ecosystem

TerraFlow Engine becomes **one component** of a larger TerraFlow family:

```
Desktop App  →  TerraFlow Agent  →  Cloud Dashboard  →  CRM  →  Automation  →  Multi-user
```

- **TerraFlow Agent** — runs workflows where the files live (could be a worker
  process or the desktop app's background service).
- **Cloud Dashboard** — remote monitoring of Jobs, watches, and history, scoped
  by **workspace**.
- **CRM** — reuses the Job model, the engine, the plugins, and the adapters; the
  properties workflow feeds a property catalog.
- **Automation** — scheduled + event-driven workflow triggers.
- **Plugin ecosystem** — the long-term extension mechanism lets TerraFlow, the
  agency, and third parties add inputs, outputs, AI providers and complete
  workflows without forking the engine.
- **Multi-user collaboration** — shared workspaces, roles, permissions, sync.

The module boundaries, Job model, canonical records, plugin contracts,
workspace shape, and API-first design make this additive — no restructuring
required.

---

## 18. Risks

| Risk | Mitigation |
|---|---|
| **Excel lock-in / fear of migration** | Two-way Excel support; Excel remains a first-class *plugin*, but the engine is destination-agnostic |
| **AI hallucination on Arabic text** | Strict prompts, `temperature 0`, keep `ai_raw`, review-before-apply, never overwrite source |
| **Import edge cases** (no KML, weird folders, multi-placemark) | Failures are logged, not fatal; dedupe report; resumable stages; per-record skip/retry |
| **Data loss** | Postgres upserts + backups; JSON records are an immutable audit trail; safe execution never touches originals pre-review; workspace backup/restore |
| **Scope creep ("just an Excel tool", "make it a CRM")** | One workflow at a time; every feature must save time; modes hide complexity |
| **Single-provider AI lock-in** | AI provider plugin interface designed now; split is mechanical |
| **Plugin sprawl / fragile registry** | Strict manifests + contract validation; plugins run by contract only; audit list in Professional UI |
| **Workspace migration pain later** | Workspace-aware schema and paths reserved from v0.4; default single workspace until v0.7 |
| **Workflow logic leaking into UI/API** | Architecture invariant (D3/D17): engine owns logic; API/UI are thin adapters |

---

## 19. Technical Debt to Avoid

- **No monolith business logic** — every rule lives in its module/plugin.
- **No AI-specific code outside `packages/ai/`** — don't sprinkle provider calls.
- **No format drift** — one validated canonical record contract per workflow,
  never ad-hoc shapes.
- **No direct file writes to the user's destination before review** — always a
  draft → preview → apply.
- **No unversioned JSON** — the contract has a `schemaVersion`.
- **No sync without idempotency** — every step re-runs safely.
- **No secret leakage** — `.env` stays git-ignored; keys never string-literal'd.
- **No special-cased plugins** — the engine talks to contracts, never to a named
  adapter.
- **No workspace-irreversible data** — records and paths are workspace-scoped
  from the start.

---

## 20. Design Principles

1. **Reduce cognitive load.** Less thinking, less remembering.
2. **Solve one workflow at a time.** Ship it, measure it, move on.
3. **Workflow is the core abstraction.** Excel is one adapter, not the product.
4. **Safe by default.** Draft → preview → review → apply; never touch the
   destination before review.
5. **Every run is a Job.** History is the product's memory, reusable by CRM.
6. **Canonical records are truth.** Derive everything else.
7. **Modules and adapters are independent.** Clear contracts, no shared internals.
8. **AI is replaceable.** Provider-independent by design.
9. **Excel is a citizen, not the enemy.** Two-way, gradual, one adapter.
10. **Idempotent everything.** Safe to re-run, safe to retry.
11. **Arabic-first (first workflow).** Data and UI stay Arabic; bilingual-tolerant.
12. **Deterministic IDs.** Stable, human-readable, collision-safe.
13. **Never invent data.** AI extracts, humans decide — and review.
14. **UI is a view, not a product.** Basic/Professional modes expose/hide the
    same product.
15. **Plugins, not forks.** New inputs/outputs/AI providers/workflows are plugins
    against stable contracts.
16. **Workspaces organize.** Projects, workflows, templates, jobs and settings
    belong to a workspace.

---

## 21. Guiding Rules for Future Development

- Ask before every feature: *"Does this reduce mental effort or save time?"* —
  if not, don't build it.
- Build the **one painful workflow** first; the CRM modules emerge from the sum.
- Keep the **workflow engine decoupled** from the rest of the platform — it must
  be embeddable in bigger software.
- **Workflow logic never depends on React; business logic never depends on the
  UI.** Backend and frontend stay fully separated.
- Keep **canonical records forward-compatible**: add fields, never rename/remove.
- Every module needs a **contract, storage, API, UI** — in that order.
- **Postgres is queried, records are canonical, Excel is output.**
- The **AI provider is config**, never a hard dependency.
- **Two-way Excel compatibility** until the user says otherwise.
- New capabilities ship as **plugins against contracts**, not engine rewrites.
- Design for **workspaces** even before implementing them — schema and paths are
  workspace-aware from v0.4.
- Document the reasoning, then build. This plan is the reasoning.

---

*Back to [README](../README.md) · Next: [STANDARD_JSON.md](STANDARD_JSON.md) · See also: [PLAN.md](PLAN.md), [VISION.md](VISION.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), [OPERATIONS.md](OPERATIONS.md)*
