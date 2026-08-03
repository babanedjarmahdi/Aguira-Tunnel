# TerraFlow — Decisions Log

> Every decision that affects how the system behaves is recorded here with its
> rationale and, when relevant, the date it was made. If a decision changes, add
> a new entry — never rewrite history.

---

## D1 — Standard JSON is the single source of truth

**Status:** Active.

The canonical representation of a property is the Standard JSON record
(`sourceFile`, `placemarkIndex`, `name`, `areaM2`, `description`, coords, `ai`).
PostgreSQL is the indexed query view; Excel is an export view — never the master.
Every import format is normalized to Standard JSON before anything else happens.

## D2 — Never overwrite originals

**Status:** Active, with one sanctioned exception (see D7).

The pipeline writes a **new** Excel file (`fill`, copy-fill) or reads the
template as read-only. The customer's original workbook is never modified except
by the explicit in-place fill command.

## D3 — Engine owns business logic; UI/API are thin adapters

**Status:** Active.

All pipeline/business logic lives in `@terraflow/engine` (and the packages it
uses). The REST API (`apps/api`) and future frontends only adapt the engine's
output — they must not re-implement business rules. The engine communicates via
structured events so any consumer can attach without the engine knowing about it.

## D4 — AI provider abstraction; Groq only, no new providers for now

**Status:** Active.

The engine depends on the `AIProvider` interface
(`packages/ai/src/provider.js`), not on Groq directly. Only the Groq adapter is
implemented. New providers are **not** added until a concrete need exists; the
interface is the extension point (see ROADMAP v0.5).

## D5 — Monorepo layout: `packages/*` + `apps/*`

**Status:** Active.

Reusable logic → `packages` (`shared`, `ai`, `excel`, `database`, `engine`);
deployable products → `apps` (`api`, later `web`). npm workspaces, ESM, Node 24.

## D6 — Static IDs replicating the template's `ROUND(F/1M)` scheme

**Status:** Active (in-place fill).

The original Excel generates column-A IDs with `ROUND(F/1M)`. Because we write
**text** prices (e.g. `4.4B`, `حسب الكور`) into column F — which would break that
formula — the in-place fill instead writes static IDs
(`prefix + area + price-in-M + letter suffix`, e.g. `L4585`, `?120040`) that
replicate the formula's output. Copy-fill uses its own generated IDs
(`prefix + area + sequence`).

## D7 — In-place fill of the customer's original Excel is a sanctioned exception

**Status:** Active (must remain explicit + backed up).

Writing into the customer's workbook violates D2 by design — it was an explicit
user request (June 2026 batch). Conditions for doing it again:
1. Explicit user instruction, and
2. A forced backup of the original before writing
   (`output/backup/*_before_fill.xlsx`), and
3. Prefer `fill` (copy) whenever a copy is acceptable.

## D8 — Excel shared-formula masters: promote clones before clearing

**Status:** Active.

exceljs consolidates consecutive identical formula cells into shared-formula
ranges (master + clones). Clearing a master without fixing its clones makes save
fail with `Shared Formula master must exist above and or left of clone`. Before
clearing a master cell in a fill, `clearCellForFill` promotes its clones to
standalone formulas. Output for new rows stays blank (matching previous
behavior); template rows below keep their formula.

## D9 — Prices: two distinct representations

**Status:** Active.

- **`fill` (copy):** numeric DA price in column F (`price_in_million × 10000`,
  or per-meter math) — feeds the template's formulas and dashboards.
- **`fill:original` (in-place):** the as-written display price (Arabic verbatim
  like `حسب الكور`, `4.4B`, ranges) so the customer sees exactly what the pin says.

Both derive from the same `ai` fields; `packages/excel` owns both formatters.

## D10 — AI stage is resume-safe and paced

**Status:** Active.

The AI stage caches results keyed by `sourceFile@placemarkIndex`, writes
incrementally, and throttles to the Groq free-tier TPM limit. Re-running the
pipeline never re-pays for already-extracted properties.

---

*Next: [ROADMAP.md](ROADMAP.md) · [VISION.md](VISION.md) · [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md)*
