# TerraFlow — Data Model

All the conventions that make TerraFlow's data deterministic. Every stage of the
pipeline relies on these rules, and the future API/web app must keep them.

---

## 1. PostgreSQL schema (`schema.sql`)

Table **`properties`** — one row per property.

| Column | Type | Source | Notes |
|---|---|---|---|
| `id` | UUID (PK) | auto | `gen_random_uuid()` |
| `source_file` | TEXT | Stage 1 | Name of the source `.kmz` |
| `placemark_idx` | INT | Stage 1 | Placemark index within the file |
| `name` | TEXT | Stage 1 | Raw pin name (e.g. `150م`) |
| `area_m2` | NUMERIC | Stage 1 | Area in m², parsed from name |
| `description` | TEXT | Stage 1 | Raw Arabic free text (never overwritten) |
| `lat` / `lon` / `alt` | DOUBLE PRECISION | Stage 1 | GPS coordinates |
| `property_type` | TEXT | Stage 2 (AI) | e.g. `أرض`, `منزل`, `كراج`… |
| `status` | TEXT | Stage 2 (AI) | `متوفر`, `للإيجار` (sold handled later) |
| `location` | TEXT | Stage 2 (AI) | Neighborhood/area name (Arabic) |
| `price` | NUMERIC | derived | Total price in **DZD** |
| `price_note` | TEXT | Stage 2 (AI) | Exact Arabic price phrase |
| `owner_name` | TEXT | Stage 2 (AI) | Owner/person name |
| `seller` | TEXT | Stage 2 (AI) | Seller label (`مع المالك` in Excel) |
| `owner_phone` | TEXT | Stage 2 (AI) | Phone number |
| `notes` | TEXT | Stage 2 (AI) | Short Arabic summary of the rest |
| `ai_raw` | JSONB | Stage 2 (AI) | Full raw AI JSON (audit / re-derivation) |
| `created_at` | TIMESTAMPTZ | auto | `now()` |

**Constraints / indexes**

- `UNIQUE (source_file, placemark_idx)` — the dedupe identity.
- `INDEX (name)`, `INDEX (lat, lon)` — lookup and geo.
- `pgcrypto` extension for `gen_random_uuid()`.

---

## 2. Area parsing (`parseAreaFromName`)

Applied to the **pin name** (the file name of the KMZ):

| Input | Result | Rule |
|---|---|---|
| `150م` | 150 | first number |
| `1200م` | 1200 | first number |
| `1 هكتار` | 10 000 | `هكتار` → × 10 000 m² |
| `۱۵۰م` (Arabic-Indic) | 150 | digits normalized to Western |

Note: the current implementation returns the first number as-is (m² already).

---

## 3. Property type → ID prefix (`TYPE_PREFIX`)

Used by `stage2_fill.js` to build the deterministic property ID:

| Property type (Arabic) | Prefix |
|---|---|
| `منزل` | `H` |
| `أرض` | `L` |
| `كركاس` | `K` |
| `كراج` | `G` |
| `محل` / `محل تجاري` | `M` |
| `شقة` | `A` |
| `مزرعة` | `F` |
| `منزل سومي فيني` | `S` |
| `سومي فيني افونسي` | `SA` |
| (unknown) | `H` (fallback) |

### ID format

```
<prefix><area m²><sequence>
```

Example: `L4001` = أرض, 400 m², first one; `H802` = منزل, 80 m², second one.

- Sequence increments per `prefix+area` bucket.
- If a generated ID already exists (collision), a letter suffix is appended
  (`L4001`, `L4001A`, …).
- Existing IDs in the workbook are collected first to avoid collisions.

---

## 4. Price conventions (DZD)

Prices in the source are in **centimes/millions**. Conversion rules
(`computePriceDzd`):

### 4.1 `"X مليون"` (million)
```
price = X × 10 000 DA          (X million centimes → DA)
```
e.g. `900 مليون` → `9 000 000 DA`.

### 4.2 `"N للمتر"` (per meter)
- `N < 100` → interpreted as **thousands of DA/m²**: `N × 1 000 DA/m²`
  e.g. `24 للمتر` → `24 000 DA/m²`.
- `N ≥ 100` → interpreted **literally in DA/m²**: e.g. `2700 للمتر` → `2 700 DA/m²`.
- Total = `per-meter price × area_m2` (only when area is known).

### 4.3 No price
`price` stays `NULL`.

---

## 5. AI-extracted fields (Groq) — the canonical keys

`ai_raw` is a JSONB object with exactly these keys:

```json
{
  "property_type": "أرض",
  "status": "متوفر",
  "location": "صالوحة",
  "area_m2": 1500,
  "price_in_million": 9,
  "price_per_meter": null,
  "price_note": "طالب 900 مليون",
  "owner_name": "بوصبع مصطفى حسين",
  "phone": "0551234567",
  "notes": "فيها 50 نخلة + 50 زيتون، فيها بستان"
}
```

Rules the AI must follow:

- `status`: `متوفر` (default), `للإيجار`, or `مباع` when the text says so.
- `price_in_million` vs `price_per_meter`: mutually exclusive, set only when
  the phrase matches. `price_note` always keeps the verbatim Arabic phrase.
- Keep Arabic text verbatim in `location`, `owner_name`, `notes`.
- `null` for anything truly absent — **never invent values**.

---

## 6. Excel columns (العقارات sheet)

Header row is row **3**. Data rows start at row **4**; new rows append after the
last real row (row 27+ today). Columns:

| Col | Header (Arabic) | Meaning | Written by fill |
|---|---|---|---|
| A | `معرف العقار` | Property ID | `genId()` |
| B | `نوع العقار` | Property type | `ai.property_type` |
| C | `حالة العقار` | Status | `متوفر` / `للإيجار` |
| D | `الموقع/العنوان` | Location | `ai.location` |
| E | `المساحة (م²)` | Area m² | `ai.area_m2` ?? `areaM2` |
| F | `السعر المطلوب` | Price (DA) | `computePriceDzd()` |
| G | `اسم المالك` | Owner name | `ai.owner_name` |
| H | `البائع` | Seller | `مع المالك` |
| I | `رقم المالك` | Owner phone | `ai.phone` |
| J | `ملاحظات` | Notes | `المالك: … \| … \| السعر: …` |
| K | `تاريخ الإضافة` | Add date | Excel date serial (`floor(today)`) |
| L | `ID_مساعد` | Sequential ID | `row - 3` |
| M | `تطابق` | Match flag | `null` (future) |
| N | `تاريخ البيع` | Sale date | `null` (future) |

### Excel date serial

```
serial = (date.getTime() - Date.UTC(1899, 11, 30)) / 86400000
```
(1899-12-30 epoch handles the 1900 leap-year bug; `Math.floor` drops the time.)

### Excel output path
`output/excel/CRM_GPT_Immobilier_Employees_V8_10_2_2_filled.xlsx`

The original template file is **never overwritten** — the pipeline always writes
a copy, because the original is frequently open/locked in Excel (lock file
`~$CRM_GPT...xlsx`).

---

## 7. JSON file formats

### `output/json/properties.json` (Stage 1)
```json
[{
  "sourceFile": "150م.kmz",
  "placemarkIndex": 0,
  "name": "150م",
  "areaM2": 150,
  "description": "أرض في صالوحة ...",
  "lat": 36.362,
  "lon": 3.155,
  "alt": 100
}]
```

### `output/json/properties_ai.json` (Stage 2)
Same as above with `ai` (see §5) and optionally `aiError` for failures.

---

*Back to [ARCHITECTURE.md](ARCHITECTURE.md) · Next: [OPERATIONS.md](OPERATIONS.md)*
