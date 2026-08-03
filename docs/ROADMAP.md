# TerraFlow — Roadmap

> Companion to [VISION.md](VISION.md) and [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md).
> This file tracks the **versioned execution plan** (0.1 → 1.0). Status reflects
> what is done in the repo today.

Legend: ✅ done · 🔄 in progress · ⏳ planned

---

## v0.1 — Foundation (monorepo) ✅

- npm workspaces monorepo: `packages/*` + `apps/*`.
- Packages: `@terraflow/shared`, `@terraflow/ai`, `@terraflow/excel`,
  `@terraflow/database`, `@terraflow/engine`.
- Existing pipeline extracted **unchanged** into the engine package (no business
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
  - `GET /api/status` — current/ last pipeline job state.
  - `POST /api/pipeline` — trigger `extract → ai → db → fill` (202, 409 if running).
  - `GET /api/pipeline/events` — SSE stream (replays history, then live).
  - `GET /api/properties` — property catalog from PostgreSQL.
- Verified end-to-end: full pipeline via API in ~3 s (AI stage resumes from cache).

## v0.4 — Frontend (importer UI) ⏳

> **Not started.** Do NOT begin until v0.3 is validated in real use.

- React + TypeScript + Vite app (`apps/web`).
- Import screen: watch/trigger pipeline, live progress via SSE, per-property log.
- Properties view: table + filters + map (Leaflet).

## v0.5 — Config & validation ⏳

- Externalize agency-specific coupling (type prefixes, sheet name, template
  column mapping) into a config/mapping module.
- Standard JSON validation gates every import; price parser unit tests.

## v0.6 — Ecosystem apps ⏳

- Separate apps (Importer, CRM, Public site, AI assistant) that all reuse the
  Core Engine / `@terraflow/*` packages.

## v0.7 → v1.0 — Hardening & GA ⏳

- Auth (JWT) + roles, audit log.
- Migrations tooling (`node-pg-migrate`), backups.
- Docker Compose for the whole stack (db + api + web).
- v1.0 = feature-complete importer + catalog + search.

---

*Next: [DECISIONS.md](DECISIONS.md) · [VISION.md](VISION.md) · [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md)*
