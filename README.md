# TerraFlow

**From Google Earth pins to a real-estate operating system.**

TerraFlow is a modular platform for the Algerian property market. It ships an
**import engine** that turns Google Earth `.kmz` files into a structured property
database, wrapped in a **REST API**, and it is architected to grow — one workflow
at a time — into a full operating system: property management, client management,
appointments, matching, analytics, and a public website.

The platform is not "a CRM." Relationship management is one cluster of modules,
built only when real operational problems demand it. See
[docs/VISION.md](docs/VISION.md) for the product vision,
[docs/ARCHITECTURE_PLAN.md](docs/ARCHITECTURE_PLAN.md) for the blueprint, and
[docs/ROADMAP.md](docs/ROADMAP.md) for the versioned execution plan.

## Architecture at a glance

```
Google Earth (.kmz)
       │  watched
       ▼
Core Engine (packages/engine)
   extract + dedupe ──► Standard JSON ──► properties.json
   AI enrich (Groq)  ──► properties_ai.json
   DB sync (upsert)  ──► PostgreSQL (Docker)
   Excel fill (copy) ──► output/excel/..._filled.xlsx
       │
       ▼
REST API (apps/api, localhost:3000)  ── SSE progress ──► future frontend
```

Standard JSON is the **single source of truth**. PostgreSQL, Excel export, the
REST API, and any integration are derived from it. The engine owns all business
logic; the API and any future UI are thin adapters.

## Current capabilities

- 147 unique properties from 146 source KMZ files, 0 parse failures.
- AI extracts 18 structured fields from Arabic free text (type, status,
  location, price, owner, phone, notes…).
- **REST API** on `http://localhost:3000`: health, config, status, property
  catalog, pipeline trigger, and a live **SSE event stream** for progress/logs.
- **Live watcher**: add or remove a `.kmz` in the Google Earth folder and the
  DB + Excel re-sync automatically.
- Idempotent stages: re-runs are safe, the AI stage caches, the DB load
  upserts, the Excel fill is append-only.

## Core principles

1. **Standard JSON is the single source of truth.** Postgres is the indexed
   query view, Excel is an export.
2. **Never overwrite source data.** The raw KMZ description is preserved; AI
   output lives in a separate `ai` object. The customer's original Excel is only
   written by the explicit `fill:original` command (with a forced backup).
3. **Engine owns business logic; UI/API are thin adapters.**
4. **AI provider independence.** One `AIProvider` interface; Groq today, others
   added only when a concrete need exists.
5. **Modular monorepo.** Reusable logic in `packages/*`, products in `apps/*`.
6. **Reduce cognitive load.** Every feature must answer: *"does this reduce
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
npm run api                # REST API on http://localhost:3000
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

## Repo layout

```
packages/engine/     # pipeline orchestration, CLI, watch, config, extractor
packages/ai/         # AIProvider interface + Groq adapter
packages/excel/      # price formatting, column mapping, copy + in-place fill
packages/database/   # PostgreSQL client, sync/upsert, schema.sql
packages/shared/     # normalize, DZD price math, Standard JSON validation
apps/api/            # Express REST API + SSE
schema.sql           # (canonical copy: packages/database/schema.sql)
docker-compose.yml   # PostgreSQL 16
docs/                # VISION, ARCHITECTURE_PLAN, ROADMAP, DECISIONS, ...
output/              # generated JSON + Excel (git-ignored)
```

## Documentation

| Document | Contents |
|---|---|
| [docs/VISION.md](docs/VISION.md) | Product vision, guiding principles |
| [docs/ARCHITECTURE_PLAN.md](docs/ARCHITECTURE_PLAN.md) | **CTO blueprint**: the full platform architecture |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Versioned execution plan 0.1 → 1.0 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisions log (source of truth, fill modes, ID scheme, …) |
| [docs/STANDARD_JSON.md](docs/STANDARD_JSON.md) | Versioned Standard JSON contract |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | DB schema, ID scheme, price rules, AI fields, Excel columns |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Setup, running, watcher, troubleshooting |

## Notes

- The Groq API key and local paths live in `.env` (git-ignored) — never commit them.
- The original Excel template is never overwritten by the normal pipeline; the
  pipeline writes a copy (`output/excel/`).
