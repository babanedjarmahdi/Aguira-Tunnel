# TerraFlow

**From Google Earth pins to a real-estate operating system.**

TerraFlow is a modular platform for the Algerian property market. It currently
ships an **import engine** that turns Google Earth `.kmz` files into a structured
property database, and it is architected to grow — one workflow at a time — into
a full operating system: property management, client management, appointments,
matching, analytics, and a public website.

The platform is not "a CRM." Relationship management is one cluster of modules
(Phase 4), built only when real operational problems demand it. See
[docs/VISION.md](docs/VISION.md) for the product vision and
[docs/ARCHITECTURE_PLAN.md](docs/ARCHITECTURE_PLAN.md) for the full blueprint.

## Architecture at a glance

```
Google Earth (.kmz)
       │  watched
       ▼
Import engine ──► Standard JSON ──► PostgreSQL (Docker)
       │              │
       │              │  AI enrichment (Groq)
       │              ▼
       │        properties_ai.json
       │              │
       └──────────────┴────────────► Excel (filled copy)
```

Standard JSON is the **single source of truth**. PostgreSQL, Excel export, the
future REST API, and any integration are all derived from it.

## Current capabilities

The import engine is production-ready:

```
KMZ ──► extract + parse + dedupe ──► properties.json
       ──► AI enrich (Groq)       ──► properties_ai.json
       ──► PostgreSQL (Docker)    ──► Excel (filled copy)
```

- 146 source KMZ files → **147 unique properties**, 0 parse failures, 2 duplicates removed.
- AI extracts 18 structured fields from Arabic free text (type, status, location, price, owner, phone, notes…).
- **Live watcher**: add or remove a `.kmz` in the Google Earth folder and the DB + Excel re-sync automatically.
- Idempotent stages: re-runs are safe, the AI stage caches, the DB load upserts, the Excel fill is append-only.

## Core principles

1. **Standard JSON is the single source of truth.** Every layer derives from it;
   Postgres is the indexed query view, Excel is an export.
2. **Never overwrite source data.** The raw KMZ description is preserved; AI
   output lives in a separate `ai` object, never in the source text.
3. **Modular architecture by default.** Every module has a clear contract,
   storage, API surface, and UI slice — no monolith business logic.
4. **AI provider independence.** The AI layer is replaceable (Groq today,
   OpenRouter/OpenAI/local tomorrow) behind one interface.
5. **Reduce cognitive load.** Every feature must answer: *"does this reduce
   mental effort or save time for the user?"* If not, it does not ship.
6. **Solve real operational problems before adding features.** The CRM emerges
   naturally from solving actual workflows — never from speculative scope.

## Future vision

One workflow at a time, in dependency order:

```
Import engine
     │
     ▼
Property management
     │
     ▼
Client management
     │
     ▼
Appointments & visits
     │
     ▼
Matching engine (property ↔ client)
     │
     ▼
Analytics & reporting
     │
     ▼
Public website (selected properties)
     │
     ▼
SaaS platform (multi-tenant)
```

Each step stays backward-compatible with the current data model. See the
[roadmap](docs/ARCHITECTURE_PLAN.md#13-development-roadmap) for entry criteria
per phase.

## Documentation

| Document | Contents |
|---|---|
| [docs/VISION.md](docs/VISION.md) | Product vision, roadmap, guiding principles |
| [docs/ARCHITECTURE_PLAN.md](docs/ARCHITECTURE_PLAN.md) | **CTO blueprint**: the full 19-section platform architecture (modules, data flow, AI layer, SaaS evolution) |
| [docs/STANDARD_JSON.md](docs/STANDARD_JSON.md) | Versioned Standard JSON contract — the single source of truth |
| [docs/PLAN.md](docs/PLAN.md) | Original KMZ→DB→Excel execution plan with build status |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Current import-engine internals (modules, scripts, watcher) |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | DB schema, ID scheme, price rules, AI fields, Excel columns |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Setup, running, watcher, troubleshooting |

## Quick start

```bash
npm install                # install dependencies
copy .env.example .env     # fill in GROQ_API_KEY + paths (or: cp on unix)
docker compose up -d       # start PostgreSQL
npm run stage1:extract     # kmz -> output/json/properties.json
npm run stage2:parse-ai    # + Groq AI -> output/json/properties_ai.json
npm run stage1:loaddb      # -> PostgreSQL
npm run stage2:fill        # -> output/excel/..._filled.xlsx
npm run watch              # watch source folder, auto re-sync on add/remove
```

## Repo layout

```
src/lib/          # pure logic: kmz, extractor, ai
src/scripts/      # pipeline stages: stage1_*, stage2_*, watch
schema.sql        # PostgreSQL schema (properties table)
docker-compose.yml# PostgreSQL 16
docs/             # vision, architecture plan, data model, operations
output/           # generated JSON + Excel (git-ignored)
```

## Notes

- The Groq API key and local paths live in `.env` (git-ignored) — never commit them.
- The original Excel template is never overwritten; the pipeline writes a copy.
