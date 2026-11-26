# Add From Anywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add the page or video they are looking at from a Chrome extension, an iOS Shortcut, or a shared `/add?url=…` link, all through one shared add form.

**Architecture:** Move the add-form state out of `AddContentPopover` into a controller module plus a fields component, so the popover and a new `/add` route render the same form. The Chrome extension is a thin launcher that opens `/add` in a popup window and holds no auth. The iOS Shortcut opens the same URL in Safari.

**Tech Stack:** SvelteKit (Svelte 5 runes), TanStack Query, Clerk (via the `$lib/auth` facade), Vitest, Chrome Manifest V3 with plain TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-19-add-from-anywhere-design.md`

## Global Constraints

- Android, the PWA `share_target` and Capacitor are out of scope. No new code checks `isNativePlatform()` or imports `@capacitor/*`.
- Extension permissions: `activeTab` and `contextMenus` only. No `host_permissions`, no stored tokens, no auth code.
- Extension is a launcher: popup window about 480x720 at `<base>/add?url=…&title=…`; base is production by default, switchable on an options page to localhost or a PR preview.
- Default keyboard shortcut Alt+Shift+P (`commands`).
- `/add` params: `url`, `title`, `text`. Input choice: `url`, else first `http(s)` URL inside `text`, else `text`.
- "Already saved" covers only web pages (`alreadyExistsContentId`, before saving) and YouTube (`alreadyExisted`, after saving).
- Use the auth facade (`$lib/auth/useAuthState`, `components/auth/*`), never `svelte-clerk` directly.
- Comments explain the code as it stands; no ticket or history comments. Previews keep showing enough to decide (Decision 8).
- Frontend rules: Svelte 5 runes, a component that gains a `useX` hook needs that hook mocked in its tests, shadcn components from `$lib/components/shadcn`.
- Each PR: conventional commits; run `pnpm run test:run` and `pnpm run check` in `frontend/` before pushing.

## Review Focus

- A shared link whose `text` has no URL but is a Bible reference (`John 3:16`): the form pre-fills it as a passage.
- `url` present but empty or whitespace, with a usable `text`: fall back to `text`.
- `text` with trailing punctuation after the link (`see https://x.com/a.`): the extracted URL excludes the trailing `.`, `)` or `,`.
- Signed-out opener: the form is shown with a sign-in prompt and the params survive sign-in.
- Extension opened on `chrome://`, the Web Store, `file://` or `about:` pages: no popup opens; the user is told it can't be added.
- URL with `&`, `#` and non-ASCII characters passes through the extension's query string without corruption.

## File Structure

- `frontend/src/lib/components/addContent/useAddContent.svelte.ts` (create): all add-form state, derived values, mutations, handlers. One responsibility: the add-form model.
- `frontend/src/lib/components/addContent/AddContentFields.svelte` (create): the field markup, takes the controller.
- `frontend/src/lib/components/AddContentPopover.svelte` (modify): shell = `FormPopover` + controller + fields.
- `frontend/src/lib/utils/sharedInput.ts` (create): `pickAddInput`.
- `frontend/src/routes/add/+page.svelte` (create): the `/add` page.
- `frontend/src/lib/queries/content/use{AddVideo,AddMovie,AddBook,AddPassage,CreateWebPage}.ts` (modify): `quiet` option.
- `extension/` (create): `src/addUrl.ts`, `src/background.ts`, `src/options.ts`, `options.html`, `manifest.json`, `tsconfig.json`, `package.json`, `README.md`.
- `docs/add-from-ios.md` and a Settings help section (create/modify in Task 7).

---

## PR 1: Extract the add form (no behaviour change)

### Task 1: `useAddContent` controller and `AddContentFields`

**Files:**
- Create: `frontend/src/lib/components/addContent/useAddContent.svelte.ts`
- Create: `frontend/src/lib/components/addContent/AddContentFields.svelte`
- Modify: `frontend/src/lib/components/AddContentPopover.svelte`
- Test: existing `frontend/tests/components/AddContentPopover*.test.ts` (unchanged)

**Interfaces:**
- Produces: `useAddContent(options?: { quiet?: boolean }): AddContent` where `AddContent` exposes, as getters/setters or methods (the controller is a plain object whose members read `$state`/`$derived` declared in the module function):
  - state: `input` (get/set), `error`, `manualType`, `rangeOverride`, `webPageRoles`, `pickerResetToken`
  - derived: `detected`, `effectiveType`, `range`, `chipLabel`, `isPending`, `isSubmitDisabled`, `submitLabel`, `webPageAlreadySaved`, `webPagePreview`, `webPageLoading`, `webPageFailed`, `notAllowedMessage`, `isSuccess`, `bookMutation`, `movieMutation`
  - actions: `submit()`, `reset()`, `clearAll()`, `clearType()`, `changeType(e: Event)`, `paste()`, `resetOverrides()`, `setRange(r: PassageRange)`, `setRoles(r: WebPageRole[])`
  - `savedContentId: number | string | null` and `alreadySaved: boolean` derived from the successful mutation's response (`createContentFromYouTube.content.id` / `.alreadyExisted`, `createContentFromWebPage…`, and the movie/book/passage equivalents; read each hook's response type to get the exact path)
- Consumes: the five existing hooks; `detectContentType`; the validators already imported by the popover.

- [ ] **Step 1: Run the existing popover tests to record a green baseline**

Run (in `frontend/`): `pnpm exec vitest run tests/components/AddContentPopover`
Expected: all pass.

- [ ] **Step 2: Create `useAddContent.svelte.ts`** by moving, verbatim, every `let`/`$state`/`$derived`/`$effect`/function in the popover script (lines 25–243 of the current file) except `open` and the reset-on-open effect. Keep the hook creation order exactly: movie, book, web page, then passage, then video last (existing tests capture the YouTube hook's options as the last `createMutation` call). `reset()` runs the body of the old reset-on-open effect (clear fields, bump `pickerResetToken`, `untrack` the three `.reset()` calls). `submit()` is the old `handleSubmit`. The two debounce and preview effects stay inside the controller (it is called during component init, so `$effect` is legal).
- [ ] **Step 3: Create `AddContentFields.svelte`** with prop `{ add: AddContent }` rendering the old `formFields` snippet body (lines 262–371) reading from `add`. Keep ids, aria-labels and `data-testid="type-chip"` identical.
- [ ] **Step 4: Rewrite `AddContentPopover.svelte`** as: `const add = useAddContent(); let open = $state(false); $effect(() => { if (open) add.reset(); }); $effect(() => { if (add.isSuccess) open = false; });` then the same `FormPopover` props (`submitLabel={add.submitLabel}`, `isPending={add.isPending}`, `isSubmitDisabled={add.isSubmitDisabled}`, `onSubmit={add.submit}`) with `<AddContentFields {add} />` in `formFields`.
- [ ] **Step 5: Run the popover tests and the type check**

Run: `pnpm exec vitest run tests/components/AddContentPopover` then `pnpm run check`
Expected: PASS, zero new type errors. Any failure means behaviour changed: fix the move, not the tests.
- [ ] **Step 6: Commit** `refactor(frontend): extract add-content form into a controller and fields component`

### Task 2: Open PR 1

- [ ] **Step 1:** Run `pnpm run test:run` in `frontend/`. Expected: all pass.
- [ ] **Step 2:** Push, open the PR from the PR template (docs for the spec and this plan ride in this PR). Body states "Demo: no behaviour change". Then run `/revise-claude-md`.

---

## PR 2: `/add` route (branch from PR 1's branch)

### Task 3: `quiet` option on the five mutation hooks

**Files:**
- Modify: `frontend/src/lib/queries/content/useAddVideo.ts`, `useAddMovie.ts`, `useAddBook.ts`, `useAddPassage.ts`, `useCreateWebPage.ts`
- Modify: `frontend/src/lib/components/addContent/useAddContent.svelte.ts` (pass `options.quiet` through)
- Test: the matching `frontend/tests/unit/hooks-use*.test.ts`

**Interfaces:**
- Produces: each hook becomes `useX(options: { quiet?: boolean } = {})`. With `quiet: true`, `onSuccess` and `onError` skip every `toast.*` call and never call `goto`; cache updates and invalidation still run, and `console.error` in `onError` stays.

- [ ] **Step 1: Write failing tests**, one per hook, in the existing hook test files: `it('does not toast on success when quiet')` and `it('does not toast on error when quiet')`, asserting `toast.success`/`toast.warning`/`toast.error` were not called while `invalidateQueries` (or `setQueriesData` for video) still was. Also keep the existing non-quiet tests untouched.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/unit/hooks-useAddVideo.test.ts tests/unit/hooks-useAddMovie.test.ts tests/unit/hooks-useAddBook.test.ts tests/unit/hooks-useAddPassage.test.ts tests/unit/hooks-useCreateWebPage.test.ts` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement** by guarding each toast with `if (!options.quiet)`.
- [ ] **Step 4: Re-run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): quiet option on add-content mutation hooks`

### Task 4: `pickAddInput`

**Files:**
- Create: `frontend/src/lib/utils/sharedInput.ts`
- Test: `frontend/tests/unit/sharedInput.test.ts`

**Interfaces:**
- Produces: `pickAddInput(params: { url?: string | null; text?: string | null }): string`. Returns `''` when nothing usable.

- [ ] **Step 1: Write failing tests** (names are the spec):
  - `uses url when present`: `{url:'https://a.com/x', text:'ignored'}` → `'https://a.com/x'`
  - `trims url and falls back to text when url is blank`: `{url:'  ', text:'https://b.com'}` → `'https://b.com'`
  - `extracts the first http(s) link from text`: `'Check this https://c.com/p?x=1&y=2 now'` → `'https://c.com/p?x=1&y=2'`
  - `drops trailing punctuation from an extracted link`: `'see https://d.com/a.'` → `'https://d.com/a'` and `'(https://d.com/a)'` → `'https://d.com/a'`
  - `uses plain text when it has no link`: `'John 3:16'` → `'John 3:16'`
  - `returns empty when nothing usable`: `{}` → `''`
- [ ] **Step 2: Run** `pnpm exec vitest run tests/unit/sharedInput.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** with one regex `/https?:\/\/[^\s<>"]+/i` then strip trailing `.,;:!?)]}'"`.
- [ ] **Step 4: Re-run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): choose the add input from shared url, title and text`

### Task 5: `/add` page

**Files:**
- Create: `frontend/src/routes/add/+page.svelte`
- Test: `frontend/tests/components/AddPage.test.ts`

**Interfaces:**
- Consumes: `useAddContent({ quiet: true })`, `AddContentFields`, `pickAddInput`, `$page.url.searchParams` (from `$app/state`), `useAuthState()`, `SignInTrigger`, `libraryContentHref(id)` from `$lib/utils/contentLinks`.

Behaviour to implement (page layout within existing shadcn/Tailwind styles):
- On mount, `add.input = pickAddInput({ url, text })` from the query params, then `add.resetOverrides()`. The `title` param is shown as a muted line above the field only.
- Signed out: render `AddContentFields` with the submit button replaced by `SignInTrigger`; do not call `submit`.
- Signed in: a submit button using `add.submitLabel`, `add.isPending`, `add.isSubmitDisabled`, `add.submit`.
- On `add.isSuccess`: show a success state with a link "Add your perspective" to `libraryContentHref(add.savedContentId)` and a "Done" button that calls `window.close()` if `window.opener` is set or the page is a popup window (`window.history.length <= 1`), otherwise `goto('/content-library')`. If `add.alreadySaved`, the heading reads "Already saved" instead of "Added".
- When the web preview says already saved (`add.webPageAlreadySaved`), show a link to the existing item from `webPagePreview.alreadyExistsContentId`, not an error.
- Unsupported input keeps the editable form with the existing "Select a type" chip.

- [ ] **Step 1: Write failing tests** (mock `$app/state`, `$app/navigation`, `$lib/auth/useAuthState`, the five hooks, per the frontend testing gotchas):
  - `prefills the field from the url param and detects the type` (chip text `Detected: YouTube` for a youtube url)
  - `prefills from a link inside text`
  - `signed out shows sign-in instead of the submit button`
  - `submitting calls the mutation for the detected type`
  - `success shows Add your perspective linking to the content`
  - `already saved success reads Already saved`
  - `Done closes the window when opened as a popup, otherwise goes to the library`
- [ ] **Step 2: Run** `pnpm exec vitest run tests/components/AddPage.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement the page** as described.
- [ ] **Step 4: Re-run** — Expected: PASS; also `pnpm run check`.
- [ ] **Step 5: Commit** `feat(frontend): add /add page prefilled from shared url, title and text`

### Task 6: Open PR 2

- [ ] Run `pnpm run test:run`, push, open PR labelled `needs-demo-evidence` (cloud: no Clerk sign-in; local: record with the saved video tool). PR body notes the Clerk session-length setting (30-day rolling plus inactivity timeout) is the owner's dashboard change. Run `/revise-claude-md`.

---

## PR 3: Chrome extension (branch from PR 2's branch)

### Task 7: Pure helpers

**Files:**
- Create: `extension/package.json` (devDeps `typescript`, `vitest`, `@types/chrome`; scripts `build` = `tsc`, `test` = `vitest run`), `extension/tsconfig.json` (target ES2022, `outDir: dist`, `rootDir: src`), `extension/src/addUrl.ts`
- Test: `extension/src/addUrl.test.ts`

**Interfaces:**
- Produces:
  - `buildAddUrl(base: string, pageUrl: string, title?: string): string` → `<base without trailing slash>/add?url=<encoded>&title=<encoded>`; omits `title` when empty; uses `encodeURIComponent`.
  - `isAddableUrl(url: string | undefined): boolean` → true only for `http:` and `https:` and not for the Chrome Web Store host `chromewebstore.google.com` or `chrome.google.com/webstore`.

- [ ] **Step 1: Write failing tests:** `buildAddUrl` encodes `&`, `#`, spaces and `é`; drops trailing slash on base; omits empty title. `isAddableUrl` is false for `chrome://extensions`, `about:blank`, `file:///a`, `undefined`, the Web Store, `edge://x`; true for `https://youtube.com/watch?v=1` and `http://localhost:3000/`.
- [ ] **Step 2: Run** `pnpm --dir extension install` then `pnpm --dir extension test` — Expected: FAIL.
- [ ] **Step 3: Implement** both functions (use `new URL` in a try/catch for the check).
- [ ] **Step 4: Re-run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(extension): url builder and unsupported-page check`

### Task 8: Service worker, manifest, options page, README

**Files:**
- Create: `extension/manifest.json`, `extension/src/background.ts`, `extension/src/options.ts`, `extension/options.html`, `extension/README.md`, `extension/STORE_LISTING.md`
- Test: `extension/src/baseUrl.test.ts` for the pure part below

**Interfaces:**
- Produces: `getBaseUrl(stored: string | undefined): string` in `extension/src/baseUrl.ts` returning `stored` if it is a valid `http(s)` origin, otherwise `PRODUCTION_BASE` (a constant set to the production frontend origin; read it from `frontend` env docs or `.docs/FRONTEND_DEPLOYMENT.md`, and do not put the private staging URL anywhere).

- [ ] **Step 1: Write failing tests** for `getBaseUrl`: undefined → production; `'http://localhost:5173'` → itself; `'javascript:x'` and `'garbage'` → production.
- [ ] **Step 2: Run** `pnpm --dir extension test` — Expected: FAIL.
- [ ] **Step 3: Implement** `getBaseUrl`, then `manifest.json` (MV3, `permissions: ["activeTab","contextMenus","storage"]`, `action`, `background.service_worker: "dist/background.js"`, `options_page`, `commands: { "_execute_action": { suggested_key: { default: "Alt+Shift+P" } } }`, icons copied from `frontend/static/icons/`). `storage` holds only the base-URL choice; keep it and state that in the README (it is not an auth token). Background: on `action.onClicked` and `commands`, read the active tab; on a context-menu click use `info.linkUrl ?? info.pageUrl`; if `!isAddableUrl`, set a badge `!` for 2 seconds instead of opening; otherwise `chrome.windows.create({ url: buildAddUrl(...), type: 'popup', width: 480, height: 720 })`. Context menu "Add to Perspectize" registered for contexts `page` and `link` in `runtime.onInstalled`. Options page: a text input for the base URL, a preset list (production, `http://localhost:5173`), Save writes `chrome.storage.sync`.
- [ ] **Step 4: Run** `pnpm --dir extension test` and `pnpm --dir extension build` — Expected: PASS and `dist/` produced (add `extension/dist` and `extension/node_modules` to `.gitignore`).
- [ ] **Step 5:** README: build, "Load unpacked" steps, privacy statement (sends nothing except opening the page), switching base URL. `STORE_LISTING.md`: checklist (developer account, privacy policy URL needed in-app, screenshots, permission justifications).
- [ ] **Step 6: Commit** `feat(extension): launcher service worker, options page and README`

### Task 9: Open PR 3

- [ ] Run extension tests and `pnpm run test:run` in `frontend/`; push; open PR (docs/tooling only, demo reason: loads unpacked, no hosted UI change). Run `/revise-claude-md`.

---

## PR 4: iOS Shortcut help (branch from PR 3's branch)

### Task 10: Help section and rebuild doc

**Files:**
- Create: `docs/add-from-ios.md`
- Modify: the Settings page section list (find where Settings sections are composed; add a "Share from iPhone" section component with a test)
- Test: `frontend/tests/components/ShortcutHelp.test.ts`

**Interfaces:**
- Produces: `ShortcutHelp.svelte` with a constant `IOS_SHORTCUT_URL: string | null` in `frontend/src/lib/utils/shortcutLink.ts` (null until the owner supplies the iCloud link).

- [ ] **Step 1: Write failing tests:** `hides the install button when no link is set`; `shows an install link when the constant is set` (mock the module); `always shows the how-to steps`.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/components/ShortcutHelp.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the component (steps: install, share a link, choose Perspectize) and mount it in Settings. Write `docs/add-from-ios.md` describing how to rebuild the Shortcut: Receive Shortcut Input (URLs and Text from Share Sheet), Get URLs from Input, URL Encode, Open `<production>/add?url=<encoded>` in Safari.
- [ ] **Step 4: Re-run** — Expected: PASS; run `pnpm run check`.
- [ ] **Step 5: Commit** `feat(frontend): iOS Shortcut help section and rebuild doc`

### Task 11: Open PR 4

- [ ] Run `pnpm run test:run`; push; open PR labelled `needs-demo-evidence` (user-visible Settings section); note the owner supplies `IOS_SHORTCUT_URL`. Run `/revise-claude-md`.

## Self-review notes

- Spec coverage: form extraction (Tasks 1–2), `/add` with param choice, signed-out, success, already-saved, unsupported (Tasks 4–5), quiet hooks (Task 3), extension (7–9), iOS (10–11), session length (owner note in PR 2). The manifest `share_target` is deliberately absent.
- Deviation from the spec text: the spec names an `AddContentForm` component with `initialInput`/`onSaved`; this plan realises it as the `useAddContent` controller plus `AddContentFields`, because `FormPopover` owns the submit button, so the state must live above it. `/add` sets the input and reads `savedContentId` directly instead of passing `initialInput`/`onSaved`.
