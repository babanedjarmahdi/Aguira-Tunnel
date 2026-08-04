# TerraFlow Engine

**From messy input files to organized workflows — without touching the source.**

TerraFlow Engine is an **intelligent workflow engine** that reads files, imports
their data, understands the destination, and fills it with the structured result
— safely, reviewably, and automatically.

It is **not** an Excel tool and not a CRM. Excel is one *output adapter*; the
engine is destination-agnostic.

- Today's MVP workflow: **KMZ → AI → Excel** (Google Earth pins → structured
  property records → the agency's Excel workbook + PostgreSQL).
- Future workflows, same engine: **PDF → OCR → Database**,
  **CSV → Cleaning → CRM**, **Images → AI → Metadata**,
  **API → Transformation → Database** — new definitions, not new products.

See [docs/VISION.md](docs/VISION.md) for the product vision,
[docs/ARCHITECTURE_PLAN.md](docs/ARCHITECTURE_PLAN.md) for the blueprint,
[docs/ROADMAP.md](docs/ROADMAP.md) for the versioned execution plan, and
[docs/STATUS.md](docs/STATUS.md) for the live task tracker (what's done / not done).

## Architecture at a glance

```
input adapter ──► transform steps ──► canonical records ──► output adapters
                                                              │
 KMZ (Google     AI enrich (Groq,   Standard JSON     ┌───────┴──────┐
 Earth pins)     provider-agnostic) (single source    ▼               ▼
     │           validate/dedupe     of truth)      PostgreSQL     Excel
     └──► Workflow Engine (packages/engine)           (Docker)     (copy-first)
           │  Job model • draft → preview → apply
           └──► REST API + SSE (apps/api) ──► Web UI (apps/web)
```

Standard JSON is the **single source of truth**; PostgreSQL is the indexed query
view, Excel is a destination the engine fills. The engine owns all business
logic; the API and UI are thin adapters.

## How it stays safe

The destination is **never** modified immediately. Every run is a **Job**
(history: start/finish, duration, status, files, created/updated/skipped
records, warnings, errors, logs) and every change goes through
**draft → preview → review → apply** — new rows, modified rows, skipped rows,
warnings and AI uncertainties are shown before anything is written.

## Current capabilities

- **Workflow engine** (`@terraflow/engine`): orchestrates `extract → ai → db →
  fill`, UI-agnostic, callable from CLI or API, emits structured events.
- 147 unique properties from 146 source KMZ files, 0 parse failures.
- AI extracts structured fields from Arabic free text (type, status, location,
  price, owner, phone, notes…) via Groq — resume-safe, cached, throttled.
- **REST API + SSE** on `http://localhost:3000`; **React + Vite web UI**
  (dark, two-mode Basic/Professional) under construction in `apps/web`.
- **Live watcher**: add or remove a `.kmz` and the DB + Excel re-sync.
- Idempotent stages: re-runs are safe, the AI stage caches, the DB load upserts,
  the Excel fill is append-only.

## Core principles

1. **Standard JSON is the single source of truth.** Postgres is the indexed
   query view, Excel is a destination.
2. **Never overwrite source data.** Raw descriptions are preserved; AI output
   lives in a separate `ai` object. The user's original workbook is only written
   by the explicit `fill:original` command (with a forced backup).
3. **Safe by default.** Draft → preview → review → apply. Nothing touches the
   destination before review.
4. **Every run is a Job.** Jobs are the history of the system, reused by future
   TerraFlow products (CRM, Cloud).
5. **Engine owns business logic; UI/API are thin adapters.**
6. **AI provider independence.** One `AIProvider` interface; Groq today, others
   added when a concrete need exists.
7. **Plugins, not forks.** New inputs / outputs / AI providers / workflows are
   plugins against stable contracts (the long-term extension mechanism).
8. **Modular monorepo.** Reusable logic in `packages/*`, products in `apps/*`.
9. **Reduce cognitive load.** Every feature must answer: *"does this reduce
   mental effort or save time for the user?"* If not, it does not ship.

## Quick start

```bash
npm install                # install dependencies (workspaces)
copy .env.example .env     # fill in GROQ_API_KEY + paths (or: cp on unix)
docker compose up -d       # start PostgreSQL
npm run extract            # kmz -> output/json/properties.json
npm run ai                 # + Groq AI -> output/json/properties_ai.json
npm run loaddb             # -> PostgreSQL
npm run fill               # -> output/excel/..._filled.xlsx (copy)
npm run pipeline           # extract + ai + loaddb + fill, in one shot
npm run watch              # watch source folder, auto re-sync on add/remove
npm run build:web          # build web UI + copy into apps/api/public
npm run api                # everything on one port: web UI + REST API on http://localhost:3000
npm run dev                # optional Vite hot-reload dev server (proxies /api to :3000)
```

`fill:original` writes as-written prices back into the customer's original
workbook (backs it up first) — use it deliberately, prefer `fill` otherwise.

## API

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Liveness + DB check |
| GET | `/api/config` | Non-secret runtime config |
| GET | `/api/status` | Current / last pipeline job state |
| POST | `/api/pipeline` | Trigger `extract → ai → db → fill` (202; 409 if running) |
| GET | `/api/pipeline/events` | SSE: replayed history + live progress events |
| GET | `/api/properties` | Property catalog from PostgreSQL |

The v0.4 job-based API (uploads, excel inspect/mapping, jobs, draft, apply,
watch) is being built on the same engine — see
[docs/ARCHITECTURE_PLAN.md](docs/ARCHITECTURE_PLAN.md) §11.

## Repo layout

```
packages/engine/     # workflow engine: orchestration, stages, extractor, watch, config, events, CLI
packages/ai/         # AIProvider interface + Groq adapter
packages/excel/      # Excel output adapter: price formatting, mapping, copy + in-place fill
packages/database/   # PostgreSQL output adapter: client, sync/upsert
packages/shared/     # normalize, DZD price math, Standard JSON validation
apps/api/            # Express REST API + SSE
apps/web/            # React + Vite frontend (v0.4 UI)
docker-compose.yml   # PostgreSQL 16
docs/                # VISION, ARCHITECTURE_PLAN, ROADMAP, DECISIONS, ...
output/              # generated JSON + Excel (git-ignored)
```

## Documentation

| Document | Contents |
|---|---|
| [docs/VISION.md](docs/VISION.md) | Product vision, guiding principles, ecosystem |
| [docs/ARCHITECTURE_PLAN.md](docs/ARCHITECTURE_PLAN.md) | **CTO blueprint**: workflow engine, adapters/plugins, Job model, safe execution, workspaces |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Current implementation map (monorepo, packages, stages, API) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Versioned execution plan 0.1 → 1.0 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisions log (source of truth, fill modes, ID scheme, …) |
| [docs/STANDARD_JSON.md](docs/STANDARD_JSON.md) | Versioned Standard JSON contract |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | DB schema, ID scheme, price rules, AI fields, Excel columns, Job model |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Setup, running, watcher, API/web, troubleshooting |

## Notes

- The Groq API key and local paths live in `.env` (git-ignored) — never commit them.
- The original Excel template is never overwritten by the normal pipeline; the
  pipeline writes a copy (`output/excel/`).
