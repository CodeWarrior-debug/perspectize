# Theme Picker — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-11-theme-picker-design.md`
**Execution skill:** `superpowers:executing-plans`

## Tasks

- [x] Add `culori` and `@jaames/iro` dependencies
- [ ] `frontend/src/lib/theme/derive.ts` — types + derivation pipeline (neutrals tint toward hue, contrast clamping, rating-color hue separation)
- [ ] `frontend/src/lib/theme/presets.ts` — 5 preset base-token sets + generated full-token CSS strings
- [ ] `frontend/src/lib/theme/store.ts` — localStorage-backed reactive theme state (active theme, custom themes list, apply/save/delete)
- [ ] `frontend/src/lib/theme/export.ts` — CSS file text generation + browser download trigger
- [ ] `frontend/src/lib/components/theme/ColorWheel.svelte` — iro.js wrapper (value in / onChange out), OKLCH/hex/rgb unit toggle
- [ ] `frontend/src/lib/components/theme/ThemeCustomizePanel.svelte` — preset gallery + customize rows + save-as + export
- [ ] `frontend/src/lib/components/SettingsDialog.svelte` — left-nav shell hosting the customize panel
- [ ] `frontend/src/lib/components/Header.svelte` — gear icon trigger, signed-in only
- [ ] `frontend/src/app.html` — inline pre-paint theme script
- [ ] `frontend/src/app.css` — append generated preset CSS blocks
- [ ] Tests: `derive.test.ts`, `theme-store.test.ts`, `ColorWheel.test.ts`, `ThemeCustomizePanel.test.ts`
- [ ] `pnpm run test:run` and `pnpm run check` pass
- [ ] Reflection + PR
