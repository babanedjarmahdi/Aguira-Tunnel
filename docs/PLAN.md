# TerraFlow — Execution Plan (KMZ → Database → Excel)

> **Historical document.** This was the original Phase-1 execution plan. Every
> item is now **built and verified**, and the product has since been reframed as
> the TerraFlow Engine (a **workflow engine**, not an Excel tool — Excel is one
> output adapter). The current direction lives in
> [VISION.md](VISION.md) · [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) ·
> [ROADMAP.md](ROADMAP.md) · [STATUS.md](STATUS.md) (the live task tracker).
> This file is kept as a record of how Phase 1 was executed.

The original execution plan for the first TerraFlow module. Every item is now
**built and verified**. Status maps each plan item to the implementing file.

**Input:** 146 KMZ from `Documents\MEGA UPLOAD\GOOGLE EARTH`
**Excel template:** `Desktop\CRM_GPT_Immobilier_Employees_V8_10_2_2.xlsx`
**Build dir:** `C:\Users\USER\Desktop\CRM_PRO`

> **Note on paths.** The `src/lib/*` / `src/scripts/*` references below are the
> Phase-1 locations. The code was later moved into the monorepo packages
> (`packages/shared`, `packages/ai`, `packages/excel`, `packages/database`,
> `packages/engine`) — see [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §4 for the
> current layout.

---

## Stage 1 — Extract → JSON → PostgreSQL

| # | Plan item | Status | Implemented by |
|---|---|---|---|
| 1.1 | **Extract:** unzip each KMZ (`adm-zip`), read `doc.kml` | ✅ | `src/lib/kmz.js` — `extractKmlFromKmz()` |
| 1.2 | **Parse & dedupe:** parse `name`, `description`, `coordinates` (lon/lat/alt) with `fast-xml-parser` | ✅ | `src/lib/kmz.js` — `parseKml()` |
| 1.3 | **Dedupe by content:** group files by area, then compare descriptions (normalized) and coords; keep one representative per unique property, log filtered duplicates | ✅ | `src/lib/extractor.js` — `extractAll()`; report in `output/json/dedupe_report.txt` |
| 1.4 | **JSON:** write `output/json/properties.json` — one object per unique property: `{ sourceFile, name, areaM2, rawDescription, lat, lon, alt }` | ✅ | `src/scripts/stage1_extract.js` |
| 1.5 | **DB:** `docker-compose.yml` (Postgres 16) + `schema.sql` (`properties` table with a `geography(Point)` column) + `pg` loader. Seed of TerraFlow's database | ✅ (with deviation) | `docker-compose.yml`, `schema.sql`, `src/scripts/stage1_loaddb.js` |

**Result (verified):** 147 unique properties, 0 parse failures, 2 duplicates
removed, 147 rows in PostgreSQL.

> **Deviation 1 — `geography(Point)` column:** the plan specified a PostGIS
> `geography(Point)` column. The implemented schema uses `lat`, `lon`, `alt`
> `DOUBLE PRECISION` columns with an index on `(lat, lon)` instead. PostGIS can
> be added later for advanced geo queries (radius search, distance sort) without
> breaking existing data. See [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §8.

> **Deviation 2 — JSON key naming:** plan wrote `rawDescription`; the code uses
> the key `description` (both in `properties.json` and the DB column). The
> normalized version lives in the AI stage. See [STANDARD_JSON.md](STANDARD_JSON.md).

---

## Stage 2 — AI fill Excel (Groq)

| # | Plan item | Status | Implemented by |
|---|---|---|---|
| 2.1 | **AI client:** plain `fetch` → `https://api.groq.com/openai/v1/chat/completions`, model `llama-3.3-70b-versatile`, key in `.env`. Prompt extracts structured fields from the Arabic description → `{ نوع العقار, حالة العقار, الموقع/العنوان, المساحة, السعر, اسم المالك, البائع, رقم المالك, ملاحظات }` | ✅ | `src/lib/ai.js` — `extractPropertyWithAI()`; resume-safe caching in `src/scripts/stage2_ai.js` |
| 2.2 | **Price conversion:** Algerian centime rule ("900 مليون" → 9,000,000 DA; "24 للمتر" → area × 24,000 DA) | ✅ | `src/lib/ai.js` — `computePriceDzd()` |
| 2.3 | **Excel writer** (`exceljs`, preserves formatting): append rows under the row-3 header in the **العقارات** sheet; generate `معرف العقار` (`H####`/`L####`) and `ID_مساعد`; write to a **copy** (original untouched) | ✅ | `src/scripts/stage2_fill.js` |

**Result (verified):** 147 rows appended (rows 27–170, 23 original + 147 new),
all 6 workbook sheets preserved, written to a copy of the template.

---

## Deliverables

| Deliverable | Status | Location |
|---|---|---|
| Working pipeline scripts + TerraFlow project scaffold | ✅ | `C:\Users\USER\Desktop\CRM_PRO` |
| `output/json/properties.json` | ✅ | 147 properties |
| Postgres running in Docker with loaded properties | ✅ | container `terraflow_pg`, 147 rows |
| A filled copy of the Excel for review | ✅ | `output/excel/CRM_GPT_Immobilier_Employees_V8_10_2_2_filled.xlsx` |

---

## Bonus (built beyond the original plan)

| Feature | File |
|---|---|
| Live file watcher — auto re-sync on KMZ add/remove | `packages/engine/src/watch.js` (CLI-only today; service-based watch is v0.4) |
| AI provider abstraction (design only, refactor later) | [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §12 |
| Versioned Standard JSON contract | [STANDARD_JSON.md](STANDARD_JSON.md) |
| Project documentation suite | `docs/` |

---

*Back to [README](../README.md) · Next: [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md)*
