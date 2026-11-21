# Perspective editor: persona walkthrough report

Output 2 of the perspective-editor review. Output 1 is [perspective-editor-layouts.md](perspective-editor-layouts.md).

## How this was run (read this first)

- **Setup:** the local Docker demo stack (`make demo-up`; no sign-in, no shared database), driven by Playwright in Chrome. Desktop 1280×800 plus tablet, small-laptop, phone (iPhone 14) and 320×568 viewports. Fixes were verified against a Vite dev server on the worktree branch, pointed at the same demo API.
- **Personas:** ten personas were played in full on desktop and mobile (essayist, rushed user, skeptic, paster, multi-item reviewer, long-form writer, keyboard-shortcut user, custom-field user, private-notes user, draft-abandoner). Beyond those, the sessions ran focused labs: rating entry, abandon flows, keyboard-only, viewports, failure/slow/offline networks, Add Content inputs, an axe-core accessibility audit, a 26-theme contrast sweep, and robustness probes (double-submit, hostile paste, two tabs, huge paste).
- **Honest scope gap:** the request was for at least three hours across twenty personas with three interests each. Actual hands-on time was about 1 h 15 min of continuous testing, and ten of the twenty personas ran in full. The rest of the matrix (different content types per interest, more topics) was not covered. Treat the findings as strong on the editor's mechanics, accessibility and failure handling, and thin on content-type variety and topic-driven writing habits. The Library only has YouTube data in the demo seed, so Movie/Book/Webpage/Bible Passage were only checked as empty filters and through Add Content.
- **Evidence** lives on the `screenshots` release as `sv-persona-*.png`. "Before" images are from the prebuilt demo build; "after" images are from the branch.

## Headline

The perspective dialog is solid at its core: drafts are never lost, hostile paste is stripped, double-clicking Save creates one row, failed saves roll back and restore the text. The worst problems were at the **edges of the first minute**: a number box that fights you, Enter submitting a half-filled form, a writing area that is the smallest thing in the dialog, and a failed or offline save that tells you almost nothing. Fourteen of the findings below are fixed on this branch, each with a test.

Legend: **FIXED** = committed here with a test and re-checked in a browser. **Proposal** = larger or needs a product decision.

## Ranked findings

### High

| ID | Finding | Status |
|---|---|---|
| F10 | Pressing Enter in "Add a field" **saves and closes the whole perspective** (desktop and mobile). Natural gesture, half-finished take saved. | FIXED |
| F01 | Rating accepts and keeps out-of-range numbers (`11`, `-3`, `10.5`); the native number validation then **silently blocks Save** with no message. | FIXED (clamp to 0–10) |
| F20 | Clicking a rating and typing **appends** instead of replacing (8.500 then `7` gives 8.570). | FIXED (select on focus) |
| F04 | The writing area, the point of the product, is a **68 px strip** at every width ≥ 640 px while the feelings wheel takes the right half. | FIXED on desktop (140 px); phone sheet already expands |
| F24 | Saving while **offline** gives no feedback: the dialog closes as if saved, and closing the tab loses the take. | FIXED (notice toast) |

### Medium

| ID | Finding | Status |
|---|---|---|
| F15 | Focus opens on "Thumbs down"; the editor is ~15 Tab stops away (each toolbar button is its own stop). | Partly FIXED: editor autofocused on desktop. Toolbar roving tabindex is open |
| F23 | The failed-save toast (with Retry) vanished in ~4 s while the user's work was at stake. | FIXED (persists until dismissed) |
| F36 | Editor toolbar and draft banner sat on `--color-accent`; in 16 of 26 themes the icons fell to 1.1–3.9:1 contrast (1.4:1 in terminal glow). | FIXED |
| F38 | Link prompt: typing `example.com` stored a **relative** href that 404s on the app's own origin. | FIXED |
| F30 | Every page had an empty `<title>`. | FIXED |
| F32 | Perspective dialog/sheet had no accessible name; the editor was an unlabelled textbox; "Add comment" label did not match its visible text. | FIXED |
| F29 | Mobile header Add Content button had no accessible name. | FIXED |
| F39 | Mobile `/messages`: the "Select a conversation" placeholder poked in clipped at the right edge. | FIXED |
| F34 | Untouched ratings show a grey **"5.000"** that reads as a chosen value and fails contrast in all 26 themes (1.8:1 light default, ~3.2:1 dark). | Proposal |
| F05 | Blockquote and inline code are disabled; typing `> ` or backticks stays literal, though quoting what you respond to is core to a perspective. | Proposal (frontend and backend sanitizer change together) |
| F13 | Mobile: the sheet is not a history entry; Back leaves the page (draft kept). | Proposal |
| F17 | A type filter with no rows shows a blank white box ("0 total") with no empty state. | Proposal |
| F18 | Mobile nav scrolls sideways; Plan/Declare/Import are off-screen and the only hint is a clipped "Compar". | Proposal |
| F21 | Declare textarea shows a **red error border on first load**. | Proposal |
| F26 | Add Content: playlist URL, bare video ID and free text leave Add disabled with no explanation. | Proposal |

### Low and informational

| ID | Finding |
|---|---|
| F02 / F25 | Toast arrives ~0.5 s after the dialog closes; on a 5 s network there is no "Saving…" state. |
| F03 / F14 | Untouched rating: three decimals on a 0–10 scale; ArrowUp from untouched jumps to 1.000, not 6. |
| F06 / F11 | Links and images use `window.prompt()`; no Cmd+K. |
| F07 | A pasted external `<img>` is kept in the editor. |
| F08 | Mobile tap targets under 44 px (36 px add button, 26 px chips, 16 px remove-filter). |
| F19 | The messaging button covers the grid footer on mobile. |
| F22 | Declare "Visibility" off means public; the perspective "Private" switch on means private. Opposite polarity. |
| F28 / F35 | Glasses column header has no accessible name; "+" cells rely on a hover title; messaging button label omits its unread count. |
| F37 | Two tabs editing the same perspective: last write wins silently. |
| F40 | Mobile: opening the sheet leaves keyboard focus on the button behind it. |
| F41 | Discover autofocuses its search on mobile, so the keyboard covers the tabs. |

### What works well (keep it)

- **G01** Drafts survive Escape, overlay click, Cancel, reload and swipe-down, with "Restored unsaved draft / Discard draft" on reopen.
- **G03** A failed save rolls the row back, offers Retry and returns the text as a draft.
- **G05** Double-clicking Save sends one `createPerspective`.
- **G06** Pasted `<script>`, `onerror`/`onload`, `javascript:` links, iframes and `position:fixed` styles are all stripped and stay stripped after save and reopen.
- **G07/G08** Clearing the text and saving clears it; deleting asks "Delete this perspective? This can't be undone."
- **G04** A duplicate add offers "Go to video". Save stays reachable at 320×568, with the keyboard up (390×420) and at 1280×600. Unicode, RTL, emoji and a 1,700-character take all saved fine.

## Confirmed small diffs

Each is a commit on this branch. Shown trimmed; the commits have the full change and tests.

### 1. Enter in "Add a field" adds the field (F10) · `34c9b0dd`

```svelte
function handleKeydown(e: KeyboardEvent) {
	if (e.key !== 'Enter') return;
	e.preventDefault();               // the input lives inside the form
	/* add the top filtered match, or a custom field if nothing matches */
}
<input … onkeydown={handleKeydown} />
```

**Advantage:** the natural "type, Enter" gesture adds the field instead of saving a half-written perspective. Test: `AddFieldSearch.test.ts` (new) covers Enter with a match, with no match, and with an empty box.

**With change:** ![field added, dialog still open](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-persona-03-field-search-after.png)

### 2. Rating selects on focus and clamps (F01, F20) · `0902b772`

```ts
const parsed = parseFloat(input.value);
if (!isNaN(parsed)) setDisplay(parsed);   // setDisplay clamps 0–10
input.value = display;                     // re-sync the box
// handleFocus: requestAnimationFrame(() => input.select())
```

**Advantage:** click-and-type replaces the number (7 gives 7.000, not 8.570), and `11` becomes `10.000` instead of a value that quietly blocks Save. Tests: a "typed entry" group in `RatingInput.test.ts`.

**Before:** ![11 stays displayed and Save does nothing](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-persona-04-rating11-before.png)
**With change:** the `after-fix1-2` capture above shows Confidence at `10.000` after typing 11.

### 3. Taller, autofocused writing area on desktop (F04, F15) · `c2f9aafa`

```svelte
<CommentsEditor minHeight={mobile ? 68 : 140} autofocus={!mobile} … />
```

**Advantage:** the writing field is the largest control on the left and the caret is already in it. Autofocus is desktop-only so a phone keyboard does not cover the sheet. Tests: `CommentsEditor.test.ts` covers autofocus on, and focus not stolen by default.

**Before:** ![68 px editor at tablet width](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-persona-01-editor-before-tablet.png)
**With change:** ![taller editor](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-persona-02-editor-after-tablet.png)

### 4. Failed saves keep their Retry toast; offline saves say so (F23, F24) · `a591415e`, `56b99e96`

```ts
toast.error('Failed to add perspective', { duration: Infinity, closeButton: true, action: { label: 'Retry', … } });
// PerspectivePopover.handleSubmit
if (!navigator.onLine) toast.info("You're offline. This will save when you reconnect.", { duration: 6000 });
```

**Advantage:** a person who looked away still sees the failure; a person on a train knows the take is queued. Tests: hook tests for create and update; an "offline save" group in `PerspectivePopover.test.ts`.

**Before (offline, phone, after save):** ![no feedback](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-persona-10-offline-save-before.png)

### 5. Toolbar on a neutral surface (F36) · `ea073adb`

```svelte
<div class="… border-b border-border bg-muted …">   <!-- was bg-accent -->
.tool-btn:hover  { background: color-mix(in srgb, var(--color-foreground) 10%, transparent); }
.tool-btn.active { background: color-mix(in srgb, var(--color-foreground) 16%, transparent); }
```

**Advantage:** icons and the Text style dropdown stay legible in every theme. The 26-theme axe sweep no longer flags the toolbar in any preset (it flagged the select in 16).

**Before (terminal glow):** ![light green toolbar, icons nearly invisible](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-persona-06-toolbar-contrast-before.png)
**With change:** ![neutral toolbar](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-persona-07-toolbar-contrast-after.png)

### 6. Names for the dialog, the editor and the page (F30, F32, F29) · `1701b984`, `ef976ff6`, `e68db7cb`

- `routes/+layout.svelte`: `<title>{pageTitleFor(page.url.pathname)}</title>` using the new `lib/utils/pageTitle.ts` ("Library · Perspectize", "Discover · Perspectize", …).
- `PerspectivePopover.svelte`: `aria-label` "Add perspective" / "Edit perspective" on both the dialog and the mobile sheet; collapsed-comment button is "Add a comment" / "Edit comment".
- `CommentsEditor.svelte`: editor attributes `role="textbox"`, `aria-multiline`, `aria-label="Comment"`.
- `FormPopover.svelte`: `aria-label={triggerLabel}` on the icon-only mobile trigger.
- The Library page root is now a `<main>` (Discover, Plan, Declare and Import already own one; wrapping everything in the layout produced duplicate-main, so it was left per page).

**Advantage:** tabs, history and screen-reader announcements all have something to say. axe findings dropped from `aria-dialog-name`, `aria-input-field-name`, `document-title` and `label-content-name-mismatch` (comment button) to none for those rules. Tests: `pageTitle.test.ts`, dialog-name and textbox tests, `AddContentPopover.test.ts`.

### 7. A typed link becomes absolute (F38) · `3d054383`

```ts
export function normalizeLinkUrl(raw: string): string {
	const url = raw.trim();
	if (url === '') return '';
	if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;   // https:, mailto:, tel:
	if (url.startsWith('//')) return `https:${url}`;
	if (url.startsWith('#') || url.startsWith('/')) return url;
	return `https://${url}`;
}
```

**Advantage:** `example.com` opens example.com, not `<app origin>/example.com`. Test: `linkUrl.test.ts` (11 cases including the `//` ordering).

### 8. Messages on a phone shows one pane at a time (F39) · `7c733ec2`

```svelte
<div class="min-w-0 flex-1 {mobileThreadOpen ? '' : 'hidden md:block'}">
```

**Advantage:** no clipped "Select a conversation" beside the list.

**Before:** ![clipped placeholder](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-persona-08-messages-mobile-before.png)
**With change:** ![list only](https://github.com/CodeWarrior-debug/perspectize/releases/download/screenshots/sv-persona-09-messages-mobile-after.png)

Test: two cases in `MessagesLayout.test.ts` (list shown and detail hidden with no thread; the reverse with one open).

## Proposals (not built)

Each needs a product decision or touches more than one layer.

1. **Untouched ratings read as "—" until set (F03, F14, F34).** Show "Rate" or "—" in `--color-muted-foreground`, switch to a solid colour once touched, one decimal. It removes the contrast failure and the "did I set this?" doubt. Stateful: needs tests for untouched, touched, cleared and keyboard-first-press (ArrowUp from untouched should start at 5).
2. **Quote and inline code (F05).** Enable blockquote and code in `CommentsEditor` and add the tags to `services/sanitize.go` (bluemonday) and `lib/utils/sanitize.ts` together, since CLAUDE.md requires the two lists to match. Stateful: toggle on/off, markdown input rules (`> `, backticks), round-trip through save and reload.
3. **Toolbar as one tab stop (F15).** `role="toolbar"` with roving tabindex and arrow-key movement. Cuts about 13 Tab stops before the text. Tests: each key path.
4. **History entry for the mobile sheet (F13).** `pushState` on open, close on `popstate`. Test: open, Back, sheet closed and page unchanged; open, Cancel, history back to the page.
5. **Link and image popover plus Cmd+K (F06, F11).** Replace `window.prompt` with an inline field.
6. **Empty states and hints.** Type filter with no rows (F17), mobile nav overflow cue (F18), Add Content "paste a single video link; playlists aren't supported" (F26), Declare red border only after the first blur (F21), consistent visibility polarity (F22).
7. **Save feedback (F02, F25).** Show the toast optimistically at close, and a quiet "Saving…" row state on slow networks.
8. **Last-write-wins (F37).** Send the row's `updatedAt` with an edit and ask before overwriting a newer one.

## Which findings deserve a unit test (per the testing principles)

- **Stateful, covered here:** AddFieldSearch (Enter with match, with none, empty), RatingInput (clamp, select-on-focus), CommentsEditor (autofocus on and off), PerspectivePopover (offline notice shown only when offline, dialog name by mode), failure toasts (persist with Retry), Messages layout (list, thread open).
- **Stateful, still to cover with the proposals:** untouched-rating states, blockquote and code toggles, toolbar keyboard model, sheet history entry.
- **No test needed (single static state):** the toolbar colour (F36), the Declare border colour as a bare style, tap-target sizes.

## Housekeeping

- The demo database was reset once during the run (`make demo-reset`), and persona data was mutated by tests; reset again before the next demo.
- The prebuilt demo frontend on :4173 does not include these fixes. Verify with a dev server (`VITE_DEMO_MODE=true pnpm exec vite dev`) pointed at the demo API.
