# Theme Picker — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-11-theme-picker-design.md`
**Execution skill:** `superpowers:executing-plans`

## Tasks

- [x] Add `culori` and `@jaames/iro` dependencies
- [x] `frontend/src/lib/theme/derive.ts` — types + derivation pipeline (neutrals tint toward hue, contrast clamping, rating-color hue separation)
- [x] `frontend/src/lib/theme/presets.ts` — 5 preset base-token sets + generated full-token CSS strings
- [x] `frontend/src/lib/theme/store.svelte.ts` — localStorage-backed reactive theme state (active theme, custom themes list, apply/save/delete)
- [x] `frontend/src/lib/theme/export.ts` — CSS file text generation + browser download trigger
- [x] `frontend/src/lib/components/theme/ColorWheel.svelte` — iro.js wrapper (value in / onChange out), OKLCH/hex/rgb unit toggle
- [x] `frontend/src/lib/components/theme/ThemeCustomizePanel.svelte` — preset gallery + customize rows + save-as + export
- [x] `frontend/src/lib/components/SettingsDialog.svelte` — left-nav shell hosting the customize panel
- [x] `frontend/src/lib/components/Header.svelte` — gear icon trigger, signed-in only
- [x] `frontend/src/app.html` — inline pre-paint theme script
- [x] `frontend/src/app.css` — append generated preset CSS blocks
- [x] Tests: `derive.test.ts`, `theme-store.test.ts`, `export.test.ts` (`ColorWheel`/`ThemeCustomizePanel` component tests deferred — see PR "Out of scope" note; iro.js needs canvas support jsdom can't provide, and the derivation/store logic that actually needs regression coverage is fully tested)
- [x] `pnpm run test:run` (951/951 passing) and `pnpm run check` (0 new errors; 3 pre-existing baseline errors untouched by this branch) pass
- [ ] Reflection + PR
