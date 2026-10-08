# Settings → Contribute Tab Implementation Plan

> ⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed.
>
> **Status: Phase 1 approved (2026-10-08) — see [Decisions](#decisions). Phase 2 designed, not scheduled.** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Contribute" section to the Settings dialog. Phase 1 ships a short blurb and a "Support Perspectize" outbound link to a **Stripe Payment Link** (customer chooses amount; payouts go straight to the bank; 2.9% + $0.30, no platform cut). Phase 2 grows it into three paths: support with money, contribute as a developer, help with QA. Adding a path means adding a data entry, not new UI.

**Architecture:** This is frontend only. Settings is a modal (`SettingsDialog.svelte`), not a route. Its sections are a local `sections` array plus an `{#if}` chain keyed on `activeSection` `$state`, with no URL routing. We add a `contribute` entry and branch, and render a new `ContributePanel.svelte`. The panel maps over a typed `CONTRIBUTE_PATHS` array built in `$lib/contribute/config.ts`. Config reads build-time `import.meta.env.VITE_*` vars, as `$lib/onboarding/config.ts` already does. A path whose URL env var is unset or invalid drops out of the list. If no paths remain, or the flag is off, the tab is hidden.

**Tech Stack:** Svelte 5 runes, shadcn-svelte (`src/lib/components/shadcn/`), Tailwind v4 theme tokens, `@lucide/svelte` per-icon imports, Vitest (jsdom `unit` project) + `@testing-library/svelte` + `jest-dom`.

**Backend / DB changes:** None for Phase 1 or for the Phase 2 links. The one exception is beta-tester signup. It needs a backend user flag plus a migration only if signup is done in-app. With an external form link it needs none.

---

## Findings from repo exploration

| Area | What exists | File |
|---|---|---|
| Gear button | `<button aria-label="Settings">` sets `settingsOpen = true`. It renders **only when signed in** (`<AuthShow when="signed-in">`) | `frontend/src/lib/components/Header.svelte:56-69` |
| Settings shell | shadcn `Dialog` with a `sections: {id,label}[]` array, `<nav aria-label="Settings sections">` of plain `<button>`s, and an `{#if}` chain. Sections are `general`, `theme`, `feedback`. No `role="tab"` or `aria-current` anywhere | `frontend/src/lib/components/SettingsDialog.svelte:11-75` |
| Closest sibling panel | "Send Feedback" uses outline `Button` cards (icon + title + description) and `window.open(url,'_blank','noopener,noreferrer')`. It hard-codes `GITHUB_REPO = 'CodeWarrior-debug/perspectize'` and the bug/feature issue-template URLs | `frontend/src/lib/components/FeedbackDialog.svelte` |
| External links | Plain `<a target="_blank" rel="noopener noreferrer">`, e.g. `interlinear/InterlinearCredit.svelte`, `PassageLinks.svelte`. shadcn `Button` with `href` renders `<a>` and spreads `restProps`, so `target`/`rel` pass through | `shadcn/button/button.svelte:58-67` |
| Env vars | **`VITE_*` via `import.meta.env`**, not `$env/*/public`. They are baked in at `vite build`. `.env.example` is the source of truth. Types go in `app.d.ts` `ImportMetaEnv`. Sevalla build env vars are set in the dashboard (not in repo) | `frontend/.env.example`, `frontend/src/app.d.ts:13-18`, `src/lib/onboarding/config.ts` |
| Feature flags | No flag system. The only env flag is `VITE_DEMO_MODE === 'true'` | `src/lib/auth/demo.svelte.ts:11` |
| Tests | Flat `frontend/tests/components/*.test.ts` (jsdom). Role-based queries. Env stubbed with `vi.stubEnv`. **No axe / vitest-axe** in the repo. `SettingsDialog.test.ts` already mocks TanStack + svelte-clerk and switches sections by clicking buttons | `frontend/tests/components/SettingsDialog.test.ts`, `tests/unit/onboarding-config.test.ts` |
| Copy | Inline strings, no i18n | — |
| GitHub | `good first issue` label **exists**. Issue templates are `bug_report.md` and `feature_request.md`. **No `CONTRIBUTING.md`**; README has a short "Contributing" section | `.github/ISSUE_TEMPLATE/`, `README.md:131-135` |
| Demo tours | No tour opens Settings, so nothing breaks | `frontend/demo/` |

**Deviations from the request, with reasons:**
- `PUBLIC_BMC_URL` becomes **`VITE_SUPPORT_URL`**: provider-neutral (Stripe now, swappable without code), and `VITE_*` because the app never uses `$env/static/public`. `frontend/CLAUDE.md` notes that `$env/dynamic/public` is undefined under Vitest, and `.env.example` lists only `VITE_*`. The build-time behaviour is the same.
- The plan lives at `docs/plans/contribute-tab.md` as you asked. Repo convention is `docs/superpowers/plans/YYYY-MM-DD-*.md` .

---

## Design

### Data model (`frontend/src/lib/contribute/config.ts`)

```ts
import type { Component } from 'svelte';

export interface ContributeLink {
	id: string;
	label: string;          // visible link text, e.g. "Support Perspectize"
	href: string;           // validated https URL
}

export interface ContributePath {
	id: 'support' | 'develop' | 'qa';
	title: string;          // "Support with money"
	description: string;    // one-line blurb
	icon: Component<{ class?: string }>;   // @lucide/svelte icon component
	links: ContributeLink[]; // ≥1 after filtering, else the path is dropped
}
```

You asked for a flat `{id,title,description,href,icon}`. The Phase 2 paths have **1, 3 and 2 links** (Stripe, later + GitHub Sponsors; repo / CONTRIBUTING / good-first-issue; bug template / beta signup), so each path has `links[]`. Phase 1 is one path with one link.

`buildContributePaths(env)` is a pure function. Tests call it directly, with no module reloading.
- Each link's href comes from a constant (GitHub URLs derived from one `GITHUB_REPO`) or from an env var (`VITE_SUPPORT_URL`, Phase 2 `VITE_BETA_SIGNUP_URL`).
- `safeExternalUrl(value)` trims the value, parses it with `new URL`, and accepts **`https:` only**. That blocks a bad or `javascript:` env value from reaching an `href`.
- Links with no valid href are dropped, then paths with no links are dropped.
- Exports: `CONTRIBUTE_PATHS = buildContributePaths(import.meta.env)` and `CONTRIBUTE_TAB_ENABLED = flag && CONTRIBUTE_PATHS.length > 0`.

Phase 2 moves `GITHUB_REPO` and the issue-template URLs out of `FeedbackDialog.svelte` into a shared `$lib/contribute/github.ts`, so the QA path and Send Feedback can't drift apart.

### Feature flag (ship dark)

Add `VITE_FEATURE_CONTRIBUTE_TAB === 'true'`. This mirrors `VITE_DEMO_MODE`. It is a build-time flag, so turning it on in Sevalla needs a **rebuild/redeploy**, not just a restart. The tab is also hidden automatically when `VITE_SUPPORT_URL` is unset, so an incomplete config never shows an empty tab.

`SettingsDialog` turns `sections` into a filtered constant:
`const sections = ALL_SECTIONS.filter(s => s.id !== 'contribute' || CONTRIBUTE_TAB_ENABLED)`.

### UI (`frontend/src/lib/components/contribute/ContributePanel.svelte`)

- Props: `{ paths = CONTRIBUTE_PATHS }: { paths?: ContributePath[] }`. The default comes from config, and tests pass fixtures.
- Intro blurb (`text-sm text-muted-foreground`), matching FeedbackDialog's tone.
- `<ul>` of paths. Each `<li>` holds a card (`rounded-md border border-border p-4`; per CLAUDE.md, a bare `border` is `currentColor`).
  - The icon has `aria-hidden="true"`.
  - The title is an `<h3>`, so screen-reader users can jump between paths by heading.
  - The description sits under the title.
  - Each link is `<Button href variant="outline|default" target="_blank" rel="noopener noreferrer">`, which renders a real `<a href>`.
- Each link carries `<span class="sr-only">(opens in a new tab)</span>` and an `ExternalLink` icon (`aria-hidden`).
- The panel never closes the dialog. Unlike Feedback's `window.open` + close, a plain link lets the user middle-click or copy the address, and closing the modal on navigate is not needed.
- **Accessibility:** real anchors give Tab/Enter, context menus and screen-reader "link" role for free. Focus ring comes from Button's `focus-visible:ring`. Theme tokens only (pre-commit colour guard). No embed script or third-party JS; CSP is unchanged.
- **Phase 1** renders the same component with only the `support` path populated. Phase 2 is a data change plus env vars. No component change is expected.

### Settings nav a11y (small, optional)

The nav buttons give no "selected" signal to assistive tech. I propose adding `aria-current={activeSection === section.id ? 'page' : undefined}` to the existing button: one attribute that helps every section. A full WAI-ARIA tabs pattern (`role="tablist"`, arrow-key roving focus) is a larger change and out of scope here.

---

## Files to touch

**Phase 1**
- Create: `frontend/src/lib/contribute/config.ts` — types, `safeExternalUrl`, `buildContributePaths`, `CONTRIBUTE_PATHS`, `CONTRIBUTE_TAB_ENABLED`
- Create: `frontend/src/lib/components/contribute/ContributePanel.svelte`
- Modify: `frontend/src/lib/components/SettingsDialog.svelte` — `contribute` section id and branch, flag filter, (optional) `aria-current`
- Modify: `frontend/src/app.d.ts` — add `VITE_SUPPORT_URL?`, `VITE_FEATURE_CONTRIBUTE_TAB?`
- Modify: `frontend/.env.example` — document both (blank values)
- Create: `frontend/tests/unit/contribute-config.test.ts`
- Create: `frontend/tests/components/ContributePanel.test.ts`
- Modify: `frontend/tests/components/SettingsDialog.test.ts` — tab shown when enabled, hidden when disabled
- Ops (not in repo): set `VITE_SUPPORT_URL` (and later the flag) as **build-time** env vars on the Sevalla static site `perspectize-frontend`

**Phase 2**
- Create: `frontend/src/lib/contribute/github.ts` — `GITHUB_REPO`, issue/label/CONTRIBUTING URLs
- Modify: `frontend/src/lib/components/FeedbackDialog.svelte` — import the URLs from `github.ts` (no behaviour change)
- Modify: `frontend/src/lib/contribute/config.ts` — add `develop` and `qa` paths, plus `VITE_BETA_SIGNUP_URL`
- Modify: `frontend/src/app.d.ts`, `frontend/.env.example` — `VITE_BETA_SIGNUP_URL`
- Create: `CONTRIBUTING.md` (repo root) — needed before linking it
- Modify: tests above for the new paths
- Backend / migration only if beta signup ever moves in-app

---

## Phased task breakdown

### Phase 1 — Stripe support link (build now)

#### Task 1: Contribute config module + unit tests
**Suggested subagent:** `svelte-frontend` (tests: `vitest-writer`)

- [ ] Write `tests/unit/contribute-config.test.ts` first, against `buildContributePaths(env)` and `safeExternalUrl`:
  - [ ] valid `https://buy.stripe.com/test_abc` → one `support` path with one link
  - [ ] unset, empty or whitespace → `[]`
  - [ ] `http://…`, `javascript:alert(1)`, `not a url` → rejected
  - [ ] the flag is true only for the exact string `'true'`; `CONTRIBUTE_TAB_ENABLED` is false when the paths are empty even with the flag on
- [ ] Implement `config.ts` (pure functions, then module-level constants from `import.meta.env`)
- [ ] Add the env types to `app.d.ts` and the documented blank entries to `.env.example`
- [ ] `pnpm run test:run -- contribute-config` passes; `pnpm run check` adds no errors

#### Task 2: ContributePanel component + tests
**Suggested subagent:** `svelte-frontend` (tests: `vitest-writer`)

- [ ] Write `tests/components/ContributePanel.test.ts` against fixture `paths`:
  - [ ] `getByRole('link', { name: /support perspectize/i })` has `href` equal to the fixture URL, `target="_blank"` and `rel="noopener noreferrer"`
  - [ ] the accessible name includes "(opens in a new tab)"
  - [ ] each path title is a `heading` (level 3), and icons are `aria-hidden`
  - [ ] every link is an `<a>` with an `href`, and none has `tabindex="-1"` (so it is keyboard-reachable); `link.focus()` makes it `document.activeElement`
  - [ ] the multi-link fixture (the Phase 2 shape) renders every link, which proves no UI change is needed for new entries
  - [ ] an empty `paths` renders no list
- [ ] Implement `ContributePanel.svelte` (runes, shadcn `Button href`, lucide per-icon imports, tokens only)

#### Task 3: Wire into SettingsDialog
**Suggested subagent:** `svelte-frontend` (tests: `vitest-writer`)

- [ ] Extend `SettingsDialog.test.ts`. Mock `$lib/contribute/config` (`vi.mock`) so the enabled and disabled states are deterministic:
  - [ ] enabled: a "Contribute" nav button exists; clicking it shows the Stripe support link and hides "Restart onboarding"
  - [ ] disabled: no "Contribute" button
  - [ ] the active nav button has `aria-current="page"` and the others don't
- [ ] Add `'contribute'` to `SectionId`, the section entry (placed **after** `feedback`), the flag filter and the `{:else if}` branch
- [ ] Full verification: `pnpm run test:run`, `pnpm run check`, `pnpm exec prettier --check` on the touched files
- [ ] Label the PR `needs-demo-video`, since it is user-visible and cloud sessions can't do the Clerk browser check

#### Task 4: Ship dark → enable
- [ ] Merge with the flag unset (the tab is invisible in prod)
- [ ] Set `VITE_SUPPORT_URL` + `VITE_FEATURE_CONTRIBUTE_TAB=true` as Sevalla build env vars, rebuild, and smoke-test the link
- [ ] **Code review** (Opus): `code-reviewer` is Go-only, so the orchestrator reviews the frontend diff directly

### Phase 2 — three paths (design now, build later)

#### Task 5: Shared GitHub URLs
**Suggested subagent:** `svelte-frontend`
- [ ] Extract `GITHUB_REPO` and the issue-template URLs into `$lib/contribute/github.ts`; `FeedbackDialog` imports them; its existing tests still pass unchanged

#### Task 6: CONTRIBUTING.md
- [ ] Write the root `CONTRIBUTING.md` (setup → `.docs/LOCAL_DEVELOPMENT.md`, branch naming, PR flow, `good first issue`), and link it from the README

#### Task 7: Developer + QA paths
**Suggested subagent:** `svelte-frontend` (tests: `vitest-writer`)
- [ ] Add a `develop` path: repo, `CONTRIBUTING.md` (blob/main URL), `issues?q=is:open+label:"good first issue"`
- [ ] Add a `qa` path: bug-report template (shared URL), beta signup (`VITE_BETA_SIGNUP_URL`, dropped when unset)
- [ ] Config tests: three paths when everything is set; the beta link drops cleanly when unset. Panel tests need no change beyond fixtures, which is the data-driven acceptance check

#### Task 8 (only if signup moves in-app): beta signup backend
- [ ] Separate plan: a `db-migration` user column, a `graphql-designer` mutation, a `go-backend` service. **Not designed here.**

---

## Decisions

Provider: **Stripe Payment Link** (user decision). GitHub Sponsors is deferred to the Phase 2 developer path, because supporters there need a GitHub account. Other questions use these defaults; push back on the PR if any is wrong.

1. **Data shape:** `links[]` per path.
2. **Env var:** `VITE_SUPPORT_URL`. The real URL lives only in Sevalla and the local env file.
3. **Flag:** build-time `VITE_FEATURE_CONTRIBUTE_TAB`. Toggling it needs a Sevalla rebuild.
4. **Visibility:** signed-in only (the gear is unchanged). Revisit with a footer link later.
5. **Nav a11y:** add `aria-current="page"` to the active section button. A full ARIA tabs pattern is out of scope.
6. **Beta signup:** an external form link (no backend), in Phase 2.
7. **CONTRIBUTING.md:** Phase 2 writes it.
8. **Placement:** last, after Send Feedback. Label "Contribute"; blurb drafted in the PR.
9. **Plan location:** `docs/plans/contribute-tab.md`, as requested.
10. **a11y tests:** role- and attribute-based assertions. No new `vitest-axe` dependency.
