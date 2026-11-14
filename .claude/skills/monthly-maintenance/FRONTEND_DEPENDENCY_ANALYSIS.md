# Frontend Dependency Upgrade Analysis

**Generated:** 2026-11-01 · **Last applied:** 2026-11-01
**Scope:** `frontend/package.json` (SvelteKit app)
**Tool used:** [`npm-check-updates`](https://github.com/raine/npm-check-updates) (`npx npm-check-updates`), cross-referenced with npm registry publish timestamps for "how far behind" figures.

This report lives alongside the monthly maintenance routine (see [SKILL.md](SKILL.md)) — re-run `npx npm-check-updates` each month and refresh this table rather than treating it as a one-off.

Only packages where `ncu` reports a newer version are listed. Everything else in `package.json` is already on the latest published version as of this report.

## Applied this run (2026-11)

Minor/patch bumps via `npx npm-check-updates -u --target minor` (held back `@tanstack/svelte-query` 6.3.6: inside the 1-day `minimumReleaseAge` cooldown, 6.3.7 is the next candidate): all `@tiptap/*` 3.32.2, `@capacitor/*` 8.6.0, `@lucide/svelte` ^1.66.0, `svelte-clerk` 1.3.0, `svelte` 5.57.3, `svelte-sonner` 1.2.2, `vitest` + `@vitest/*` 4.1.12. `pnpm run test:run` (193 files / 2773 tests) and `pnpm run build` pass. `pnpm run check` reports 33 errors in `tests/browser/ag-grid-integration.test.ts`, `AGGridTestHarness.svelte` and `TestWrapper.svelte`; identical on `main` before the bumps, so pre-existing.

`pnpm audit` went 22 -> 13 after new overrides in `pnpm-workspace.yaml` (`fast-uri` ^3.1.9, `qs` ^6.16.1, `basic-ftp`, `ip-address`, `body-parser`, `chromium-bidi>zod`). The remaining 13 are all dev tooling (`@lhci/cli`, `@stryker-mutator/core`, `@capacitor/cli`, `@sveltejs/vite-plugin-svelte`, `workbox-build`) except 2 low `@sveltejs/kit` advisories fixed only by Kit 3; `uuid`, `minimatch` and `glob` need major jumps, and `extract-zip`/`deepmerge` have no patched version.

## Major updates (need review)


| Package | Current | Latest | Behind | Function | Benefits of upgrading | Drawbacks / Risks | Recommendation |
|---|---|---|---|---|---|---|---|
| `@sveltejs/kit` | ~2.70.3 | ~3.1.1 | new | SvelteKit framework | Fixes 2 low advisories (<3.0.0); new major line | Major; check adapters, `svelte.config.js`, hooks and the version-watch/stale-chunk logic | Upgrade with `adapter-static` ^4 and `adapter-auto` ^8 in its own PR |
| `@sveltejs/adapter-static`, `@sveltejs/adapter-auto` | ^3.0.10 / ^7.0.1 | ^4.0.1 / ^8.0.0 | new | Build adapters | Required for Kit 3 | Output/`_headers`/`_redirects` handling must be re-verified (see `frontend/CLAUDE.md` Deployment) | Move with Kit |
| `tailwind-variants` | ^3.3.1 | ^4.0.1 | new | Class variant helper | Maintenance | Major; check shadcn component variants | Upgrade in its own PR |
| `@sveltejs/vite-plugin-svelte` | ^6.2.4 | ^7.3.1 | ~6.9 mo | Vite plugin wiring Svelte compilation into Vite | Required to move to Vite 8; performance/HMR improvements | Paired with Vite 8 major bump (see below) — must upgrade together | Upgrade together with `vite` (see plan below) |
| `@testing-library/jest-dom` | ^6.9.1 | ^7.0.1 | ~10.2 mo | Custom Vitest/Jest DOM matchers (`toBeInTheDocument`, etc.) | v7 drops legacy CJS-only entry, cleans up TS types | Check matcher setup file (`vitest-setup` or similar) still imports correctly; possible peer-dep bump for Vitest v5 | **Upgrade**, low functional risk — dev-only test tooling |
| `@vitest/browser`, `@vitest/browser-playwright`, `@vitest/coverage-v8`, `vitest` | ^4.1.12 | ^5.0.5 | ~0.5 mo | Vitest test runner + browser-mode + coverage | Bug fixes, perf, keeps first-party plugins in lockstep with core | Vitest 5 is a major — check config (`vitest.config`) for renamed/removed options; `vitest-browser-svelte` compatibility (see below) | Upgrade **as one atomic set** (all four must move together — mismatched majors between `vitest` core and its official plugins is a common breakage source) |
| `graphql` | ^16.14.2 | ^17.0.2 | ~0.8 mo | GraphQL spec implementation (used by `graphql-request` client) | Spec/perf updates | `graphql-request` v7's peer range should be checked against `graphql` v17 before bumping — a mismatch breaks query execution at runtime, not compile time | Verify `graphql-request` peer compat first, then upgrade |
| `jscpd` | ^5.4.2 | current | - | Copy-paste/duplication detector (`test:duplication` script only) | Bug fixes, better detectors | Dev-tooling only, not shipped; low blast radius. Check CLI flag/report-format changes if CI parses jscpd output | **Upgrade**, low risk (not in the runtime or build path) |
| `typescript` | ^6.0.3 | ^7.0.2 | ~2.7 mo | TypeScript compiler | Perf and language features | Major version — re-run `svelte-check` and `pnpm run check`; watch for stricter inference breaking existing `.ts`/`.svelte` files | Upgrade, budget time to fix any new type errors surfaced by stricter checking |
| `vite` | ^7.3.6 | ^8.3.1 | ~2.5 mo | Build tool / dev server | Perf, ships alongside plugin ecosystem moving to v8 | Must upgrade together with `@sveltejs/vite-plugin-svelte` v7 and validate `@tailwindcss/vite`, `@vite-pwa/sveltekit` plugins still load under Vite 8 | Upgrade **together with** `@sveltejs/vite-plugin-svelte`; smoke-test `pnpm run dev` and `pnpm run build` |

## Suggested upgrade plan

1. **Vite/Svelte-plugin/Vitest ecosystem (one PR):** `vite` 8, `@sveltejs/vite-plugin-svelte` 7, `vitest`/`@vitest/browser`/`@vitest/browser-playwright`/`@vitest/coverage-v8` 5, `@testing-library/jest-dom` 7. Run `pnpm run test:run`, `pnpm run test:browser`, `pnpm run build`.
2. **Standalone majors, one PR each:** `typescript` 7, `graphql` 17 (check `graphql-request` peer range first).

Per `CLAUDE.md`, run `pnpm run test:run` (and `pnpm run check`) after each batch before pushing.
