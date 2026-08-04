# TerraFlow Engine — Architecture

This document maps the **current implementation** — the monorepo as it exists
today. The **forward-looking blueprint** (workflow engine, adapters/plugins, Job
model, draft → preview → apply, scalability, ecosystem) lives in
**[ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md)**.

> **One-line framing:** TerraFlow is a **workflow engine**. The pipeline below is
> the *first workflow* (KMZ → AI → Excel); Excel is one output adapter, not the
> product.

---

## 1. Current architecture

```
 ┌─────────────────────────────────────────────────────────────┐
 │                         TERRAFLOW ENGINE                      │
 │                                                               │
 │  apps/web (React + Vite) ──REST + SSE──► apps/api (Express)    │
 │                                                               │
 │  packages/engine        the orchestration layer (UI-agnostic) │
 │    orchestrator.js      runPipeline({ stages, env, emitter })  │
 │    stages.js            extract → ai → db → fill (+ original)  │
 │    kmz.js / extractor.js   KMZ input adapter (unzip/parse/dedupe)│
 │    watch.js             CLI file watcher (folder → re-sync)     │
 │    config.js / events.js / cli.js                                │
 │       │                                                         │
 │  ┌────┴───────────┐  ┌───────────────┐  ┌────────────────────┐  │
 │  │ packages/ai    │  │ packages/excel │  │ packages/database  │  │
 │  │ AIProvider     │  │ Excel output   │  │ Postgres output    │  │
 │  │  interface     │  │  adapter       │  │  adapter           │  │
 │  │ Groq adapter   │  │ fill/mapping/  │  │ pg client +        │  │
 │  │ createProvider │  │ price          │  │ loadFromJsonFiles  │  │
 │  └────┬───────────┘  └────┬──────────┘  └────┬───────────────┘  │
 │       │                  │                  │                   │
 │  packages/shared: normalize.js · price.js · standard.js (canonical JSON validation)
 └───────┴──────────────────┴──────────────────┴───────────────────┘
          │                 │                  │
   ┌──────▼──────┐   ┌──────▼──────┐   ┌───────▼────────┐
   │ SOURCE_KMZ_DIR│   │ PostgreSQL 16 │   │ EXCEL_TEMPLATE │
   │ (Google Earth│   │ (Docker)      │   │ (CRM workbook;  │
   │  folder, .kmz)│  │ terraflow DB  │   │  a copy is      │
   └─────────────┘   └──────────────┘   │  written, never  │
                                        │  the original)   │
                                        └──────────────────┘
```

**Invariant (D3/D17):** the engine owns all business logic; `apps/api` and
`apps/web` are thin adapters. The engine emits structured events so any consumer
(CLI, SSE, future ecosystem apps) can attach without the engine knowing about it.

---

## 2. Package responsibilities

| Package | Responsibility |
|---|---|
| `packages/engine` | The workflow engine. `runPipeline()` orchestrates stages; `extractor.js`/`kmz.js` parse and dedupe KMZ; `stages.js` defines each stage; `watch.js` is the CLI watcher; `config.js` reads `.env`; `events.js` defines structured events; `cli.js` exposes subcommands. |
| `packages/ai` | AI layer. `provider.js` defines the `AIProvider` interface (enrich + pacing); `groq.js` is today's implementation; `index.js` exports `createProvider()`. Provider is chosen by config — no engine code depends on Groq directly (D4). |
| `packages/excel` | Excel **output adapter**. `fill.js` (copy-fill + in-place fill), `mapping.js` (field → column mapping), `price.js` (DZD price/location display formatters). |
| `packages/database` | PostgreSQL **output adapter**. `client.js` wraps `pg`; sync/upsert of canonical records (`loadFromJsonFiles`). |
| `packages/shared` | Pure domain logic, no I/O: Arabic text normalization, DZD price math, canonical record JSON validation. |

Every package exposes a small public surface via `index.js`; nothing reaches into
another package's internals.

---

## 3. The pipeline (the first workflow)

Run via CLI (`npm run pipeline`) or API (`POST /api/pipeline`). All stages are
**idempotent** — safe to re-run, safe to retry.

| Stage | File | Behavior |
|---|---|---|
| **extract** | `packages/engine/src/stages.js` → `extractor.js` | Read every `.kmz` in `SOURCE_KMZ_DIR`, unzip → KML, parse pins, smart-dedupe, write `output/json/properties.json` + `dedupe_report.txt`, copy processed files to `DONE_KMZ_DIR`. |
| **ai** | `stages.js` → `packages/ai` | Enrich each record via the AI provider (Groq today). Resume-safe: caches by `sourceFile@placemarkIndex`, writes incrementally, throttles (D10). Output `output/json/properties_ai.json`. |
| **db** | `stages.js` → `packages/database` | Full sync: prune stale rows, upsert on `(source_file, placemark_idx)`. |
| **fill** | `stages.js` → `packages/excel` | Copy the template workbook and append rows (never touches the original). |
| **fill:original** | `stages.js` → `fillInPlace` | Sanctioned exception (D7): writes into the user's original workbook **only** on explicit command, with a forced backup first. |

**Verification (Phase 1):** 146 source KMZ → 147 unique properties, 0 parse
failures, 2 duplicates removed, 147 rows in PostgreSQL, 147 rows appended to the
Excel copy (rows 27–170, all 6 sheets preserved).

---

## 4. The REST API (apps/api)

Express server on `http://localhost:3000` (run with `npm run api`). Thin adapter
over the engine (D3).

| Method | Route | Description |
|---|---|---|
| GET | `/api/health` | Liveness + DB check |
| GET | `/api/config` | Non-secret runtime config |
| GET | `/api/status` | Current / last pipeline job state |
| POST | `/api/pipeline` | Trigger `extract → ai → db → fill` (202; 409 if already running) |
| GET | `/api/pipeline/events` | SSE: replayed history + live progress events |
| GET | `/api/properties` | Property catalog from PostgreSQL |

> v0.4 adds the **job-based API** (uploads, excel inspect/mapping, jobs, draft,
> apply, watch) — see [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §11.

---

## 5. The live watcher

`packages/engine/src/watch.js` (CLI: `npm run watch`) watches `SOURCE_KMZ_DIR`.
Any `.kmz` **added or removed** triggers a full re-sync after a 1.5 s debounce,
guarded against overlapping runs, logs to `output/watcher.log`.

In v0.4 the watcher becomes a **WatchService** (server-side, folder + single-file,
start/stop, SSE events) — the first automation trigger for the Job model.

---

## 6. Current monorepo layout

```
packages/engine/src/   # orchestrator, stages, extractor, kmz, watch, config, events, cli
packages/ai/src/       # provider (interface), groq, index
packages/excel/src/    # fill, mapping, price, index
packages/database/src/ # client, index
packages/shared/src/   # normalize, price, standard, index
apps/api/              # Express REST API + SSE
apps/web/              # React + Vite frontend (v0.4 UI, dark premium theme)
docs/                  # this documentation suite
output/                # generated artifacts (git-ignored)
```

---

*Back to [VISION.md](VISION.md) · Forward: [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) · Next: [DATA_MODEL.md](DATA_MODEL.md)*
