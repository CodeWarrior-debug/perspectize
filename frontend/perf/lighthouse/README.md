# Frontend performance tests (Lighthouse CI)

Per-route Lighthouse audits, run ahead of the Node version migration to
catch build/runtime regressions in bundle size, hydration, and render cost.

The app is a client-rendered SPA (`ssr = false` in `src/routes/+layout.ts`),
so these scores mostly reflect JS bundle size and client-side render
performance — not server response time (that's what the backend's k6 tests
cover instead, see `backend/perf/k6/`).

## Running

```bash
pnpm run perf:lighthouse
```

This builds the production bundle, serves it via `pnpm run preview`
(`:4173`), and runs Lighthouse 3x per route (median is reported) against
each URL in `lighthouserc.cjs`'s `collect.url` list. Reports land in
`perf/lighthouse/results/` as isolated HTML/JSON per route — open any
`*-report.html` in a browser.

To audit a single route instead of the full list:

```bash
pnpm run build
pnpm exec lhci autorun --collect.url=http://localhost:4173/discover --collect.startServerCommand="pnpm run preview"
```

## Auth-gated routes

`/messages` requires a signed-in Clerk session. Without one, Lighthouse
audits whatever the app actually renders for a logged-out visitor (redirect
page, gate screen, etc.) — that's a legitimate perf data point on its own,
but it is **not** measuring the authenticated experience. For that, run
Lighthouse manually against a local dev server where you're already signed
in (see root `CLAUDE.md`'s Chrome DevTools MCP verification flow — this
needs the local `.claude/.env`/`.claude/sv-profile/` setup, not available in
CI/cloud sessions).

## Adding a route

Add its URL to the `collect.url` array in `../../lighthouserc.cjs`. Each URL
gets its own isolated report — nothing is averaged across routes.

## Thresholds

`lighthouserc.cjs`'s `assert` block currently only warns (doesn't fail the
run) below performance 0.7 / accessibility 0.9. Tighten to `error` once
you've established a real baseline for this app.
