# TerraFlow — Standard JSON Contract

The **Standard JSON is the single source of truth** for TerraFlow. Every layer —
PostgreSQL, Excel export, REST API, future integrations — is derived from it.

This document defines the versioned contract. **Forward compatibility rule:
add fields, never rename or remove existing ones.** Bump `schemaVersion` when a
breaking change is unavoidable.

**Current version:** `1`

---

## 1. Version 1 — Property record

The import pipeline emits an array of records. Each record has a **raw** part
(from the KMZ) and an optional **ai** part (enrichment).

### 1.1 Raw record (`properties.json`)

```json
{
  "schemaVersion": 1,
  "sourceFile": "150م.kmz",
  "placemarkIndex": 0,
  "name": "150م",
  "areaM2": 150,
  "description": "أرض في صالوحة ...",
  "lat": 36.362,
  "lon": 3.155,
  "alt": 100
}
```

| Field | Type | Nullable | Origin | Notes |
|---|---|---|---|---|
| `schemaVersion` | int | no | contract | Currently `1` |
| `sourceFile` | string | no | KMZ | Name of the source `.kmz` |
| `placemarkIndex` | int | no | KML | Index of the Placemark within the file |
| `name` | string | yes | KML | Raw pin name (e.g. `150م`) |
| `areaM2` | number | yes | derived | Area in m², parsed from `name` (`1 هكتار` → 10000) |
| `description` | string | yes | KML | Raw Arabic free text — **never overwritten** |
| `lat` / `lon` | number | yes | KML | GPS coordinates |
| `alt` | number | yes | KML | Altitude |

### 1.2 AI enrichment (`properties_ai.json`)

The AI stage adds an `ai` object to each record:

```json
{
  "schemaVersion": 1,
  "sourceFile": "150م.kmz",
  "placemarkIndex": 0,
  "name": "150م",
  "areaM2": 150,
  "description": "أرض في صالوحة ...",
  "lat": 36.362,
  "lon": 3.155,
  "alt": 100,
  "ai": {
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
}
```

On failure the `ai` field is `null` and `aiError` carries the message (not part
of the stable contract — for diagnostics only).

---

## 2. AI field semantics

| Field | Meaning | Rules |
|---|---|---|
| `property_type` | `أرض` · `منزل` · `كراج` · `محل تجاري` · `فيلا` · `شقة` · `مزرعة` · `كركاس` · `منزل سومي فيني` · `سومي فيني افونسي` | `null` if unknown |
| `status` | `متوفر` (default) · `للإيجار` · `مباع` | from text when mentioned |
| `location` | Neighborhood/area (Arabic) | verbatim |
| `area_m2` | Numeric area in m² | only if present |
| `price_in_million` | Price quoted as `X مليون` | numeric X |
| `price_per_meter` | Price quoted as `X للمتر` | numeric X |
| `price_note` | Exact Arabic price phrase | verbatim |
| `owner_name` | Owner/person name | verbatim |
| `phone` | Phone number, digits | normalized `.` and spaces |
| `notes` | Short Arabic summary of the rest | verbatim, concise |

**Hard rule:** absent → `null`. Never invent values.

---

## 3. Price conventions (derived, not stored raw)

Applied at the boundary (DB load / Excel fill) from the AI fields:

```
"X مليون"      →  X × 10 000 DA
"N للمتر"      →  (N < 100  ? N × 1000 DA/m² : N DA/m²)  ×  area_m2
```

Example: `900 مليون` → `9 000 000 DA`; `24 للمتر` with 500 m² → `12 000 000 DA`.

---

## 4. Deterministic property IDs

Derived from `property_type` + `area_m2` + sequence, using the type→prefix map
(see [DATA_MODEL.md](DATA_MODEL.md) §3):

```
<prefix><area m²><sequence>      e.g. L4001, H802, G304
```

On collision a letter suffix is appended (`L4001A`). Existing workbook IDs are
collected first to avoid collisions.

---

## 5. Future versions

- **v2** (planned): add `photos[]`, `documents[]`, `published` (public-website
  flag), `tenantId` (SaaS). All **additive**.
- **v3+**: per-module contracts (`client`, `visit`, `task`) will reuse the same
  conventions (schemaVersion, nullable semantics, Arabic-first).

---

*Back to [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) · See also: [DATA_MODEL.md](DATA_MODEL.md), [PLAN.md](PLAN.md)*
