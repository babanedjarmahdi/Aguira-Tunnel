# TerraFlow

CRM real-estate pipeline: **KMZ → JSON → PostgreSQL → AI-filled Excel**.

Part of the TerraFlow CRM project. Converts Google Earth `.kmz` (property pins) into a structured property database and automatically fills the CRM Excel workbook.

## How it works

1. **Extract** — unzips every `.kmz` in the source folder, parses the `doc.kml`, pulls out name / area / Arabic description / GPS coordinates, and de-duplicates near-identical files.
2. **AI (Groq)** — sends each description to the Groq API to extract structured fields: property type, status, location, area, price, owner name, owner phone, notes. Applies the Algerian price convention (e.g. `900 مليون` → `9,000,000 DA`, `24 للمتر` → `24,000 DA/m²`).
3. **Database** — upserts everything into PostgreSQL (Docker).
4. **Excel** — appends the enriched properties as new rows to a copy of your `العقارات` workbook, generating IDs like `L4001`, `H802`, `K304`, and continuing the `ID_مساعد` counter.

## What's new: live file watcher

`src/scripts/watch.js` watches the source KMZ folder. When you **add** or **remove** a `.kmz` file, TerraFlow automatically re-syncs:

- JSON extraction
- AI enrichment (only new files; already-processed ones are cached)
- PostgreSQL (rows for removed files are deleted)
- The filled Excel copy

Run it with:

```bash
npm run watch
```

## Setup

```bash
npm install            # install dependencies
cp .env.example .env   # fill in GROQ_API_KEY + paths
docker compose up -d   # start Postgres
npm run stage1:extract # unzip + parse + dedupe -> output/json/properties.json
npm run stage1:loaddb  # JSON -> PostgreSQL
npm run stage2:parse-ai # enrich descriptions via API -> output/json/properties_ai.json
npm run stage2:fill    # append rows to a copy of the Excel template
```

## Pipeline scripts

```bash
npm run stage1:extract   # kmz -> json
npm run stage1:loaddb    # json -> postgres
npm run stage2:parse-ai  # json + API -> properties_ai.json
npm run stage2:fill      # properties_ai.json -> xlsx
npm run watch            # watch source folder, auto re-sync on add/remove
```

## Outputs

All generated data lives under `output/` (git-ignored):

```
output/json/properties.json        # parsed, de-duplicated properties
output/json/properties_ai.json     # same, with AI-enriched fields
output/excel/..._filled.xlsx       # filled copy of your workbook
output/watcher.log                 # file-watcher activity log
```

## PostgreSQL schema

`schema.sql` creates the `properties` table with:

- `source_file` + `placemark_idx` (unique)
- `name`, `area_m2`, `description`, `lat`, `lon`, `alt`
- AI-enriched fields: `property_type`, `status`, `location`, `price`, `price_note`, `owner_name`, `seller`, `owner_phone`, `notes`, `ai_raw`

## Note

The API key and local file paths are stored in `.env` (git-ignored) — never commit them.