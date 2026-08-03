# TerraFlow — Architecture

This document describes both the **current** architecture (Phase 1, working
today) and the **target** architecture the codebase is designed to grow into.

---

## 1. Current architecture (Phase 1)

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                         TERRAFLOW (Node.js)                        │
 │                                                                    │
 │   src/lib/           src/scripts/                                  │
 │   ├── kmz.js         ├── stage1_extract.js   (extract + dedupe)    │
 │   ├── extractor.js   ├── stage2_ai.js        (Groq enrichment)     │
 │   ├── ai.js          ├── stage1_loaddb.js    (PostgreSQL upsert)   │
 │   │                  ├── stage2_fill.js      (Excel append)        │
 │   │                  └── watch.js            (file watcher)        │
 └──────────┬─────────────────────────────────────────────────────────┘
            │
   ┌────────┴─────────┐   ┌──────────────────┐   ┌──────────────────┐
   │ SOURCE_KMZ_DIR   │   │ PostgreSQL 16    │   │ EXCEL_TEMPLATE   │
   │ (Google Earth    │   │ (Docker)         │   │ (CRM workbook)   │
   │  folder, .kmz)   │   │ terraflow DB     │   │ copy is written  │
   └──────────────────┘   └──────────────────┘   └──────────────────┘
            │
   ┌────────┴─────────┐   ┌──────────────────┐
   │ DONE_KMZ_DIR     │   │ output/          │
   │ (processed copy) │   │ json/, excel/,   │
   └──────────────────┘   │ watcher.log      │
                          └──────────────────┘
```

### Modules (src/lib)

| File | Responsibility |
|---|---|
| `src/lib/kmz.js` | Unzip `.kmz` → `doc.kml`; parse KML (incl. multi-Placemark Folders); read area from the name (`parseAreaFromName`); normalize Arabic text. |
| `src/lib/extractor.js` | `extractAll(sourceDir)` — read all KMZ files, parse them, smart-dedupe (group by area+coords, then normalized description), return `{ properties, removed, failures }`. |
| `src/lib/ai.js` | Groq client. `extractPropertyWithAI()` with retry/backoff on 429; `pacingDelayMs()` throttle for free-tier TPM; `computePriceDzd()` price conversion. |

### Pipeline scripts (src/scripts)

| Script | Input | Output | Purpose |
|---|---|---|---|
| `stage1_extract.js` | `SOURCE_KMZ_DIR/*.kmz` | `output/json/properties.json` + `output/json/dedupe_report.txt` | Parse all KMZ, dedupe, copy processed files to `DONE_KMZ_DIR`. |
| `stage2_ai.js` | `properties.json` | `output/json/properties_ai.json` | AI-extract structured fields. Resume-safe (caches by `sourceFile@placemarkIndex`), writes incrementally, throttles. |
| `stage1_loaddb.js` | `properties.json` (+ `properties_ai.json` if present) | PostgreSQL `properties` table | Full sync: delete stale rows (source file gone), upsert current set with AI fields. |
| `stage2_fill.js` | `properties_ai.json` | `output/excel/CRM_GPT_Immobilier_Employees_V8_10_2_2_filled.xlsx` | Append rows to a **copy** of the template starting after the last real data row (row 27+). Generates IDs, computes prices, continues `ID_مساعد`. |
| `watch.js` | — | `output/watcher.log` | Watch `SOURCE_KMZ_DIR` for `.kmz` add/remove, debounce 1.5 s, run the whole pipeline, log to `watcher.log`. Runs once at startup. |

### The watcher (live sync)

`watch.js` is the operator-facing entry point. When a `.kmz` appears or
disappears it re-runs the full chain in order:

```
extract → AI (only new files; cached ones skip) → DB (upsert + prune) → Excel
```

It guards against overlapping runs (`running` flag) and debounces burst events
(1.5 s). This is how the Excel output stays in sync with the Google Earth folder
with zero manual steps.

---

## 2. Target architecture

The forward-looking blueprint (modules, data flow, API strategy, AI layer,
scalability, SaaS evolution, roadmap) is the CTO document:

> **[ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md)** — the full 19-section
> platform architecture.

Key decisions that apply from today:

- **Standard JSON is the source of truth** (not Excel, and not even Postgres —
  Postgres is the queried materialization). See [STANDARD_JSON.md](STANDARD_JSON.md).
- **Sync becomes a service**: the watcher moves into the API process (or a small
  worker) so triggers are file change, scheduled, or `POST /api/sync`.
- **React + Node + Postgres** is the agreed stack — everything added so far
  (ESM, `pg`, JSON outputs) is forward-compatible with it.
- **Geo queries** can use PostGIS later; for now `lat`/`lon` columns + an index
  are enough.
- **The AI layer is provider-independent**; today Groq, tomorrow any provider.

---

## 3. Data flow in detail (current)

### Stage 1 — extract
1. Read every `.kmz` in `SOURCE_KMZ_DIR`.
2. Unzip, find the `.kml`, parse to `{ name, description, lon, lat, alt, lookAt }`.
3. `parseAreaFromName(name)`: extract area from the file name, e.g.
   `150م` → 150, `1 هكتار` → 10 000, Arabic-Indic digits `۱۵۰م` → 150.
4. Dedupe:
   - Group by `areaM2 @ lat,lon` (coords rounded to 5 decimals).
   - Within a group, group again by normalized Arabic description.
   - Keep the shortest filename as representative; the rest are "removed".
5. Sort by area, write `properties.json`.

### Stage 2 — AI
1. For each property, call Groq with the system prompt + `NAME:`/`DESCRIPTION:`.
2. Parse the JSON response into `{ property_type, status, location, area_m2,
   price_in_million, price_per_meter, price_note, owner_name, phone, notes }`.
3. Cache by `sourceFile@placemarkIndex` so re-runs only pay for new rows.
4. Throttle between calls (`pacingDelayMs`), retry 429 with exponential backoff.

### Stage 1b — DB load
1. Delete rows whose `source_file` is no longer in the current JSON.
2. Upsert every property on `(source_file, placemark_idx)`.
3. Compute `price` (DA) from AI values (see `DATA_MODEL.md`).

### Stage 2b — Excel fill
1. Copy the template workbook.
2. Find the first empty row after the real data (starts at row 27).
3. For each AI-enriched property, fill columns A–N (see `DATA_MODEL.md`).
4. Write to `output/excel/..._filled.xlsx`.

---

*Back to [VISION.md](VISION.md) · Forward: [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) · Next: [DATA_MODEL.md](DATA_MODEL.md)*
