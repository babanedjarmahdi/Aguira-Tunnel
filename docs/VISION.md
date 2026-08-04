# TerraFlow Engine — Product Vision & Roadmap

> **Tagline:** From messy input files to organized workflows — without touching the
> source. One workflow at a time.

TerraFlow Engine is an **intelligent workflow engine** that understands data
transformation pipelines. It reads files, imports their data, understands the
destination (today: an Excel workbook), and fills that destination with the
structured result — safely, reviewably, and automatically.

It is **not** an Excel tool. Excel is only one possible destination.

- Today's MVP workflow: **KMZ → AI → Excel** (real-estate property pins).
- Future workflows, same engine: **PDF → OCR → Database**,
  **CSV → Cleaning → CRM**, **Images → AI → Metadata**,
  **API → Transformation → Database**.

This document describes where the product is going. Read it before designing any
new feature so the architecture always stays aligned with the vision.

> **The complete technical blueprint lives in
> [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md).** This file is the product vision;
> that file is the system architecture (workflow engine, adapters, job model,
> data flow, scalability).

> **Terminology note.** TerraFlow Engine is a workflow engine — deliberately not
> an "Excel tool" and not a "CRM." Real-estate property data is the first
> *workflow*, not the product's identity. The engine will later become one
> component inside the larger TerraFlow ecosystem (see §6).

---

## 1. The problem we are solving

A real-estate agency works with hundreds of land plots and properties. Today the
data lives in three disconnected places:

1. **Google Earth** — GPS pins with free-text Arabic descriptions (`.kmz` files).
2. **Excel** — a multi-sheet CRM workbook
   (`CRM_GPT_Immobilier_Employees_V8_10_2_2.xlsx`) with dashboards, a search
   engine, properties, clients, communications and daily follow-up.
3. **Human memory / WhatsApp / phone** — owners, sellers, prices, visit notes.

Re-typing data from pins into the workbook is slow, error-prone and repetitive.
The same *shape of problem* repeats across every business: data sits in one
place, is needed in another, and the transformation in between is manual.

TerraFlow Engine turns that repetitive transformation into a reusable workflow:
**read files → import their data → understand the destination → fill it** — with
a human review step before anything is ever applied.

---

## 2. Product philosophy

1. **The workflow is the product.** A workflow is a pipeline:
   `input source → transform steps → destination`. KMZ→AI→Excel is the first
   workflow; the engine is built so new workflows are *definitions*, not new
   products.
2. **Excel is one destination, never the product.** The engine must stay
   destination-agnostic so it can later fill a database, a CRM, or a metadata
   store with the same machinery.
3. **Every execution is a Job.** A Job records everything about a run — start,
   finish, duration, status, workflow type, processed files, created / updated /
   skipped records, warnings, errors, and the execution log. Jobs become the
   history of the system and are reused by future TerraFlow products.
4. **Safe by default.** The engine never modifies the user's destination
   immediately. It runs the workflow, generates a **draft**, shows a **preview**
   the user reviews, and only then **applies** the changes. The preview visually
   distinguishes new rows, modified rows, skipped rows, warnings and AI
   uncertainties.
5. **Two modes, one product.** **Basic** mode is a guided, near-automatic flow
   for non-technical users; **Professional** mode unlocks configuration,
   diagnostics and developer tools. A mode is a view, not a product.
6. **Value first.** Ship a polished, production-ready MVP that solves one real
   business problem. Everything unnecessary is postponed.
7. **Plugins, not forks.** The long-term extension mechanism is a plugin system —
   new inputs, outputs, AI providers and whole workflows are plugins against
   stable contracts, never engine rewrites (see
   [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §6).
8. **Workspaces organize.** Projects, Workflows, Templates, Jobs and Settings
   belong to a workspace — the unit of organization and local-first persistence.
   Deferred in implementation, fixed in the vision (see
   [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §7).

Every feature must answer one question:

> **"Does this reduce mental effort or save time for the user?"**

If a feature does not, it does not ship.

---

## 3. The MVP workflow (Phase 1 — working today)

The first workflow — the one this repo ships — is **KMZ → AI → Excel**:

```
KMZ files ──► Extract ──► Standard JSON ──► AI enrich ──► Database
 (Google     unzip KML    canonical record   (Groq)      (PostgreSQL)
  Earth)     parse+dedupe      │                        ▲
                               ▼                        │
                          properties_ai.json ──► Excel (filled copy,
                                                     rows 27+, عقارات sheet)
```

- 146 source KMZ files → **147 unique properties**, 0 parse failures, 2 duplicates removed.
- AI extraction of 18 structured fields from Arabic free text via Groq
  (provider-independent).
- **Safe loop:** every run is a **Job**; the workflow builds a **draft**, the UI
  shows a preview, and only an explicit **Apply** writes Excel (copy-first).
- **Watch mode:** server-side watcher with start/stop from the UI; every change
  batch becomes a Job automatically.
- Monorepo: `@terraflow/*` packages (shared, ai, excel, database, engine) +
  `apps/api` (REST + SSE, serves the web UI on one port :3000) +
  `apps/web` (Basic-mode 6-step import wizard, jobs, workflows pages).

**Stack:** Node.js 24 (ESM), `exceljs`, `fast-xml-parser`, `adm-zip`, `pg`,
PostgreSQL 16 (Docker), Groq API (`llama-3.3-70b-versatile`), React + Vite.

---

## 4. The roadmap (versions)

Order matters: each milestone builds on the previous one and keeps the data model
compatible. The detailed execution plan lives in [ROADMAP.md](ROADMAP.md).

### v0.1–v0.3 — Foundation ✅
- Monorepo, packages, CLI pipeline (extract → AI → DB → Excel) — done.
- Engine orchestration with structured events — done.
- REST API (`apps/api`) with SSE progress — done.

### v0.4 — Workflow MVP: safe import loop ✅
- Workflow abstraction + universal **Job** record — done.
- **Safe execution**: run → generate draft → preview → user review → apply — done.
- Basic-mode guided flow: choose input (KMZ file / folder / watch) → choose Excel
  → run → review draft → apply — done. Professional unlocks configuration.
- Watch mode (start/stop, Watching… state), mapping validation + profiles — done.

### v0.5 — Professional mode & workflow building blocks ⏳
- Externalized mapping configuration (destination "understanding").
- Excel template manager, workflow builder, AI settings, watch job management,
  persisted job history, professional log viewer.

### v0.6 — A second workflow / adapter ⏳
- A non-Excel destination workflow (e.g. CSV→Cleaning→Database or
  PDF→OCR→Database) proving Excel is one adapter, not the product. It ships as a
  **plugin pair** (input + output), proving the plugin mechanism end-to-end.
- Ecosystem apps (Importer, CRM, public site) all reusing the engine.

### v0.7 → v1.0 — Hardening & embedding ⏳
- Versioned API + docs, workspace persistence, local-first account scaffold,
  backup/restore, Docker Compose for the whole stack.
- **Workspaces**: Projects / Workflows / Templates / Jobs / Settings as the unit
  of local-first persistence and backup (ARCHITECTURE_PLAN §7).
- **Plugin system**: registry, manifest + discovery for input / output / AI /
  workflow plugins (ARCHITECTURE_PLAN §6).
- v1.0 = a polished, sellable, production-ready engine.

---

## 5. The safe execution model

Never modify the user's destination immediately.

```
Run Workflow ──► Generate Draft ──► Preview Changes ──► User Review
        ──► Apply Changes ──► Update Excel
```

The preview visually distinguishes:

- **new rows**
- **modified rows**
- **skipped rows**
- **warnings**
- **AI uncertainties**

This makes the system safer and more professional — nothing is applied to the
user's workbook (or any destination) until a human reviews it.

---

## 6. Two modes

### Basic Mode — for employees
Simple, guided, near-automatic. Six visible steps (the guided 5-step flow plus
an in-app draft-review step so the user never has to leave the app):

1. Choose input (KMZ file / folder / watch)
2. Choose Excel template
3. Run workflow
4. Progress
5. Review draft Excel (in-app)
6. Apply changes / download

Everything else stays hidden: provider configuration, AI settings, advanced
mapping, developer options, logs, debug.

### Professional Mode — for power users
Unlocks:

- AI provider
- Prompt configuration
- Workflow settings
- Column mapping
- JSON inspection
- Dry run
- Developer logs
- Job history
- Advanced diagnostics

Everything is collapsible and organized.

---

## 7. The ecosystem (future)

TerraFlow Engine is the first component of a larger family. The architecture is
designed so expansion is additive:

```
Desktop App
    ▼
TerraFlow Agent   (runs workflows where the files live)
    ▼
Cloud Dashboard
    ▼
CRM               (reuses the Job model and the engine)
    ▼
Automation
    ▼
Multi-user collaboration
```

The **plugin system** is the long-term way TerraFlow grows — new inputs, outputs,
AI providers and whole workflows plug in against stable contracts, so the
ecosystem (and third parties) extend the engine without forking it. Everything
(workflows, templates, jobs, settings) is organized into **workspaces** — the
unit of local-first persistence that maps cleanly to tenants in the cloud era.

The **Engine becomes one component** inside the TerraFlow ecosystem. Today it is
a desktop-first, local-first product; the cloud, accounts and collaboration are
future milestones, not this MVP.

---

## 8. Guiding principles

1. **Workflow is the core abstraction.** New pipelines are workflow definitions.
2. **Standard JSON (canonical record) is the single source of truth.** PostgreSQL
   is the indexed query view; Excel is an export view, never the master.
3. **Every run is a Job.** Jobs are the history of the system, reusable by CRM.
4. **Safe by default.** Draft → preview → review → apply. Never touch the
   destination before review.
5. **Excel is a citizen, not the enemy — and not the product.** Two-way, gradual,
   one adapter among several.
6. **AI is enrichment, not hallucination.** AI fields are stored separately, never
   overwrite raw source, and `temperature 0` + strict prompts minimize invention.
7. **Idempotent, resumable pipeline.** Every stage re-runs safely: extraction is
   deterministic, the AI stage caches, DB load upserts, Excel fill is append-only.
8. **Arabic-first for the first workflow.** Data is Algerian real-estate Arabic;
   all Arabic text stays verbatim.
9. **Deterministic IDs.** Stable, human-readable, collision-safe.
10. **Never commit secrets.** Keys and paths live in `.env` (git-ignored).
11. **Workflow logic never depends on the UI; business logic never depends on
    React.** Backend and frontend stay fully separated.
12. **Plugins, not forks.** New inputs / outputs / AI providers / workflows are
    plugins against stable contracts, never engine rewrites.
13. **Workspaces organize.** Projects, Workflows, Templates, Jobs and Settings
    belong to a workspace; the schema is workspace-aware from v0.4 even though
    switching arrives in v0.7.

---

## 9. Success metrics (how we know it's working)

- Adding one `.kmz` to a watched folder updates the destination **automatically
  and safely** (draft generated, reviewable, applyable) with zero manual steps.
- A non-technical employee can complete an import **without reading
  documentation**.
- No destination file is ever modified before the user reviews a draft.
- The agency can stop maintaining the Excel `العقارات` sheet by hand.

---

*Next: [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) · [ROADMAP.md](ROADMAP.md) · [DECISIONS.md](DECISIONS.md) · [PLAN.md](PLAN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_MODEL.md](DATA_MODEL.md) · [OPERATIONS.md](OPERATIONS.md)*
