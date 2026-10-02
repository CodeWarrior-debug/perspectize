# Frontend Dependency Upgrade Analysis

**Generated:** 2026-10-01 · **Last applied:** 2026-10-01
**Scope:** `frontend/package.json` (SvelteKit app)
**Tool used:** [`npm-check-updates`](https://github.com/raine/npm-check-updates) (`npx npm-check-updates`), cross-referenced with npm registry publish timestamps for "how far behind" figures.

This report lives alongside the monthly maintenance routine (see [SKILL.md](SKILL.md)) — re-run `npx npm-check-updates` each month and refresh this table rather than treating it as a one-off.

Only packages where `ncu` reports a newer version are listed. Everything else in `package.json` is already on the latest published version as of this report.

## Applied this run (2026-10)

Minor/patch bumps via `npx npm-check-updates -u --target minor`: `@lucide/svelte` 1.49.0, `@sveltejs/kit` ~2.70.3, `@tanstack/svelte-query` 6.3.0, `@testing-library/jest-dom` 6.10.0, all `@tiptap/*` 3.31.4, `jscpd` 5.4.0. `pnpm run test:run` (155 files / 1971 tests) and `pnpm run build` pass. Last month's Capacitor, `jsdom`, `prettier-plugin-svelte`, `vitest-browser-svelte` and `web-vitals` majors have since landed.

## Major updates (need review)


| Package | Current | Latest | Behind | Function | Benefits of upgrading | Drawbacks / Risks | Recommendation |
|---|---|---|---|---|---|---|---|
| `@sveltejs/vite-plugin-svelte` | ^6.2.4 | ^7.3.1 | ~6.9 mo | Vite plugin wiring Svelte compilation into Vite | Required to move to Vite 8; performance/HMR improvements | Paired with Vite 8 major bump (see below) — must upgrade together | Upgrade together with `vite` (see plan below) |
| `@testing-library/jest-dom` | ^6.9.1 | ^7.0.1 | ~10.2 mo | Custom Vitest/Jest DOM matchers (`toBeInTheDocument`, etc.) | v7 drops legacy CJS-only entry, cleans up TS types | Check matcher setup file (`vitest-setup` or similar) still imports correctly; possible peer-dep bump for Vitest v5 | **Upgrade**, low functional risk — dev-only test tooling |
| `@vitest/browser`, `@vitest/browser-playwright`, `@vitest/coverage-v8`, `vitest` | ^4.1.11 | ^5.0.0 | ~0.5 mo | Vitest test runner + browser-mode + coverage | Bug fixes, perf, keeps first-party plugins in lockstep with core | Vitest 5 is a major — check config (`vitest.config`) for renamed/removed options; `vitest-browser-svelte` compatibility (see below) | Upgrade **as one atomic set** (all four must move together — mismatched majors between `vitest` core and its official plugins is a common breakage source) |
| `graphql` | ^16.14.2 | ^17.0.2 | ~0.8 mo | GraphQL spec implementation (used by `graphql-request` client) | Spec/perf updates | `graphql-request` v7's peer range should be checked against `graphql` v17 before bumping — a mismatch breaks query execution at runtime, not compile time | Verify `graphql-request` peer compat first, then upgrade |
| `jscpd` | ^4.0.8 | ^5.4.0 | ~7.3 mo | Copy-paste/duplication detector (`test:duplication` script only) | Bug fixes, better detectors | Dev-tooling only, not shipped; low blast radius. Check CLI flag/report-format changes if CI parses jscpd output | **Upgrade**, low risk (not in the runtime or build path) |
| `typescript` | ^6.0.3 | ^7.0.2 | ~2.7 mo | TypeScript compiler | Perf and language features | Major version — re-run `svelte-check` and `pnpm run check`; watch for stricter inference breaking existing `.ts`/`.svelte` files | Upgrade, budget time to fix any new type errors surfaced by stricter checking |
| `vite` | ^7.3.6 | ^8.3.1 | ~2.5 mo | Build tool / dev server | Perf, ships alongside plugin ecosystem moving to v8 | Must upgrade together with `@sveltejs/vite-plugin-svelte` v7 and validate `@tailwindcss/vite`, `@vite-pwa/sveltekit` plugins still load under Vite 8 | Upgrade **together with** `@sveltejs/vite-plugin-svelte`; smoke-test `pnpm run dev` and `pnpm run build` |

## Suggested upgrade plan

1. **Vite/Svelte-plugin/Vitest ecosystem (one PR):** `vite` 8, `@sveltejs/vite-plugin-svelte` 7, `vitest`/`@vitest/browser`/`@vitest/browser-playwright`/`@vitest/coverage-v8` 5, `@testing-library/jest-dom` 7. Run `pnpm run test:run`, `pnpm run test:browser`, `pnpm run build`.
2. **Standalone majors, one PR each:** `typescript` 7, `graphql` 17 (check `graphql-request` peer range first).

Per `CLAUDE.md`, run `pnpm run test:run` (and `pnpm run check`) after each batch before pushing.
