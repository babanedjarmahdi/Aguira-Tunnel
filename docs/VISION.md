# TerraFlow — Product Vision & Roadmap

> **Tagline:** From Google Earth pins to a complete real-estate management system.

TerraFlow started as a data-ingestion pipeline that turns Google Earth `.kmz`
files into a structured property database. It is designed to grow into a **full
real-estate management system (CRM)** for the Algerian property market.

This document describes where the project is going. Read it before designing any
new feature so the architecture always stays aligned with the vision.

> **The complete technical blueprint lives in
> [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md).** This file is the product vision;
> that file is the system architecture (modules, data flow, AI layer, scalability,
> SaaS evolution).

---

## 1. The problem we are solving

A real-estate agency works with hundreds of land plots and properties. Today the
data lives in three disconnected places:

1. **Google Earth** — GPS pins with free-text Arabic descriptions (`.kmz` files).
2. **Excel** — a multi-sheet CRM workbook (`CRM_GPT_Immobilier_Employees...xlsx`)
   with dashboards, a search engine, properties, clients, communications and
   daily follow-up.
3. **Human memory / WhatsApp / phone** — owners, sellers, prices, visit notes.

This makes it impossible to answer simple questions like:

- "Which available land in *صالوحة* is under 2000 m²?"
- "Which owner has 3 properties listed and how many visits happened this week?"
- "What is the total value of everything currently for sale?"

TerraFlow centralizes all of this into **one database** and grows the single
workbook into a **real web CRM**.

---

## 2. The final vision (long term)

A full web-based CRM, hosted or on-premise, used by the agency's employees:

| Capability | Description |
|---|---|
| **Property catalog** | Every property: type, status, area, price, GPS, owner, seller, photos, notes. |
| **Client & leads management** | Buyers, sellers, investors; preferences, history, hot/cold status. |
| **Visits & communications** | Scheduled visits, WhatsApp/phone log, follow-up tasks per property/client. |
| **Deals & sales** | Offer → negotiation → sold. Sale price, commission, date of sale. |
| **Search engine** | Fast multi-criteria search (area range, price range, type, location, status). |
| **Dashboard** | KPIs: available inventory value, sold per month, visits per week, top locations. |
| **Team & permissions** | Employees log in; roles (admin, agent); every action tracked. |
| **Maps** | Every property plotted on a map; click a pin → full record. |
| **AI assistance** | Enrich, classify, and match properties; suggest clients for a property. |

The current Excel workbook already contains the seeds of these modules:

- `لوحة التحكم` → Dashboard
- `محرك البحث` → Search engine
- `العقارات` → Property catalog
- `العملاء` → Clients
- `الاتصالات والزيارات` → Communications & visits
- `المتابعة اليومية` → Daily follow-up

TerraFlow's job is to power these with real data instead of manual typing.

---

## 3. Where we are today (Phase 1 — data pipeline)

Everything currently built. This phase is **complete and working**.

```
KMZ files ──► Stage 1 ──► properties.json ──► Stage 2 ──► properties_ai.json
 (Google       extract              │            AI enrich       │
  Earth)       + parse              ▼            (Groq)           ▼
             + dedupe      ┌──────────────┐            ┌───────────────────┐
                           │ PostgreSQL   │◄───────────│ Excel (filled     │
                           │ (Docker)     │            │  copy, row 27+)   │
                           └──────────────┘            └───────────────────┘
```

- 146 source KMZ files → **147 unique properties**, 0 parse failures, 2 duplicates removed.
- AI extraction of 18 structured fields from Arabic free text via Groq.
- Live file watcher that re-syncs DB + Excel whenever a `.kmz` is added or removed.

**Stack:** Node.js 24 (ESM), `exceljs`, `fast-xml-parser`, `adm-zip`, `pg`,
PostgreSQL 16 (Docker), Groq API (`llama-3.3-70b-versatile`).

---

## 4. Phases 2+ — the roadmap

Order matters: each phase builds on the previous one and keeps the data model
compatible.

### Phase 2 — API server
Build a **Node.js + Express (or Fastify) REST API** over the existing PostgreSQL
schema. This becomes the single source of truth that both the pipeline and the
future web app talk to.

- `GET/POST/PUT /api/properties` with filter/query support.
- `GET /api/properties/geo` — all points for the map.
- `GET /api/stats/dashboard` — KPI aggregates.
- A single process hosts the **watcher** (pipeline trigger) so sync is a server feature.

### Phase 3 — Web front-end
A **React** app consuming the API (CRA or Vite):

- **Properties view**: table + cards + filters + map (leaflet / mapbox).
- **Property detail page**: all fields, photos, visit history, owner card.
- **Add/Edit property forms** (replacing manual Excel editing).
- Search-engine page mirroring `محرك البحث`.

### Phase 4 — CRM modules
- **Clients** (`clients` table) with preferences and history.
- **Visits & communications** (`visits`, `communications` tables) linked to
  properties and clients.
- **Daily follow-up** board (today's tasks, overdue follow-ups).
- **Deals/sales** workflow: offer, negotiation, sold.

### Phase 5 — Users, roles & hardening
- Auth (JWT) + roles (admin / agent), audit log.
- Backups, migrations tooling (e.g. `node-pg-migrate`), Docker Compose for the
  whole app (db + api + web).

---

## 5. Guiding principles

1. **PostgreSQL is the source of truth.** Excel is an export view, never the
   master. The pipeline may *write* Excel, the web app may *read* it back, but
   all queries run against the database.
2. **AI is enrichment, not hallucination.** AI fields (`ai_raw`) are stored
   separately and never overwrite the raw source text. Always keep the original
   description.
3. **Idempotent, resumable pipeline.** Every stage can be re-run safely:
   extraction is deterministic, AI stage caches by `sourceFile@placemarkIndex`,
   DB load is an upsert, Excel fill is append-only from a fixed start row.
4. **Arabic-first.** Data is Algerian real-estate Arabic. All UI strings, notes,
   locations, and owner names must stay in Arabic verbatim.
5. **Deterministic IDs.** Property IDs are generated from type + area + sequence
   (see `DATA_MODEL.md`) so they are stable and human-readable across exports.
6. **Never commit secrets.** API keys and local paths live in `.env`
   (git-ignored). Use `.env.example` for documentation.

---

## 6. Success metrics (how we know it's working)

- Adding one `.kmz` to the Google Earth folder updates the DB and Excel
  automatically with **zero manual steps**.
- "Available + area ≤ 2000 m² + near صالوحة" returns correct results in
  < 100 ms from the API.
- The agency can stop maintaining the Excel `العقارات` sheet by hand.

---

*Next: [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) · [PLAN.md](PLAN.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_MODEL.md](DATA_MODEL.md) · [OPERATIONS.md](OPERATIONS.md)*
