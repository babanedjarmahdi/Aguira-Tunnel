# TerraFlow — Operations

How to set up, run, and troubleshoot TerraFlow on this machine (Windows).

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 (24.x tested) | ESM project (`"type": "module"`) |
| Docker Desktop | 16-alpine image used | For PostgreSQL; daemon sometimes goes offline |
| Git | ≥ 2.x | For the repo (`babanedjarmahdi/TerraFlow`) |
| Groq API key | free plan | `llama-3.3-70b-versatile`, 12 000 TPM |
| Excel | — | Template workbook must not be open when writing |

---

## 2. First-time setup

```powershell
cd C:\Users\USER\Desktop\CRM_PRO

# 1. Install dependencies (use npm.cmd on this machine, not the .ps1 shim)
npm.cmd install

# 2. Create .env from the example (fills with your real key + paths)
Copy-Item .env.example .env
#    edit .env: GROQ_API_KEY, SOURCE_KMZ_DIR, DONE_KMZ_DIR, EXCEL_TEMPLATE

# 3. Start PostgreSQL (Docker)
docker compose up -d

# 4. Run the pipeline
npm.cmd run extract    # kmz → output/json/properties.json (+ dedupe report)
npm.cmd run ai         # + Groq AI → output/json/properties_ai.json
npm.cmd run loaddb     # → PostgreSQL (upsert + prune stale rows)
npm.cmd run fill       # → output/excel/..._filled.xlsx (copy of template)

# 5. Or run everything in one shot
npm.cmd run pipeline   # extract + ai + loaddb + fill
```

### `.env` reference

| Variable | Example |
|---|---|
| `GROQ_API_KEY` | `gsk_...` (git-ignored) |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` (free-tier only) |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` (optional) |
| `PGHOST` / `PGPORT` | `localhost` / `5432` |
| `PGUSER` / `PGPASSWORD` / `PGDATABASE` | `terraflow` / `terraflow` / `terraflow` |
| `SOURCE_KMZ_DIR` | `C:/Users/USER/Documents/MEGA UPLOAUD/GOOGLE EARTH` |
| `DONE_KMZ_DIR` | `C:/Users/USER/Desktop/العقارات المتوفرة` |
| `EXCEL_TEMPLATE` | `C:/Users/USER/Desktop/CRM_GPT_Immobilier_Employees_V8_10_2_2.xlsx` |

> `SOURCE_KMZ_DIR` intentionally contains the typo `MEGA UPLOAUD` — keep it as-is
> until the folder is renamed.

---

## 3. Running the pipeline

```powershell
npm.cmd run extract    # kmz → output/json/properties.json (+ dedupe report)
npm.cmd run ai         # + Groq AI → output/json/properties_ai.json
npm.cmd run loaddb     # → PostgreSQL (upsert + prune stale rows)
npm.cmd run fill       # → output/excel/..._filled.xlsx (copy of template)
npm.cmd run pipeline   # extract + ai + loaddb + fill, in one shot
```

These are wired in `package.json` scripts. Order matters (each stage reads the
previous stage's output), which is what `pipeline` enforces.

### Fill modes

- `npm.cmd run fill` — copy-fill: writes a **new** file in `output/excel/`, the
  original template is never touched (D2).
- `npm.cmd run fill:original` — in-place fill: writes as-written prices back into
  the customer's original workbook **with a forced backup first** (D7). Use it
  deliberately, prefer `fill` otherwise.

---

## 4. Watch mode (server-side, user-controlled)

Watch mode is a **managed, server-side service**: start/stop it from the web UI
(Import wizard → *Watch folder*) or via the API. While watching, any `.kmz`
**added** or **removed** in `SOURCE_KMZ_DIR` queues a `watch-sync` Job
(extract → AI → database) after a 1.5 s debounce.

```powershell
npm.cmd run watch        # CLI watcher (logs to output/watcher.log, Ctrl+C to stop)
```

- API: `GET /api/watch` (status) · `POST /api/watch/start` · `POST /api/watch/stop`.
- SSE: `watch:change`, `watch:log`, `watch:state` events.
- Each change batch becomes a Job in `output/jobs/` — visible on the Jobs page.
- Watch no longer auto-starts on server boot; the UI controls it.

---

## 5. API and web UI

The web app is built and served **by the API itself on one port (3000)** — no
separate dev server needed.

```powershell
npm.cmd run build:web  # build web + copy into apps/api/public (do after web changes)
npm.cmd run api        # REST API + web UI + SSE on http://localhost:3000 (needs Postgres up)
```

Optional dev mode (hot reload, proxies `/api` to :3000):

```powershell
npm.cmd run dev        # Vite dev server on http://localhost:5173 (API must be up)
```

Endpoints today:

- Core: `GET /api/health | /api/config | /api/status | /api/properties`
- AI settings: `GET|PUT /api/settings/ai` (key is masked; free-tier model
  allow-list) · `POST /api/settings/ai/test` (connection probe)
- Excel templates: `GET|POST /api/templates`, `GET|PUT|DELETE /api/templates/:id`,
  `POST /api/templates/:id/map` (build mapping), `GET /api/templates/:id/versions/:v/download`
- Uploads & Excel: `POST /api/uploads`, `POST /api/excel/inspect`, `POST /api/excel/mapping`,
  `POST /api/excel/mapping/profile` (save mapping profile)
- Jobs: `GET|POST /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/run`,
  `POST /api/jobs/:id/cancel`, `POST|GET /api/jobs/:id/draft`,
  `POST /api/jobs/:id/apply`, `GET /api/jobs/:id/download`
- Workflows: `GET|POST /api/workflows`, `POST /api/workflows/import`, `GET|PUT|DELETE /api/workflows/:id`, `POST /api/workflows/:id/run`, `POST /api/workflows/:id/duplicate`, `GET /api/workflows/:id/export`
- Watchers: `GET|POST /api/watchers`, `GET|PUT|DELETE /api/watchers/:id`, `POST /api/watchers/:id/start` · `/stop` · `/sync` · `/history/clear` (legacy `GET /api/watch` · `POST /api/watch/start|stop` kept)
- Local path browser: `GET /api/fs/roots` · `GET /api/fs/list?path=...`
- Events: `GET /api/pipeline/events | /api/jobs/events` (SSE, `?jobId=` filter; includes `job:canceled`)

---

## 6. Outputs

| Path | Content |
|---|---|
| `output/json/properties.json` | Parsed, deduped properties (147) |
| `output/json/properties_ai.json` | Same, with `ai` enrichment (147) |
| `output/json/dedupe_report.txt` | What was removed as duplicate and why |
| `output/excel/CRM_GPT_Immobilier_Employees_V8_10_2_2_filled.xlsx` | Filled workbook copy |
| `output/excel/job-<id>_filled.xlsx` | Per-job applied workbook (apply step) |
| `output/settings/ai.json` | Persisted AI settings (Professional mode) |
| `output/templates/<id>/v<N>/` + `index.json` | Registered Excel templates (versioned) |
| `output/jobs/jobs.json` | Persisted Job records (run history) |
| `output/jobs/workflows.json` | Persisted workflow definitions |
| `output/jobs/job-<id>/` | Per-job artifacts: `properties_ai.json`, `draft.json` |
| `output/mappings/` | Saved mapping profiles per template |
| `output/uploads/<timestamp>_<name>` | Staged input KMZ files |
| `output/watcher.log` | Watcher activity |
| `output/*.log` | Error logs (`db_load_error.log`, `excel_fill_error.log`) |
| `C:\Users\USER\Desktop\TerraFlow_Filled.xlsx` | Convenience copy of the filled workbook |

---

## 7. Troubleshooting

### Docker daemon offline / ECONNREFUSED on localhost:5432

```powershell
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
docker info --format '{{.ServerVersion}}'   # wait until it prints a version
docker compose up -d
```

### Groq API 429 (rate limit)

The AI stage handles this automatically: exponential backoff up to 60 s and a
throttle between calls. If a run ends with failures, **just re-run the script** —
it resumes from cache and only re-processes failed/new rows.

### Excel file locked / `~$CRM_...xlsx`

Close Excel. Watch syncs write **in place** (ExcelJS streams to the original path,
no rename), so an open workbook denies the write with `EPERM`/`EBUSY`; a sync that
fails this way never corrupts the file — it just leaves the previous backup
(`output/backup/*_before_fill_<ts>.xlsx`) untouched and records the failure in the
watcher history.

### Corrupted `node_modules` (SyntaxError in exceljs)

Re-pin the zip modules that often break:

```powershell
npm.cmd install compress-commons@6.0.2 archiver@7.0.1 zip-stream@6.0.1
```

### Windows PowerShell mangles inline Node scripts

Don't paste long `node -e "..."` scripts into PowerShell directly. Use the
base64 trick: encode the script and pass it as an argument.

### Git: default branch / push

```powershell
$env:Path += ";C:\Program Files\Git\cmd"
git branch -m main                 # if the branch is still `master`
git push -u origin main
```

---

*Back to [DATA_MODEL.md](DATA_MODEL.md) · Up: [README.md](../README.md)*
