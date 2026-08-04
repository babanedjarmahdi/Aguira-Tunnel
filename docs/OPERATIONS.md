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
| `GROQ_MODEL` | `llama-3.3-70b-versatile` |
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

## 4. The live watcher (recommended for day-to-day)

Watches the Google Earth KMZ folder. Any `.kmz` **added** or **removed** triggers
a full re-sync (extract → AI → DB → Excel) after a 1.5 s debounce.

```powershell
npm.cmd run watch
```

- Runs once at startup to bring everything in sync.
- Logs to `output/watcher.log` and the console.
- Skips a sync if one is already running.
- **Stop it with Ctrl+C** before doing a manual pipeline run to avoid conflicts.

> v0.4 turns this into a server-side **WatchService** (folder + single-file,
> start/stop via API, SSE events, Jobs per run) — see
> [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md) §9 and §11.

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
- Uploads & Excel: `POST /api/uploads`, `POST /api/excel/inspect`, `POST /api/excel/mapping`
- Jobs: `GET|POST /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/run`,
  `POST|GET /api/jobs/:id/draft`, `POST /api/jobs/:id/apply`, `GET /api/jobs/:id/download`
- Workflows: `GET|POST /api/workflows`, `GET|PUT|DELETE /api/workflows/:id`, `POST /api/workflows/:id/run`
- Watch: `GET /api/watch`
- Events: `GET /api/pipeline/events | /api/jobs/events` (SSE, `?jobId=` filter)

---

## 6. Outputs

| Path | Content |
|---|---|
| `output/json/properties.json` | Parsed, deduped properties (147) |
| `output/json/properties_ai.json` | Same, with `ai` enrichment (147) |
| `output/json/dedupe_report.txt` | What was removed as duplicate and why |
| `output/excel/CRM_GPT_Immobilier_Employees_V8_10_2_2_filled.xlsx` | Filled workbook copy |
| `output/drafts/` | Not-yet-applied draft workbooks (v0.4 safe execution) |
| `output/jobs/` | Persisted Job records (v0.4 run history) |
| `output/uploads/<jobId>/` | Staged input files (v0.4) |
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

`stage2_ai.js` handles this automatically: exponential backoff up to 60 s and a
throttle between calls. If a run ends with failures, **just re-run the script** —
it resumes from cache and only re-processes failed/new rows.

### Excel file locked / `~$CRM_...xlsx`

Close Excel. The pipeline always writes a **copy**, so the original stays safe —
but if Excel has the copy open it may also be locked.

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
