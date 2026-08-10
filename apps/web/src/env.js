// Build-target feature flags (injected by Vite from VITE_* env vars).
// WATCHER_ENABLED: watch workflows need continuous background execution and
// direct access to local folders — capabilities a public website can't have.
// Local/dev builds set VITE_WATCHER_ENABLED=true (apps/web/.env); the public
// web build leaves it unset (or sets it false), so watcher UI/runtime is
// hidden and the /watchers route shows the explainer landing page instead.
export const WATCHER_ENABLED = import.meta.env.VITE_WATCHER_ENABLED === 'true';
