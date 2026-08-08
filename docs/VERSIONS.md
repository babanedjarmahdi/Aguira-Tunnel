# TerraFlow — Version registry (rollback points)

> Every time a task in the main plan completes, the work is committed, tagged
> with the next version number, and recorded here. **Use `git checkout <tag>`
> to roll the codebase back to any of these points.**

| Version | Commit | Date | What changed |
|---|---|---|---|
| v0.5.0 | (baseline) | 2026-08-04 | Part 1 shipped: safe import loop, Job model, draft/apply, watch mode, single-port :3000 |
| v0.5.1 | `473cf3e` | 2026-08-04 | Multi-workflow + Workflows page, single-port model |
| v0.5.2 | `254a9d2` | 2026-08-04 | Reliability: cancel, Groq 429 backoff, boot recovery |
| v0.5.3 | `f6cbe4b` | 2026-08-04 | AI configuration (real), PRO mode toggle |
| v0.5.4 | `206fde1` | 2026-08-04 | Excel template manager (real) |
| v0.5.5 | `d248222` | 2026-08-04 | Workflow builder (real) |
| v0.5.6 | `d49d1b2` | 2026-08-05 | Workflow-first UI + managed watchers + watch sync reconciliation |
| v0.5.7 | `fb503e1` | 2026-08-05 | Persisted job history (re-run/download) + professional log viewer |
| v0.5.8 | `05a7755` | 2026-08-05 | Telegram bridge + task reports with decision buttons (اكمل/انتظر/اقتراح تعديل) |
| v0.5.9 | (this commit) | 2026-08-05 | Plugin contracts solidified: built-in adapters declared as plugin-shaped implementations (input `read`, output `inspect/draft/preview/apply`, AI `extract`) — `engine/src/plugins.js` + `GET /api/plugins` |
| v0.5.10 | (this commit) | 2026-08-08 | Privacy/responsive UI pass (no groq / no localhost:3000, responsive layout), Basic/Professional mode actually gated, watcher #4 "Watch GOOGLE EARTH" restored (root cause: Postgres down → `db:"up"`, runOnStartup, sync verified: AI 152 cached / DB 152 / Excel +82−70), Vercel SPA deep-link 404s fixed (build config must live in `apps/web/vercel.json` — repo-root `vercel.json` is ignored by the edge), prod redeployed and verified end-to-end via the tunnel |
| v0.5.11 | (this commit) | 2026-08-08 | Telegram quiet + job detail popup: removed automatic job-done Telegram notifications (bridge still receives into the inbox; `telegram-ask.mjs` still sends on demand); Run history rows clickable → centered JobDetails popup with blurred backdrop showing the full job record (overview, counters, source/destination, stage results, error, full log) + Download/Re-run/Cancel actions |
| v0.5.12 | (this commit) | 2026-08-08 | Telegram feature fully removed (bridge start + import dropped from server.js, `scripts/telegram-bridge.mjs` + `scripts/telegram-ask.mjs` deleted, bot inert); modal portal fix — `.page` fadeUp animation retained a `transform` making it a containing block for `position:fixed`, trapping the popup; all modals now render via `createPortal(…, document.body)` |

## How to roll back

```
git fetch origin
git checkout v0.5.9      # e.g. roll back to the plugin contracts build
```

The next completed plan task will be tagged **v0.6.0**.
