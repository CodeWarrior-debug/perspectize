# Theme Picker — Design

**Status:** Approved (brainstormed and agreed with user across a multi-turn session; no separate review gate — user authorized proceeding straight to implementation).

## Summary

Add a first-class theme customization system: a settings panel (opened from a gear icon in the header) offering 5 curated presets and full custom color editing via an OKLCH color wheel, with save/name, live apply, and CSS export.

## Problem

Perspectize's `.impeccable.md` design brief calls for a theme picker as a "first-class feature" — curated themes as considered artifacts, not a light/dark toggle. No theme picker exists today; `app.css` hardcodes a single palette ("Reading Room" in spirit, unnamed in code).

## Sources reconciled

Three conflicting historical references were found during brainstorming; `.impeccable.md` (the live, skill-loaded design brief) was chosen as authoritative over a stale Oct 2025 decision note and an unused Figma-Make reference component, per explicit user decision:

- **Presets:** Reading Room (default), Archive, Garden, Midnight, Terminal — names/moods from `.impeccable.md`. Exact OKLCH values for the 4 non-default themes are original to this spec (only Reading Room was previously designed anywhere).
- **No font picker.** `.impeccable.md` mandates the Geist/Charter dual-font system stay intact across every theme, including custom ones.
- **Live preview, not modal-gated apply.** Changes (preset click or wheel drag) apply immediately to live CSS custom properties — no separate "Apply" step.

## Token model

**8 base editable tokens** per theme (the ones with the most visual impact): `primary`, `primary-hover`, `secondary`, `accent`, `background`, `foreground`, `border`, `destructive`.

**Derived tokens** (computed from the base 8, never directly edited): `card`/`popover` (= background), `muted` (= secondary), `secondary-hover` (= secondary at reduced alpha, matching current app.css pattern), `ring` (= primary), all `*-foreground` pairs (picked white/black — or existing `-foreground` value on presets — by WCAG contrast check against their paired background), `input` (= border).

**Rating colors** (`rating-positive/neutral/negative/undecided`) are derived per theme from the theme's primary hue family (tinted, not literally re-picked by the user) but validated for mutual perceptual distinctness (minimum OKLCH hue separation) so they never collapse into each other. `logo-purple` (brand mark) stays fixed across all themes — it identifies the product mark itself, not the reading environment.

**Derivation rules** (`frontend/src/lib/theme/derive.ts`):
1. Convert base tokens to OKLCH (via `culori`).
2. Neutral tokens (`background`, `card`, `popover`, `muted`, `secondary`) get a small chroma nudge toward the theme's primary hue (`tintNeutralTowardHue`), reduced further as lightness approaches 0 or 1 (avoids muddy near-black/near-white).
3. For every foreground/background pair, compute WCAG contrast ratio; if the theme's own literal foreground value fails AA (4.5:1 for normal text), clamp foreground lightness toward 0 or 1 (whichever direction increases contrast) until it passes, rather than shipping unreadable text.
4. Rating colors are computed as fixed-hue-offset variants of the primary hue, each independently contrast-checked against `background`; if two rating colors fall within a minimum hue-distance threshold of each other after tinting, the offsets are widened until they clear it.

This same function runs for presets (informing their static CSS block generation, done once at build/authoring time — not recomputed at runtime for presets) and for custom themes (computed live in the browser as the user edits).

## Presets — palette definitions

| Theme | Primary hue (OKLCH) | Mood |
|---|---|---|
| Reading Room (default) | current navy `#1a365d` — unchanged | Navy on warm paper-white. |
| Archive | warm ochre/sepia, ~60° hue | Sepia, cotton rag, warm graphite text. |
| Garden | deep moss green, ~145° hue | Herbarium green, field-guide quiet. |
| Midnight | deep ink navy, darker/lower-lightness variant of Reading Room's hue | Late-night long-form review writing. |
| Terminal | near-black neutral with a narrow-hue phosphor-green accent | Power-user. Precise, dense, quietly nostalgic. |

Each preset is a static generated CSS block under `data-theme="<id>"` (e.g. `[data-theme='archive'] { --color-primary: oklch(...); ... }`), generated once by running the derivation function over the 8 authored base values and committing the output — not recomputed at runtime, so presets have zero runtime derivation cost and are trivially theme-aware CSS.

## UI

**Entry point:** gear icon (`Settings` from `@lucide/svelte`), added to `Header.svelte` immediately left of `UserButton`, visible only when signed in (same visibility gate as the rest of the authenticated header controls).

**Panel:** shadcn `Dialog`, two-pane layout:
- Left: vertical nav list, `<button>` per section. Only "Customize Theme" exists today; structured as a small array of `{ id, label, component }` so adding a second settings section later is additive.
- Right: active section's content — for "Customize Theme", the theme picker UI:
  - Preset gallery: 5 cards, each showing the theme's name, one-line mood, and a small swatch cluster (primary/secondary/accent/background). Clicking applies immediately.
  - "Customize" toggle reveals per-token rows for the 8 base tokens: label, live swatch, click-to-open color wheel popover.
  - Color wheel: `@jaames/iro` (`iro.js`), wrapped in `frontend/src/lib/components/theme/ColorWheel.svelte` — a thin prop-in (`value: string` OKLCH/hex) / event-out (`onChange(hex: string)`) wrapper. Unit toggle (OKLCH / Hex / RGB) next to the wheel switches the numeric readout; `culori` converts between spaces. OKLCH is the default display unit.
  - "Save as..." (only shown once at least one base token diverges from the currently-active preset) prompts for a name, stores the 8 base tokens as a new custom theme.
  - Previously saved custom themes appear in the gallery alongside presets, with a delete affordance.
  - "Export" button: generates a CSS file (`@theme { --color-primary: ...; }` etc., full base + derived + rating token set) named `<kebab-case(theme-name)>.css` and triggers a browser download.

## Persistence

`localStorage` key `perspectize-theme`, shape:

```ts
interface ThemeState {
  activeThemeId: string; // preset id, or a custom theme's id
  customThemes: Array<{
    id: string; // crypto.randomUUID()
    name: string;
    tokens: BaseThemeTokens; // the 8 base tokens only
  }>;
}
```

Deliberately flat and serializable so a later phase can move it to a per-user GraphQL mutation without reshaping it — `.docs/ARCHITECTURE.md` already sketches a `user_preferences` table (`theme`, `font_preference` columns) for that future phase; this phase does not touch the backend.

**Flash-of-default-theme avoidance:** an inline `<script>` in `app.html` (runs before Svelte hydrates) reads `localStorage['perspectize-theme']`, resolves the active theme (preset → set `data-theme` attribute; custom → set inline CSS custom properties on `document.documentElement.style`), before first paint. The Svelte-side theme store (`frontend/src/lib/theme/store.ts`) re-derives from the same localStorage value on mount and takes over reactive updates from then on.

## Out of scope (this phase)

- Font picker (explicitly excluded per `.impeccable.md`).
- Backend/per-user persistence (localStorage only).
- Editing rating colors or the brand mark directly (they're derived/fixed, not exposed as editable rows).
- Any settings-panel section other than "Customize Theme."

## Testing

- `derive.test.ts`: pure-function tests for the derivation pipeline — given 8 base tokens, assert derived tokens' contrast passes AA, rating colors stay hue-separated, neutrals tint toward the primary hue. Cover an adversarial input (a base foreground/background pair with too-low contrast) to verify clamping engages.
- `theme-store.test.ts`: persistence round-trip (write → reload → same active theme), preset selection, custom save flow, delete flow, default-state-with-empty-localStorage.
- `ColorWheel.svelte` wrapper: test prop-in/event-out contract only (value renders, changing value fires `onChange` with a valid hex) — not iro.js's internal wheel-drag mechanics.
- `SettingsDialog.svelte` (or its "Customize Theme" panel component): test each distinct state — preset selected, customize-mode expanded, save-as flow producing a new custom theme, export triggering a download call — per the project's testing-principles (stateful/multi-variant component; each state must be covered so silent regressions fail loudly).

## Files touched

- `frontend/src/lib/theme/derive.ts` (new) — derivation function + types
- `frontend/src/lib/theme/presets.ts` (new) — 5 preset base-token definitions + generated CSS block
- `frontend/src/lib/theme/store.ts` (new) — Svelte state + localStorage persistence + apply-to-DOM
- `frontend/src/lib/theme/export.ts` (new) — CSS file generation + download trigger
- `frontend/src/lib/components/theme/ColorWheel.svelte` (new) — iro.js wrapper
- `frontend/src/lib/components/theme/ThemeCustomizePanel.svelte` (new) — preset gallery + custom editing UI
- `frontend/src/lib/components/SettingsDialog.svelte` (new) — gear-icon panel shell (left nav + section host)
- `frontend/src/lib/components/Header.svelte` (edit) — add gear icon trigger
- `frontend/src/app.html` (edit) — inline pre-paint theme-application script
- `frontend/src/app.css` (edit) — generated preset CSS blocks appended; base tokens annotated as the "editable 8"
- Tests: `frontend/tests/lib/theme/derive.test.ts`, `frontend/tests/lib/theme/theme-store.test.ts`, `frontend/tests/components/theme/ColorWheel.test.ts`, `frontend/tests/components/theme/ThemeCustomizePanel.test.ts`

## Self-review

- **Placeholders:** none — every section has concrete values (hue numbers are approximate/tunable by design, called out as such).
- **Internal consistency:** derived-token list matches between "Token model" and "Files touched"; persistence shape matches both the settings UI description and store responsibilities.
- **Scope:** single cohesive feature, no decomposition needed.
- **Ambiguity resolved:** "top 6-10 impactful" from the original request is fixed at 8 (matches the reconciled token model); font picker explicitly excluded to resolve the conflicting sources.
