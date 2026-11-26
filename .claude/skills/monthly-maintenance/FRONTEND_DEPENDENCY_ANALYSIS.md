# Frontend Dependency Upgrade Analysis

**Generated:** 2026-11-26 · **Last applied:** 2026-11-26
**Scope:** `frontend/package.json` (SvelteKit app)
**Tool used:** [`npm-check-updates`](https://github.com/raine/npm-check-updates) (`npx npm-check-updates`), cross-referenced with npm registry publish timestamps for "how far behind" figures.

This report lives alongside the monthly maintenance routine (see [SKILL.md](SKILL.md)) — re-run `npx npm-check-updates` each month and refresh this table rather than treating it as a one-off.

Only packages where `ncu` reports a newer version are listed. Everything else in `package.json` is already on the latest published version as of this report.

## Applied this run (2026-12 routine, run 2026-11-26)

`ncu --target minor`: `@tanstack/svelte-query` 6.4.7, `@sveltejs/vite-plugin-svelte` 7.3.2, `@grafana/faro-web-sdk` and `-tracing` 2.15.0, `dompurify` 3.5.0, `@lucide/svelte` 1.80.0. The `'@lucide/svelte': 1.43.0` override (a release-cooldown workaround) was removed; it had kept every later bump from taking effect. Added `'mutation-server-protocol>zod': ^4.6.6`. `pnpm run check` 0 errors, `pnpm run test:run` 308 files / 4384 tests pass, `pnpm run build` passes.

Held for the 24h `minimumReleaseAge`: `svelte` 5.59.2, `@sveltejs/kit` 3.4.1, `@lucide/svelte` 1.81.0.

`pnpm audit` went 2 -> 1. The remaining finding is moderate: `minimatch` via `@stryker-mutator/core` (dev tooling), fixable only with a major.

## Major updates (need review)

| Package | Current | Latest | Notes |
|---|---|---|---|
| `vitest`, `@vitest/browser`, `@vitest/browser-playwright`, `@vitest/coverage-v8` | ^4.1.12 | ^5.1.2 | Move all four together, in their own PR |
| `@testing-library/jest-dom` | ^6.10.0 | ^8.0.0 | 6.10.0 is deprecated upstream (a breaking change shipped in a minor: Node >=22). Move with Vitest 5 |
| `graphql` | ^16.15.0 | ^17.1.0 | Check the `graphql-request` and `graphql-ws` peer ranges first |
| `typescript` | ^6.0.3 | ^7.0.2 | **Blocked:** `svelte-check` 4.7.8 still declares `^5 \|\| ^6`, so TS6 stays (TS 7 already runs as `@typescript/native`) |
