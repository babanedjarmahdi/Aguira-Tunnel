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
npm.cmd run stage1:extract
npm.cmd run stage2:parse-ai
npm.cmd run stage1:loaddb
npm.cmd run stage2:fill
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
npm.cmd run stage1:extract    # kmz → output/json/properties.json (+ dedupe report)
npm.cmd run stage2:parse-ai   # + Groq AI → output/json/properties_ai.json
npm.cmd run stage1:loaddb     # → PostgreSQL (upsert + prune stale rows)
npm.cmd run stage2:fill       # → output/excel/..._filled.xlsx (copy of template)
```

These are also wired in `package.json` scripts. Order matters (each stage reads
the previous stage's output).

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

> Note: there is currently no `watch` script in `package.json` — run it directly
> if needed: `node src/scripts/watch.js`.

---

## 5. Outputs

| Path | Content |
|---|---|
| `output/json/properties.json` | Parsed, deduped properties (147) |
| `output/json/properties_ai.json` | Same, with `ai` enrichment (147) |
| `output/json/dedupe_report.txt` | What was removed as duplicate and why |
| `output/excel/CRM_GPT_Immobilier_Employees_V8_10_2_2_filled.xlsx` | Filled workbook copy |
| `output/watcher.log` | Watcher activity |
| `output/*.log` | Error logs (`db_load_error.log`, `excel_fill_error.log`) |
| `C:\Users\USER\Desktop\TerraFlow_Filled.xlsx` | Convenience copy of the filled workbook |

---

## 6. Troubleshooting

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
