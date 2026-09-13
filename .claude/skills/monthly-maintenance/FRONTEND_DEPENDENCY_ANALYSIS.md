# Frontend Dependency Upgrade Analysis

**Generated:** 2026-09-12
**Scope:** `frontend/package.json` (SvelteKit app)
**Tool used:** [`npm-check-updates`](https://github.com/raine/npm-check-updates) (`npx npm-check-updates`), cross-referenced with npm registry publish timestamps for "how far behind" figures.

This report lives alongside the monthly maintenance routine (see [SKILL.md](SKILL.md)) — re-run `npx npm-check-updates` each month and refresh this table rather than treating it as a one-off.

Only packages where `ncu` reports a newer version are listed. Everything else in `package.json` (e.g. `@ag-grid-community/*`, `@tanstack/*`, `@tiptap/*`, `svelte`, `svelte-check`, `tailwindcss`, `dompurify`, `graphql-request`, etc.) is already on the latest published version as of this report.

## Patch updates (low risk)

| Package | Current | Latest | Behind | Function | Benefits | Drawbacks / Risks | Recommendation |
|---|---|---|---|---|---|---|---|
| `@capacitor/android` | 8.5.1 | 8.5.2 | ~0.4 mo | Android native runtime for the Capacitor mobile wrapper | Bug fixes for the Android platform shim | None expected; patch release | **Upgrade now** |
| `@capacitor/core` | 8.5.1 | 8.5.2 | ~0.4 mo | Capacitor JS↔native bridge core | Keeps in lockstep with android/ios/cli patch | None expected | **Upgrade now** (bump alongside android/ios/cli) |
| `@capacitor/ios` | 8.5.1 | 8.5.2 | ~0.4 mo | iOS native runtime for Capacitor | Bug fixes for the iOS platform shim | None expected | **Upgrade now** |
| `@sveltejs/kit` | ~2.70.2 | ~2.70.3 | ~0.7 mo | SvelteKit meta-framework (routing, SSR, adapters) | Patch bug fixes | None expected | **Upgrade now** |
| `bits-ui` | ^2.19.0 | ^2.19.2 | ~0.7 mo | Headless Svelte 5 component primitives (used under the app's UI components) | Bug fixes to primitives | None expected | **Upgrade now** |

## Minor updates (low risk)

| Package | Current | Latest | Behind | Function | Benefits | Drawbacks / Risks | Recommendation |
|---|---|---|---|---|---|---|---|
| `@lucide/svelte` | ^1.42.0 | ^1.45.0 | ~0.1 mo | Icon component set | New icons, small fixes | None expected — additive minor | **Upgrade now** |

## Major updates (need review)

| Package | Current | Latest | Behind | Function | Benefits of upgrading | Drawbacks / Risks | Recommendation |
|---|---|---|---|---|---|---|---|
| `@capacitor/cli` | ^7.5.0 | ^8.5.2 | ~7.0 mo | Capacitor CLI (sync/build tooling for iOS/Android) | Matches the already-installed `@capacitor/{core,android,ios}` v8 runtime; avoids CLI/runtime version skew that can break `cap sync` | CLI is currently a full major behind the runtime packages already in `devDependencies` — this is a latent mismatch bug, not just a routine bump. Verify `cap sync` / `mobile:build` still works with v8 project config changes | **Upgrade now** — this one is arguably urgent, not just "latest": running a v7 CLI against v8 native packages risks broken native builds |
| `@sveltejs/vite-plugin-svelte` | ^6.2.4 | ^7.3.0 | ~6.9 mo | Vite plugin wiring Svelte compilation into Vite | Required to move to Vite 8; performance/HMR improvements | Paired with Vite 8 major bump (see below) — must upgrade together | Upgrade together with `vite` (see plan below) |
| `@testing-library/jest-dom` | ^6.9.1 | ^7.0.1 | ~10.2 mo | Custom Vitest/Jest DOM matchers (`toBeInTheDocument`, etc.) | v7 drops legacy CJS-only entry, cleans up TS types | Check matcher setup file (`vitest-setup` or similar) still imports correctly; possible peer-dep bump for Vitest v5 | **Upgrade**, low functional risk — dev-only test tooling |
| `@vitest/browser`, `@vitest/browser-playwright`, `@vitest/coverage-v8`, `vitest` | ^4.1.11 | ^5.0.0 | ~0.5 mo | Vitest test runner + browser-mode + coverage | Bug fixes, perf, keeps first-party plugins in lockstep with core | Vitest 5 is a major — check config (`vitest.config`) for renamed/removed options; `vitest-browser-svelte` compatibility (see below) | Upgrade **as one atomic set** (all four must move together — mismatched majors between `vitest` core and its official plugins is a common breakage source) |
| `vitest-browser-svelte` | ^2.1.1 | ^3.1.0 | ~4.7 mo | Svelte component testing helpers for Vitest browser mode | Needed to stay compatible with Vitest 5 | Must be upgraded in the same pass as the Vitest 5 bump above, or browser-mode component tests may fail to resolve | Upgrade **together with** the Vitest 5 set above |
| `graphql` | ^16.14.2 | ^17.0.2 | ~0.8 mo | GraphQL spec implementation (used by `graphql-request` client) | Spec/perf updates | `graphql-request` v7's peer range should be checked against `graphql` v17 before bumping — a mismatch breaks query execution at runtime, not compile time | Verify `graphql-request` peer compat first, then upgrade |
| `jscpd` | ^4.0.8 | ^5.2.0 | ~7.3 mo | Copy-paste/duplication detector (`test:duplication` script only) | Bug fixes, better detectors | Dev-tooling only, not shipped; low blast radius. Check CLI flag/report-format changes if CI parses jscpd output | **Upgrade**, low risk (not in the runtime or build path) |
| `jsdom` | ^29.1.1 | ^30.0.1 | ~3.0 mo | DOM emulation for Vitest's `unit` test environment | Newer web-platform spec coverage, fixes flaky DOM behaviors | Occasionally changes strictness (e.g. CSS parsing, `structuredClone`) which can surface previously-passing test bugs | Upgrade, then run `pnpm run test:run` and fix any newly-surfaced failures |
| `prettier-plugin-svelte` | ^3.5.1 | ^4.1.1 | ~3.4 mo | Svelte formatting for Prettier | Handles newer Svelte 5 syntax correctly | v4 requires Prettier 3.x+ (already satisfied) — check for formatting-output diffs across the whole `.svelte` tree (large diff on first run) | Upgrade, then run `pnpm exec prettier --write .` as its own isolated commit to keep the diff reviewable |
| `typescript` | ^6.0.3 | ^7.0.2 | ~2.7 mo | TypeScript compiler | Perf and language features | Major version — re-run `svelte-check` and `pnpm run check`; watch for stricter inference breaking existing `.ts`/`.svelte` files | Upgrade, budget time to fix any new type errors surfaced by stricter checking |
| `vite` | ^7.3.6 | ^8.3.0 | ~2.5 mo | Build tool / dev server | Perf, ships alongside plugin ecosystem moving to v8 | Must upgrade together with `@sveltejs/vite-plugin-svelte` v7 and validate `@tailwindcss/vite`, `@vite-pwa/sveltekit` plugins still load under Vite 8 | Upgrade **together with** `@sveltejs/vite-plugin-svelte`; smoke-test `pnpm run dev` and `pnpm run build` |
| `web-vitals` | ^5.3.0 | ^6.2.1 | ~3.0 mo | Core Web Vitals measurement (real-user monitoring) | API/metric-shape improvements in v6 | Check call sites for any renamed metric callbacks (`onCLS`/`onINP`/etc.) before bumping | Upgrade, then verify the metrics-reporting call site still compiles and fires |

## Suggested upgrade plan

1. **Batch 1 — safe, do immediately:** all patch + minor bumps, plus `@capacitor/cli` (closes an existing runtime/CLI version mismatch). Run `npx npm-check-updates -u --filter "/^@capacitor/,@sveltejs/kit,bits-ui,@lucide\/svelte/"`, install, run full test suite.
2. **Batch 2 — Vite/Svelte-plugin/Vitest ecosystem:** bump `vite`, `@sveltejs/vite-plugin-svelte`, `vitest`, `@vitest/browser`, `@vitest/browser-playwright`, `@vitest/coverage-v8`, `vitest-browser-svelte`, `@testing-library/jest-dom`, `jsdom` together in one PR (these are interdependent majors). Run `pnpm run test:run`, `pnpm run test:browser`, `pnpm run build`.
3. **Batch 3 — standalone majors:** `typescript`, `prettier-plugin-svelte`, `graphql`, `jscpd`, `web-vitals` — each isolated to its own commit/PR since they're independent and each may need its own follow-up fixes (type errors, formatting diff, GraphQL peer check).

Per `CLAUDE.md`, run `pnpm run test:run` (and `pnpm run check`) as the mandatory self-verification step after each batch before pushing.
