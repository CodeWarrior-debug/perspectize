# Add from anywhere: shared `/add` page, Chrome extension, iOS Shortcut

**Status:** design, approved approach A (2026-11-19); revised 2026-11-21 to drop Android, the PWA share target and Capacitor

## Intent

Adding content is the main point where users get stuck in Perspectize today. Content can only be added from inside the app, through the header's `AddContentPopover`. Users have to copy a link, switch to Perspectize, open the popover and paste.

The goal is to let users add the page or video they are looking at from wherever they found it. Phone and desktop matter **equally**, so the first release must cover both.

## Goals

- One tap or click from the current page or app to a pre-filled add form, on:
  - desktop Chrome, through a toolbar button, the right-click menu and a keyboard shortcut
  - iPhone/iPad, through the system share menu via an Apple Shortcut
- Every entry point uses the same form and detection logic as the in-app popover. Fixing the add flow once fixes it everywhere.
- No separate login per surface. Every entry point uses the user's normal Perspectize web session.

## Non-goals (this round)

- Reading page contents from the extension: selected text, YouTube timestamp, paywalled or logged-in page content.
- An "already added" badge on the extension icon.
- Android, the PWA Web Share Target and Capacitor/native apps. Android and the Capacitor wrapper are being removed from the product, so nothing here is built for them or checks `isNativePlatform()`.
- Firefox and Safari extensions. Edge can load the Chrome package as-is but isn't a target.
- A bookmarklet. It's cheap to add later on top of `/add`.
- **Publishing the extension to the Chrome Web Store** is a later step, decided by the owner on 2026-11-20. This round ships an extension that loads unpacked, plus a store-listing checklist. Desktop coverage for typical users arrives with publishing, which also needs a privacy policy page in the app (none exists today) and a developer account in the owner's name.

## Anti-goals (failure even if it works)

- **A second add-form implementation that drifts from the in-app one.** Anything other than a shared component is a failure.
- **The extension storing its own long-lived auth tokens** (for example in `chrome.storage`, which isn't encrypted).
- **The extension asking for broad host permissions** ("read and change all your data on all websites"). That install warning kills adoption.
- **Form changes needing a Chrome Web Store review.** The extension must stay a thin launcher.

## Current state (2026-11-19)

- **`frontend/src/lib/components/AddContentPopover.svelte`** (about 370 lines) holds all add-form state:
  - input; manual type override; passage range override; webpage roles; debounced web-page preview
  - it calls `detectContentType` on every keystroke, then one of `useAddVideo` / `useAddMovie` / `useAddBook` / `useAddPassage` / `useCreateWebPage`
  - the web-page preview reports `alreadyExistsContentId`
  - it is mounted only in `Header.svelte`
- **The frontend is a SPA.** `static/_redirects` sends every path to `index.html`, so a new client route like `/add` needs no server work.
- **Auth is Clerk** (`svelte-clerk`). Sign-in is a modal (`SignInTrigger` → `SignInButton mode="modal"`), so a signed-out user can sign in without leaving `/add`.

## Approaches considered

| | Approach | Trade-offs | Decision |
|---|---|---|---|
| **A** | **Shared `/add` page plus thin wrappers** (launcher extension, iOS Shortcut) | Covers phone and desktop in one pass. One form, one login. UI changes ship with normal deploys. The extension can't read page contents, so paywalled pages still rely on the backend preview. The iOS Shortcut is a slightly clunky install. | **Chosen** |
| B | **Extension-first, with the form bundled in the extension** | Richer desktop experience: instant inline popup, page reading, "already added" badge. Phones get nothing in phase one. Svelte, GraphQL and Clerk code is bundled into the extension. Every UI change needs Web Store review. Needs CORS for `chrome-extension://<id>` and Clerk's Chrome-extension session sync. | Deferred, see below |
| C | **Native apps with real share extensions** (for example, a Capacitor wrapper) | Best iOS experience and a first-class share menu on both phone platforms. App-store accounts and review, a native codebase, and the heaviest maintenance by far. | **Ruled out:** the Capacitor/Android app is being removed |

### Deferred options: when to revisit (recorded at the owner's request)

- **Revisit B (richer extension)** when:
  - users report adds failing or previewing badly on pages the backend can't fetch (paywalls, logins, SPAs), or
  - desktop users ask for an "already added" signal or for timestamped YouTube adds.

  A goes some way toward B without a rewrite. The extension can start reading the page with `activeTab` plus `scripting` (still no install warning) and pass extra query params to `/add`. Only an inline (non-window) form, or a badge, forces bundling the UI. Bundling then needs:
  - Clerk's Chrome extension SDK with its `syncHost` session sync from the web app (it is React-first, so check Svelte compatibility)
  - a backend CORS allowance for the extension origin
  - a Web Store review for every UI change
- **Native apps (C)** are ruled out, not deferred. If the Shortcut's install friction shows up in usage, revisit the Shortcut first.

## Design

### 1. `AddContentForm` component plus the `/add` route

- **Extract a form component.** Move the form body and state out of `AddContentPopover` into `AddContentForm.svelte`. `AddContentPopover` becomes a popover shell around it, with no change in behaviour. The form takes:
  - `initialInput?: string`, which pre-fills and runs detection immediately
  - `initialTitle?: string`, a display hint only; the stored title still comes from the server-side import
  - an `onSaved(contentId)` callback, so each host decides what happens after a save
- **New route `frontend/src/routes/add/+page.svelte`**, a full-page and phone-friendly layout of `AddContentForm`:
  - **Query params:** `url`, `title`, `text`.
  - **Choosing the input:** use `url` if it's present. Otherwise use the first `http(s)` URL found in `text`. Some apps put the link inside `text` ("Check this out https://…"). Otherwise use `text` itself, which covers a Bible reference shared as text.
  - **Signed out:** show the form read-only with a sign-in prompt (the Clerk modal). The query params survive because the modal doesn't navigate.
  - **After a save:** a success state with "Add your perspective" (goes to the new content) and "Done". "Done" calls `window.close()` when the page was opened as a popup, and otherwise goes to the content library.
  - **Already saved:** a link to the existing item, not an error. This reuses `alreadyExistsContentId`.
  - **No detectable content:** keep the form editable with the existing "not supported" messaging, so users can paste a different link.

### 2. Chrome extension (Manifest V3), a launcher only

- **Location:** a new top-level `extension/` folder in the monorepo, plain TypeScript, with no Svelte and no API client.
- **Permissions:** `activeTab` and `contextMenus` only. Neither triggers a host-permission install warning.
- **Entry points:**
  - **Toolbar button:** reads the active tab's URL and title, then opens a popup window (`chrome.windows.create({ type: 'popup', width ~480, height ~720 })`) at `<base>/add?url=…&title=…`.
  - **Right-click menu:** "Add to Perspectize" on a page (the page URL) and on a link (the link URL).
  - **Keyboard shortcut:** a `commands` entry with a suggested default (for example Alt+Shift+P), which users can change in Chrome.
- **Unsupported pages:** `chrome://` pages, the Web Store and `file://` URLs can't be added. On these, show a badge or notification instead of opening an empty form.
- **Base URL:** production by default, with a dev build that targets localhost.
- **No auth code.** The popup window is first-party `perspectize` content, so Clerk's cookies apply as normal.
- **Publishing:** a Chrome Web Store listing needs a privacy policy URL. The extension sends no data anywhere except by opening the Perspectize page.

### 3. iOS Shortcut

- **What it does:** a published Apple Shortcut that accepts URLs (and text) from the share menu and opens `<base>/add?url=…` in Safari.
- **Where users find it:** an install link on a short help section, reachable from Settings and from the `/add` page on iOS.
- **What's not in the repo:** the Shortcut itself, which is an iCloud link. The repo has the help copy and a doc describing how to rebuild the Shortcut.
- **Who builds it:** the owner, on an Apple device signed into their iCloud account, from the rebuild doc. PR 4 ships the help copy and the rebuild doc, and the install link is added once the owner provides it. No dead link ships: the install button stays hidden until the link is set.

### 4. Session length (configuration, not code)

- **Recommendation:** a 30-day rolling session with an inactivity timeout, set in the Clerk dashboard. Clerk's default is 7 days.
- **Why it suffices:** every entry point rides the web session, so this one setting covers all of them. Clerk's short-lived session token (about 60 seconds) keeps refreshing in the browser.
- **Who changes it:** the owner, in the Clerk dashboard. Note it in the PR body.

## Delivery (stacked or sequential PRs)

1. **Extract `AddContentForm` from `AddContentPopover`** (refactor, no behaviour change). The existing popover tests must pass unchanged.
2. **Add the `/add` route and the param parsing.** Label `needs-demo-video`.
3. **Add the `extension/` package**, with a README on loading it unpacked and a store-listing checklist.
4. **Add the iOS Shortcut help section and the doc for rebuilding the Shortcut.**

## Testing

- **Vitest:**
  - choosing the input from `url` / `title` / `text` (link inside text, plain text, nothing)
  - `AddContentForm` pre-fill runs detection
  - the success, already-saved and signed-out states on `/add`
- **Existing tests:** `AddContentPopover` tests stay green after the extraction.
- **Extension:**
  - unit-test the URL builder and the unsupported-scheme check
  - load it unpacked manually for a local demo
- **Out of scope for cloud sessions:** browser and sign-in checks are local-only, per CLAUDE.md.

## Calls made during review (author's, correctable)

- **Duplicates:** in this round, "Already saved" covers only the types that already report it: web pages (`alreadyExistsContentId`, before saving) and YouTube (`alreadyExisted`, after saving). Movies, books and passages show the normal success state when the item already exists. Saving one again does no harm. Reporting duplicates for those types needs a backend response field, which is a follow-up.
- **Hook side effects:** the mutation hooks keep their toasts and `goto` actions by default, so the in-app popover is unchanged (PR 1 stays a pure refactor). In PR 2 the hooks gain an opt-out option (for example `{ quiet: true }`), and `/add` passes it so its success screen is the only feedback.
- **Target host:** the extension defaults to the production origin and has an options page to switch to localhost or a PR-preview origin for testing. The Shortcut targets production only.

## Left to the builder

- Exact `/add` layout and copy, within the existing shadcn and Tailwind styles. Previews must keep showing enough to decide without leaving the page (CLAUDE.md, Decision 8).
- Extension icon assets, reusing `frontend/static/icons/`.
- The default keyboard shortcut, if Alt+Shift+P clashes.
