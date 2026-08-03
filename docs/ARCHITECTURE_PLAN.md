# TerraFlow — Architecture Plan

> **Role:** Senior Software Architect / Product Architect blueprint.
> **Status:** Planning document — describes *what* and *why*, not implementation code.
> **Scope:** The complete product architecture for a platform that will evolve
> over several years, from a KMZ import pipeline to a SaaS real-estate OS.

---

## 1. Product Vision

TerraFlow is a **modern real-estate operating system**.

Its goal is **not** simply to replace Excel. Its goal is to:

- **Reduce cognitive load** — the user never has to remember "which sheet had the
  price of that 900-million plot in صالوحة".
- **Eliminate repetitive work** — importing pins, extracting fields, re-typing
  data into reports.
- **Centralize information** — one database for properties, clients, visits,
  tasks, documents, and follow-ups.
- **Become the operational brain** of a real-estate agency.

Every feature must answer one question:

> **"Does this reduce mental effort or save time for the user?"**

If a feature does not, it does not ship.

---

## 2. Core Philosophy

1. **We are NOT building a CRM first.** We are solving one painful workflow at a
   time. The CRM emerges naturally from solving real operational problems.
2. **Do not replace Excel abruptly.** The company runs on Excel — formulas,
   multi-sheet workflows, years of accumulated process. Migration is **gradual**
   and **two-way compatible** (Excel import AND Excel export).
3. **The first pain point is the KMZ import.** Solved and shipped (Phase 1).
4. **Standard JSON is the single source of truth.** Everything else (PostgreSQL,
   Excel export, REST API, future integrations) is derived from it.
5. **The import pipeline stays independent of the CRM.** It is a module, not a
   feature of the CRM.

---

## 3. System Architecture

Clean, modular architecture. Every module is independent with clear
responsibilities. **No monolithic business logic.**

```
                    ┌───────────────────────────────┐
                    │      TERRAFLOW PLATFORM        │
                    └──────────────┬────────────────┘
                                   │
        ┌──────────────┬───────────┴────────────┬─────────────────┐
        │              │                        │                 │
   ┌────▼─────┐  ┌─────▼──────┐  ┌──────────────▼───┐   ┌─────────▼─────────┐
   │ Import   │  │ Properties │  │ Clients & Leads  │   │      AI           │
   │ module   │  │ module     │  │ module           │   │  module (swappable)│
   └────┬─────┘  └─────┬──────┘  └──────────────┬───┘   └─────────┬─────────┘
        │              │                        │                 │
   ┌────▼──────────────▼────────────────────────▼─────────────────▼───────┐
   │                    STANDARD JSON (canonical)                          │
   │            versioned, validated, immutable source of truth            │
   └───────┬───────────────────┬───────────────────┬──────────────────────┘
           │                   │                   │
   ┌───────▼────┐       ┌──────▼─────┐      ┌──────▼──────┐
   │ PostgreSQL │       │ Excel      │      │ REST API    │
   │ (primary)  │       │ export     │      │ (future)    │
   └────────────┘       └────────────┘      └─────────────┘
```

**Principles**
- Modules communicate through the canonical JSON and through the database — never
  by reaching into each other's internals.
- The AI layer is **provider-independent** and replaceable.
- The database schema, API, and UI are each driven by the same domain model,
  defined once (in the Standard JSON contract) and mapped per-layer.

---

## 4. Folder Structure

The current repo grows into a monorepo with clear seams:

```
CRM_PRO/
  package.json
  .env                # git-ignored secrets & paths
  .env.example
  schema.sql          # DB bootstrap (initial)
  docker-compose.yml  # Postgres today, +api/+web later

  src/
    lib/              # pure domain logic, no I/O side effects
      kmz.js          #   KMZ → KML → parsed placemarks
      extractor.js    #   dedupe + Standard JSON builder
      ids.js          #   deterministic property ID generation
      pricing.js      #   Algerian price conventions
    ai/               # provider-independent AI layer
      provider.js     #   interface contract
      groq.js         #   Groq implementation
      openrouter.js   #   future implementation
      prompt.js       #   system prompts, field schema
    db/
      client.js       #   pg pool wrapper
      migrations/     #   versioned SQL migrations
      repositories/   #   data access per module
    modules/          # one folder per module
      import/         #   pipeline orchestration
      properties/
      clients/
      tasks/
      calendar/
      files/
      auth/
      notifications/
      reporting/
    server/           # Express app (Phase 2+)
      routes/
      middleware/
    scripts/          # one-shot CLI pipeline stages (today's entry points)
      stage1_extract.js
      stage2_ai.js
      stage1_loaddb.js
      stage2_fill.js
      watch.js

  web/                # React app (Phase 3+)
  docs/               # this documentation suite
  output/             # generated artifacts (git-ignored)
    json/
    excel/
    watcher.log
```

---

## 5. Module Responsibilities

| Module | Responsibility | Not responsible for |
|---|---|---|
| **Import** | KMZ → Standard JSON → DB; dedupe; AI enrichment trigger; file watcher | Business rules of selling |
| **Properties** | CRUD, status lifecycle, pricing, search/filter, geo, photo gallery | Client relationship management |
| **Clients** | Buyers/sellers/investors, preferences, history, lead scoring | Property data |
| **Tasks** | Todo items, assignment, due dates, follow-ups | Calendar scheduling |
| **Calendar** | Appointments, visits, reminders, availability | Task definitions |
| **AI** | Field extraction, classification, matching suggestions; **provider-agnostic** | Persistence |
| **Files** | Images, documents, contracts; upload, metadata, access control | Content of the documents |
| **Authentication** | Login, roles, permissions, session/JWT | User preferences |
| **Notifications** | In-app + optional WhatsApp/email alerts for follow-ups & visits | Message content creation |
| **Reporting** | Dashboards, KPIs, exports (Excel/PDF) | Data ownership |

Every module has: a **contract** (JSON), **storage** (tables/repository), an
**API surface** (later), and a **UI slice** (later). Modules are independently
testable and independently replaceable.

---

## 6. Data Flow

```
KMZ file added to Google Earth folder
        │  (fs.watch on SOURCE_KMZ_DIR)
        ▼
Import module: unzip → KML → parse → dedupe
        │
        ▼
Standard JSON  v1   (output/json/properties.json)
        │
        ▼
AI module (provider-independent, Groq today)
        │  enrich each record with ai object
        ▼
Standard JSON + ai (output/json/properties_ai.json)
        │
        ├─────────────►  PostgreSQL  (properties table)
        │                      │
        │                      ▼
        │              REST API (Phase 2+) ──► React web (Phase 3+)
        │
        └─────────────►  Excel export (filled copy, never the original)
```

At every arrow, the data is **validated against the Standard JSON contract**.
The pipeline is **idempotent** — re-running produces the same result; the AI
stage caches by `sourceFile@placemarkIndex`; the DB load is an upsert; the Excel
fill is append-only.

---

## 7. Import Pipeline

```
KMZ ──► KML ──► Standard JSON ──► AI Extraction ──► Database
```

1. **KMZ → KML**: unzip (`.kmz` is a ZIP), locate `doc.kml`, support multi-
   Placemark Folders.
2. **KML → records**: parse `name`, `description`, `coordinates` (lon/lat/alt).
3. **Dedupe**: group by area + coords, then by normalized Arabic description;
   keep one representative; log the filtered duplicates.
4. **Standard JSON**: validate against the versioned contract (see
   [STANDARD_JSON.md](STANDARD_JSON.md)). This JSON is the **single source of
   truth** and is persisted as-is.
5. **AI extraction**: enrich with structured fields (type, status, location,
   price, owner, phone, notes). AI output is stored separately (`ai` object) and
   never mutates the raw source text.
6. **Persistence**: upsert into PostgreSQL; delete rows whose source file no
   longer exists.

**Independence:** the pipeline never imports CRM code. A future integration
(e.g., batch upload from a shapefile) plugs into the Import module and emits the
same Standard JSON.

---

## 8. Database Strategy

- **PostgreSQL** is the operational database.
- **Standard JSON is the interchange truth.** Postgres is a *materialized,
  indexed* view of that truth for querying. Raw JSON (`ai_raw`, and the source
  JSON) is preserved for audit and re-derivation.
- **Schema:** `schema.sql` bootstraps the `properties` table today. From Phase 2,
  versioned migrations (`db/migrations/`) manage evolution. A suggested layout:

```
properties   (id, source_file, placemark_idx, name, area_m2, description,
              lat, lon, alt, property_type, status, location, price,
              price_note, owner_name, seller, owner_phone, notes, ai_raw,
              created_at, UNIQUE(source_file, placemark_idx))
clients      (id, name, phone, type [buyer|seller|investor], preferences,
              hotness, notes, created_at)
visits       (id, property_id, client_id, scheduled_at, outcome, notes)
tasks        (id, assignee_id, due_at, priority, status, property_id?, client_id?)
users        (id, name, email, password_hash, role)
files        (id, entity_type, entity_id, storage_key, mime, size, created_at)
```

- **Geo:** `lat`/`lon` columns + index today. **PostGIS** (`geography(Point)`)
  is a planned, non-breaking addition for radius searches and distance sorting.
- **Excel migration:** Excel remains a supported input (import existing rows into
  the DB once) and output (filled copy). Two-way compatibility removes the fear
  of migration.
- **Backups:** Docker volume snapshot + `pg_dump` as a scheduled task.

---

## 9. API Strategy

- **REST, versioned** (`/api/v1/...`). Express modular routers, one per module.
- JSON in/out matching the Standard JSON naming where applicable.
- **Endpoints that will matter:**

```
GET    /api/v1/properties?type=&status=&area_min=&area_max=&price_min=&price_max=&location=&q=
GET    /api/v1/properties/:id
POST   /api/v1/properties
PUT    /api/v1/properties/:id
GET    /api/v1/properties/geo            # all points for the map
GET    /api/v1/clients
POST   /api/v1/clients
GET    /api/v1/visits?from=&to=
POST   /api/v1/visits
GET    /api/v1/stats/dashboard
POST   /api/v1/sync                      # trigger import pipeline
```

- **Auth middleware** protects internal routes (Phase 5). The **public website**
  reads only a dedicated public subset (selected properties).
- **Validation** at the boundary using the Standard JSON contract schema.

---

## 10. AI Layer Design

The AI layer is **provider-independent and replaceable**:

```
src/ai/provider.js      # the interface
  { name, model, extract(record, prompt) -> structured json }

src/ai/groq.js          # today's implementation (fetch -> chat/completions)
src/ai/openrouter.js    # tomorrow (same interface)
src/ai/local.js         # later (same interface)
```

- Today: **Groq**, model `llama-3.3-70b-versatile`, key in `.env`.
- Tomorrow: **OpenRouter, OpenAI, or local models** — switching providers changes
  one file, not the system.
- The provider is chosen by config (`AI_PROVIDER=groq`). Every provider returns
  the **same normalized JSON schema** (the AI part of the Standard JSON).
- Guardrails: `temperature 0`, `response_format: json_object`, strict prompt
  rules, and a **never-invent-fields** policy. Raw provider output is kept in
  `ai_raw` for audit.
- **Refactor task (later):** extract today's Groq-specific logic in
  `src/lib/ai.js` into `src/ai/*`. Scheduled when a second provider is needed —
  the interface is designed now, the split is mechanical.

---

## 11. Scalability Strategy

- **Modular boundaries first:** modules are isolated now, so they can be split
  into separate processes/services later without rewrites.
- **Import runs async:** long AI batches run as a job, not a request. The watcher
  is the first job runner; later it becomes a worker process.
- **Read-heavy paths are queryable:** Postgres indexes (name, lat/lon, status,
  type) cover the search-engine and dashboard reads.
- **Caching later:** dashboard KPIs and search results can be cached when the
  data volume demands it; the Standard JSON contract makes cache keys stable.
- **Multi-tenant (SaaS):** a `tenant_id` column on every business table and a
  tenant context in the API/auth layer. Designed from the start so Phase "SaaS"
  is adding a column + isolation middleware, not restructuring.

---

## 12. Security Considerations

- **Secrets:** API keys and paths only in `.env` (git-ignored). `.env.example`
  documents placeholders. Never commit secrets.
- **Authentication (Phase 5):** hashed passwords, JWT sessions, role-based access
  (admin / agent).
- **Data separation:** internal data is private. The public website exposes only
  explicitly "published" properties.
- **Tenant isolation (SaaS):** every query scoped by tenant.
- **Files:** uploads validated (type/size), stored outside the app root,
  served through authenticated routes.
- **AI prompts:** no secrets are ever sent to the AI provider; only property
  descriptions.
- **Audit:** keep raw source + AI raw output so any derived value can be
  re-derived and verified.

---

## 13. Development Roadmap

| Phase | Scope | Entry criteria |
|---|---|---|
| **1 — Import pipeline** (✅ done) | KMZ → JSON → AI → DB → Excel + watcher | None (shipped) |
| **2 — API server** | Express REST API over Postgres; move watcher into a service; AI provider abstraction refactor | Schema stable, docs reviewed |
| **3 — Web app** | React: property catalog, filters, map, detail page, add/edit | API covers properties CRUD + search |
| **4 — CRM modules** | Clients, visits/calendar, tasks, follow-up board, deals/sales | Auth & roles (Phase 5) or a single-tenant assumption accepted |
| **5 — Auth & hardening** | Users, roles, audit, backups, migrations tooling | Before any real multi-user deployment |
| **6 — Reporting & dashboard** | KPI dashboards, Excel/PDF exports | Data quality verified |
| **7 — Public website** | Selected properties exposed; internal data stays private | Auth + publish flag |
| **8 — SaaS** | Multi-tenant, onboarding, billing | Product validated with the agency |

---

## 14. MVP Definition

The MVP is **the next slice that saves a real hour per week**: Phase 2 + a
minimal Phase 3 read-only experience.

- One property catalog in the browser with filters (type, area, price, status,
  location) and a map.
- Live sync already working (watcher) — new KMZ pins appear in the app.
- No Excel regression: the filled workbook is still generated.

**Non-goals for MVP:** auth, multi-user, documents, payments, public website.

---

## 15. Future SaaS Evolution

- Each agency is a **tenant** with its own data.
- Per-tenant onboarding = point the importer at their Google Earth folder.
- Monetization: subscription per tenant + per user; optional AI credits.
- The module boundaries and `tenant_id` design make this additive.
- The public website generator becomes a per-tenant, branded portal.

---

## 16. Risks

| Risk | Mitigation |
|---|---|
| **Excel lock-in / fear of migration** | Two-way Excel support; gradual; Excel remains first-class output |
| **AI hallucination on Arabic text** | Strict prompts, `temperature 0`, keep `ai_raw`, manual review workflow, never overwrite source |
| **Import edge cases** (no KML, weird folders, multi-placemark) | Failures are logged, not fatal; dedupe report; resumable stages |
| **Data loss** | Postgres upserts + backups; JSON files are immutable audit trail |
| **Scope creep toward "CRM"** | Solve one workflow at a time; every feature must save time |
| **Single-provider AI lock-in** | Provider interface designed now; refactor scheduled |

---

## 17. Technical Debt to Avoid

- **No monolith business logic** — every rule lives in its module.
- **No AI-specific code outside `src/ai/`** — don't sprinkle Groq calls.
- **No format drift** — one validated Standard JSON schema, never ad-hoc shapes.
- **No direct file writes to the original Excel** — always a copy.
- **No unversioned JSON** — the contract has a `schemaVersion`.
- **No sync without idempotency** — every pipeline stage re-runs safely.
- **No secret leakage** — `.env` stays git-ignored; keys never string-literal'd.

---

## 18. Design Principles

1. **Reduce cognitive load.** Less thinking, less remembering.
2. **Solve one workflow at a time.** Ship it, measure it, move on.
3. **Standard JSON is truth.** Derive everything else.
4. **Modules are independent.** Clear contracts, no shared internals.
5. **AI is replaceable.** Provider-independent by design.
6. **Excel is a citizen, not the enemy.** Two-way, gradual.
7. **Idempotent everything.** Safe to re-run, safe to retry.
8. **Arabic-first.** Data and UI stay Arabic; the system is bilingual-tolerant.
9. **Deterministic IDs.** Stable, human-readable, collision-safe.
10. **Never invent data.** AI extracts, humans decide.

---

## 19. Guiding Rules for Future Development

- Ask before every feature: *"Does this reduce mental effort or save time?"* —
  if not, don't build it.
- Build the **one painful workflow** first; the CRM emerges from the sum.
- Keep the **import pipeline decoupled** from the CRM.
- Keep **Standard JSON forward-compatible**: add fields, never rename/remove.
- Every module needs a **contract, storage, API, UI** — in that order.
- **Postgres is queried, JSON is canonical, Excel is output.**
- The **AI provider is config**, never a hard dependency.
- **Two-way Excel compatibility** until the agency itself says otherwise.
- Document the reasoning, then build. This plan is the reasoning.

---

*Back to [README](../README.md) · Next: [STANDARD_JSON.md](STANDARD_JSON.md) · See also: [PLAN.md](PLAN.md), [VISION.md](VISION.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), [OPERATIONS.md](OPERATIONS.md)*
