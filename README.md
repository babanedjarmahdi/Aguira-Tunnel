# TerraFlow

**From Google Earth pins to a complete real-estate management system.**

TerraFlow is a real-estate CRM platform for the Algerian property market. It
currently ships a **data pipeline** that turns Google Earth `.kmz` files into a
structured property database, and it is designed to grow into a **full web CRM**
(React + Node.js/Express + PostgreSQL) — properties, clients, visits, deals, and
a dashboard. See the docs for the full vision.

## Pipeline (working today)

```
KMZ files ──► Extract + parse + dedupe ──► properties.json
              ──► AI enrich (Groq)      ──► properties_ai.json
              ──► PostgreSQL (Docker)   ──► Excel (filled copy)
```

- 146 source KMZ files → **147 unique properties**, 0 parse failures, 2 duplicates removed.
- AI extracts 18 structured fields from Arabic free text (type, status, location, price, owner, phone, notes…).
- **Live watcher**: add or remove a `.kmz` in the Google Earth folder and the DB + Excel re-sync automatically.

## Documentation

| Document | Contents |
|---|---|
| [docs/VISION.md](docs/VISION.md) | Product vision, roadmap, guiding principles |
| [docs/ARCHITECTURE_PLAN.md](docs/ARCHITECTURE_PLAN.md) | **CTO blueprint**: the full 19-section platform architecture (modules, data flow, AI layer, SaaS evolution) |
| [docs/STANDARD_JSON.md](docs/STANDARD_JSON.md) | Versioned Standard JSON contract — the single source of truth |
| [docs/PLAN.md](docs/PLAN.md) | Original KMZ→DB→Excel execution plan with build status |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Current pipeline internals (modules, scripts, watcher) |
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
docs/             # vision, architecture, data model, operations
output/           # generated JSON + Excel (git-ignored)
```

## Notes

- The Groq API key and local paths live in `.env` (git-ignored) — never commit them.
- The original Excel template is never overwritten; the pipeline writes a copy.
