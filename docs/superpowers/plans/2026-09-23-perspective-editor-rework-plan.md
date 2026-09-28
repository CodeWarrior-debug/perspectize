# Perspective Editor Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix data-loss risk in perspective writing (no autosave today) and extend the Tiptap editor from a bare comment-box (bold/italic/underline/lists only) to a "sophisticated, visually interesting HTML" editor: headings (H2/H3), links, image-by-URL, and tables (structural editing gated to desktop). Add server-side HTML sanitization so trust isn't 100% client-side.

**Architecture:** A new `frontend/src/lib/components/PerspectiveEditor.svelte` replaces `CommentEditor.svelte` for perspective writing (comments elsewhere in the app keep using `CommentEditor.svelte` unmodified). The new component builds its Tiptap `Editor` from a data-driven toolbar config (`{id, icon, isActive, run}[]`) instead of hardcoded buttons, adds `Heading` (levels 2-3 only), `Link`, `Image` (URL-insert only, no upload), and `Table`/`TableRow`/`TableCell`/`TableHeader` (structural buttons — insert table, add/delete row/column — rendered only above the existing `(max-width: 639px)` breakpoint; `resizable: false` everywhere). A local-draft layer (`frontend/src/lib/utils/perspectiveDraft.ts`) debounce-persists editor HTML to `localStorage` keyed by content+user, independent of the Save button, with restore-on-reopen and clear-on-confirmed-save. `sanitizeHtml()`'s DOMPurify allowlist is extended to match the new tags/attrs. Backend adds `bluemonday` sanitization of `Review` in `perspective_service.go`'s create/update paths, mirroring (not replacing) the frontend sanitizer.

**Tech Stack:** Go 1.25+, gqlgen (schema-first, no schema changes needed — `review: String` stays a plain string), Svelte 5 runes, `@tanstack/svelte-query`, Tiptap v3 (`@tiptap/core` + new extension packages pinned to the existing `^3.31.3`), DOMPurify, bluemonday.

**Prior research (this session):** current `CommentEditor.svelte` (202 lines, hardcoded bold/italic/underline/list buttons, no link/image/table extensions), `PerspectivePopover.svelte` (537 lines, two stale "TODO: Backend integration" comments at L90/L99 that no longer apply — `review`/`customFields`/`feelings` are already fully wired end-to-end), `CommentFullscreen.svelte` (47 lines, mobile fullscreen editor, no unsaved-changes guard on close). Backend does zero HTML sanitization today (`bluemonday` is present only as an unused transitive dependency in `go.sum`, not in `go.mod`). No existing "unsaved changes" confirm pattern anywhere in the frontend to reuse.

## Global Constraints

- Branch: `claude/html-editor-wysiwyg-review-yq50w8` (per session instructions).
- `CommentEditor.svelte` stays as-is and in use for non-perspective comment UIs elsewhere in the app — do not modify it. All new work targets a new `PerspectiveEditor.svelte`.
- No GraphQL schema change: `review: String` on `Perspective`/`CreatePerspectiveInput`/`UpdatePerspectiveInput` is unchanged (structured/JSON storage was explicitly deferred — see prior discussion — do not attempt it in this plan).
- Table structural editing (insert table, add/remove row/column, resize) is desktop-only; editing text inside existing table cells works on all breakpoints. Use the same `(max-width: 639px)` breakpoint check already used in `PerspectivePopover.svelte` for the desktop/mobile split.
- Image support is URL-insertion only — no file upload, no storage/CDN work.
- Svelte 5 runes only (`$state`, `$derived`, `$effect`), TanStack Query v5+ function-wrapper pattern — per `frontend/CLAUDE.md`.
- Delete the two stale "TODO: Backend integration" comments in `PerspectivePopover.svelte` (L90, L99) as part of whichever task first touches that file — they describe already-completed wiring.

---

## File Structure

**Frontend:**
- Modify: `frontend/package.json` — add `@tiptap/extension-link`, `@tiptap/extension-image`, `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header` at `^3.31.3`
- Modify: `frontend/src/lib/utils/sanitize.ts` — extend ALLOWED_TAGS/ALLOWED_ATTR
- Create: `frontend/src/lib/utils/perspectiveDraft.ts` — localStorage draft persistence helpers
- Create: `frontend/tests/unit/perspectiveDraft.test.ts`
- Create: `frontend/src/lib/components/PerspectiveEditor.svelte` — data-driven toolbar, new extensions
- Create: `frontend/tests/components/PerspectiveEditor.test.ts`
- Modify: `frontend/src/lib/components/PerspectivePopover.svelte` — swap `CommentEditor` → `PerspectiveEditor`, wire draft restore/clear, remove stale TODOs
- Modify: `frontend/src/lib/components/CommentFullscreen.svelte` — swap `CommentEditor` → `PerspectiveEditor`, add unsaved-changes guard on close
- Modify: `frontend/tests/components/PerspectivePopover.test.ts` — update for new component + draft behavior

**Backend:**
- Modify: `backend/go.mod` — add `github.com/microcosm-cc/bluemonday` as a direct dependency
- Create: `backend/internal/core/services/sanitize.go` — `sanitizeReview(html string) string` using a bluemonday policy matching the frontend allowlist
- Modify: `backend/internal/core/services/perspective_service.go` — call `sanitizeReview` on `input.Review` in both create (~L114) and update (~L237-239) paths
- Modify/Create: `backend/internal/core/services/perspective_service_test.go` — sanitization tests

---

## Task 1: Backend — server-side sanitization

**Files:**
- Modify: `backend/go.mod`
- Create: `backend/internal/core/services/sanitize.go`
- Modify: `backend/internal/core/services/perspective_service.go` (~L114 create path, ~L237-239 update path)
- Test: `backend/internal/core/services/perspective_service_test.go`

**Interfaces:**
- Produces: `sanitizeReview(html string) string`, called from `PerspectiveService.Create`/`Update` before persisting `Review`.

- [ ] **Step 1: Add bluemonday as a direct dependency**

```bash
cd backend && go get github.com/microcosm-cc/bluemonday@v1.0.27
```

Verify it appears in `go.mod`'s `require` block (it's currently only a transitive entry in `go.sum`).

- [ ] **Step 2: Write the sanitizer**

Create `backend/internal/core/services/sanitize.go`. Policy must mirror the frontend allowlist being extended in Task 2 (`p, br, strong, b, em, i, u, ul, ol, li, a[href,target,rel], span, h2, h3, img[src,alt,width,height], table, thead, tbody, tr, th, td`):

```go
package services

import "github.com/microcosm-cc/bluemonday"

func newReviewPolicy() *bluemonday.Policy {
	p := bluemonday.NewPolicy()
	p.AllowElements("p", "br", "strong", "b", "em", "i", "u", "span", "ul", "ol", "li")
	p.AllowElements("h2", "h3")
	p.AllowElements("table", "thead", "tbody", "tr", "th", "td")

	p.AllowAttrs("href").OnElements("a")
	p.AllowAttrs("target").OnElements("a")
	p.AllowAttrs("rel").OnElements("a")
	p.RequireNoFollowOnLinks(false) // frontend already sets rel explicitly; don't fight it
	p.AllowStandardURLs()

	p.AllowAttrs("src", "alt", "width", "height").OnElements("img")
	p.AllowURLSchemes("http", "https")

	return p
}

var reviewPolicy = newReviewPolicy()

// sanitizeReview strips any HTML outside the perspective editor's supported
// tag set, mirroring frontend/src/lib/utils/sanitize.ts's DOMPurify config.
// This is defense-in-depth: the API must not trust HTML from non-browser
// clients that bypass the frontend's DOMPurify pass.
func sanitizeReview(html string) string {
	return reviewPolicy.Sanitize(html)
}
```

- [ ] **Step 3: Write failing tests**

Add to `backend/internal/core/services/perspective_service_test.go` (create the file if it doesn't exist, following the mock-repo pattern used in `backend/test/resolvers/*_test.go`):

```go
func TestSanitizeReview_StripsScriptTags(t *testing.T) {
	in := `<p>hello</p><script>alert(1)</script>`
	got := sanitizeReview(in)
	assert.Equal(t, "<p>hello</p>", got)
}

func TestSanitizeReview_AllowsTablesAndImages(t *testing.T) {
	in := `<table><tr><td>a</td></tr></table><img src="https://x.com/y.png" alt="z">`
	got := sanitizeReview(in)
	assert.Contains(t, got, "<table>")
	assert.Contains(t, got, `<img src="https://x.com/y.png" alt="z"`)
}

func TestSanitizeReview_StripsJavascriptURLs(t *testing.T) {
	in := `<a href="javascript:alert(1)">click</a>`
	got := sanitizeReview(in)
	assert.NotContains(t, got, "javascript:")
}
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd backend && go test ./internal/core/services/... -run TestSanitizeReview -v
```

Expected: compile error (`sanitizeReview` doesn't exist yet if Step 2 hasn't landed) or FAIL until Step 2's file is present — run this after Step 2 is written to confirm the tests actually exercise it, then proceed.

- [ ] **Step 5: Wire into create/update paths**

In `backend/internal/core/services/perspective_service.go`, create path (~L92-114, where `domain.Perspective{...}` is built with `Review: input.Review`):

```go
var sanitizedReview *string
if input.Review != nil {
	s := sanitizeReview(*input.Review)
	sanitizedReview = &s
}
// ... use sanitizedReview in place of input.Review when constructing domain.Perspective
```

Update path (~L237-239):

```go
if input.Review != nil {
	s := sanitizeReview(*input.Review)
	existing.Review = &s
}
```

- [ ] **Step 6: Run tests, build, full suite**

```bash
cd backend && go build ./...
cd backend && go test ./...
```

Expected: zero errors, all pass, including the new sanitize tests and existing `perspective_service`/resolver tests (create/update paths still behave the same for already-clean HTML).

- [ ] **Step 7: Commit**

```bash
git add backend/go.mod backend/go.sum backend/internal/core/services/sanitize.go backend/internal/core/services/perspective_service.go backend/internal/core/services/perspective_service_test.go
git commit -m "feat(perspective): sanitize review HTML server-side with bluemonday"
```

---

## Task 2: Frontend — extend the sanitizer allowlist

**Files:**
- Modify: `frontend/src/lib/utils/sanitize.ts`
- Modify: `frontend/src/lib/components/SafeHtml.svelte` (add render styles for new tags)

**Interfaces:**
- Produces: `sanitizeHtml()` now permits `h2`, `h3`, `img[src,alt,width,height]`, `table/thead/tbody/tr/th/td` — consumed by `PerspectiveEditor.svelte` (Task 4) on save and by `SafeHtml.svelte` on render.

- [ ] **Step 1: Update ALLOWED_TAGS / ALLOWED_ATTR**

In `frontend/src/lib/utils/sanitize.ts`, extend the existing DOMPurify config (current ALLOWED_TAGS: `p, br, strong, b, em, i, u, ul, ol, li, a, span`; ALLOWED_ATTR: `href, target, rel, class`):

```ts
ALLOWED_TAGS: [
	'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span',
	'ul', 'ol', 'li',
	'a',
	'h2', 'h3',
	'img',
	'table', 'thead', 'tbody', 'tr', 'th', 'td',
],
ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'width', 'height'],
ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
```

(The `ALLOWED_URI_REGEXP` line is DOMPurify's documented way to explicitly restrict URI schemes on `href`/`src` — confirm current config doesn't already set one before adding; if it does, just extend it rather than duplicate the key.)

- [ ] **Step 2: Add render styles for new tags**

In `frontend/src/lib/components/SafeHtml.svelte`'s `.safe-html` style block, add basic styles so rendered perspectives don't look broken (heading sizing, table borders, responsive image):

```css
.safe-html :global(h2) { font-size: 1.25rem; font-weight: 600; margin: 0.75rem 0 0.25rem; }
.safe-html :global(h3) { font-size: 1.1rem; font-weight: 600; margin: 0.5rem 0 0.25rem; }
.safe-html :global(img) { max-width: 100%; height: auto; border-radius: 4px; }
.safe-html :global(table) { border-collapse: collapse; width: 100%; overflow-x: auto; display: block; }
.safe-html :global(th),
.safe-html :global(td) { border: 1px solid var(--border); padding: 4px 8px; text-align: left; }
```

- [ ] **Step 3: Add/extend unit tests for sanitizeHtml**

If `frontend/tests/unit/sanitize.test.ts` (or similar) exists, add cases; otherwise create one asserting: `<h2>`/`<h3>`/`<table>`/`<img src="https://...">` pass through, `<script>` and `javascript:` URLs are stripped, `<img src="javascript:alert(1)">` is stripped.

```bash
cd frontend && pnpm exec vitest run tests/unit/sanitize.test.ts
```

- [ ] **Step 4: Type-check and commit**

```bash
cd frontend && pnpm run check
git add frontend/src/lib/utils/sanitize.ts frontend/src/lib/components/SafeHtml.svelte frontend/tests/unit/sanitize.test.ts
git commit -m "feat(perspective): allow headings/images/tables through sanitizeHtml"
```

---

## Task 3: Frontend — add Tiptap extension packages

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install extensions at the pinned Tiptap v3 version**

```bash
cd frontend && pnpm add @tiptap/extension-link@^3.31.3 @tiptap/extension-image@^3.31.3 @tiptap/extension-table@^3.31.3 @tiptap/extension-table-row@^3.31.3 @tiptap/extension-table-cell@^3.31.3 @tiptap/extension-table-header@^3.31.3
```

- [ ] **Step 2: Verify install and lockfile**

```bash
cd frontend && pnpm run check
```

Expected: no errors; `pnpm-lock.yaml` updated.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "chore(deps): add tiptap link/image/table extensions"
```

---

## Task 4: Frontend — `PerspectiveEditor.svelte`

**Files:**
- Create: `frontend/src/lib/components/PerspectiveEditor.svelte`
- Test: `frontend/tests/components/PerspectiveEditor.test.ts`

**Interfaces:**
- Consumes: `Editor`/`StarterKit` (as in `CommentEditor.svelte`), `Underline`, `Placeholder`, new `Link`, `Image`, `Table`/`TableRow`/`TableCell`/`TableHeader`; a `isMobile` boolean prop (caller passes the same media-query result `PerspectivePopover.svelte` already computes) to gate structural table/toolbar controls.
- Produces: same public prop surface as `CommentEditor.svelte` (`value`, `onChange`, `minHeight`, `placeholder`, `showPopout`, `onPopout`) plus `isMobile`.

- [ ] **Step 1: Write the failing test (toolbar renders data-driven, respects isMobile)**

Create `frontend/tests/components/PerspectiveEditor.test.ts` covering: default toolbar buttons render (bold/italic/underline/lists/heading dropdown/link/image), "insert table" button renders when `isMobile={false}` and does not render when `isMobile={true}`, clicking bold toggles the mark (use `@testing-library/svelte` + a minimal DOM-based Tiptap smoke test — follow whatever pattern, if any, `frontend/tests/components/` uses for other Tiptap-adjacent components; if none exists, keep assertions to DOM presence/absence of buttons by `aria-label` rather than deep editor-state assertions, since full ProseMirror behavior isn't practical to unit test).

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && pnpm exec vitest run tests/components/PerspectiveEditor.test.ts
```

- [ ] **Step 3: Build the component**

Base it on `CommentEditor.svelte`'s structure (props, `onMount`, `$effect` value-sync — copy that pattern verbatim, it's sound) but:

1. Extensions list adds `Link.configure({ openOnClick: false, autolink: false })`, `Image`, `Heading.configure({ levels: [2, 3] })` (via StarterKit's heading option, re-enabled), `Table.configure({ resizable: false })`, `TableRow`, `TableHeader`, `TableCell`.
2. Replace the hardcoded button block (`CommentEditor.svelte` L84-145) with a data-driven array:

```ts
type ToolbarItem = {
	id: string;
	label: string;
	icon: typeof BoldIcon;
	isActive: () => boolean;
	run: () => void;
	desktopOnly?: boolean;
};

const items: ToolbarItem[] = $derived(editor ? [
	{ id: 'bold', label: 'Bold', icon: BoldIcon, isActive: () => editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
	{ id: 'italic', label: 'Italic', icon: ItalicIcon, isActive: () => editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
	{ id: 'underline', label: 'Underline', icon: UnderlineIcon, isActive: () => editor.isActive('underline'), run: () => editor.chain().focus().toggleUnderline().run() },
	{ id: 'bulletList', label: 'Bullet list', icon: ListIcon, isActive: () => editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
	{ id: 'orderedList', label: 'Numbered list', icon: ListOrderedIcon, isActive: () => editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
	{ id: 'link', label: 'Link', icon: LinkIcon, isActive: () => editor.isActive('link'), run: () => promptForLink() },
	{ id: 'image', label: 'Image', icon: ImageIcon, isActive: () => false, run: () => promptForImage() },
	{ id: 'insertTable', label: 'Insert table', icon: TableIcon, isActive: () => false, run: () => editor.chain().focus().insertTable({ rows: 2, cols: 2 }).run(), desktopOnly: true },
	{ id: 'addRow', label: 'Add row', icon: RowIcon, isActive: () => false, run: () => editor.chain().focus().addRowAfter().run(), desktopOnly: true },
	{ id: 'addColumn', label: 'Add column', icon: ColumnIcon, isActive: () => false, run: () => editor.chain().focus().addColumnAfter().run(), desktopOnly: true },
	{ id: 'deleteTable', label: 'Delete table', icon: TrashIcon, isActive: () => false, run: () => editor.chain().focus().deleteTable().run(), desktopOnly: true },
] : []);

const visibleItems = $derived(items.filter((i) => !i.desktopOnly || !isMobile));
```

Plus a heading select (Paragraph/H2/H3) as a `<select>` bound to `editor.isActive('heading', {level: n})`, and `promptForLink()`/`promptForImage()` as small `window.prompt`-based helpers for v1 (a proper popover can be a follow-up; a native prompt is enough to unblock the URL-insert requirement without new floating-UI dependencies).

3. Render: `{#each visibleItems as item}<button aria-label={item.label} class:active={item.isActive()} onclick={item.run}><item.icon size={16} /></button>{/each}` plus the heading `<select>` and the existing popout button logic carried over unchanged.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && pnpm exec vitest run tests/components/PerspectiveEditor.test.ts
```

- [ ] **Step 5: Type-check, full frontend test suite**

```bash
cd frontend && pnpm run check
cd frontend && pnpm run test:run
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/components/PerspectiveEditor.svelte frontend/tests/components/PerspectiveEditor.test.ts
git commit -m "feat(perspective): add PerspectiveEditor with headings, links, images, tables"
```

---

## Task 5: Frontend — local draft persistence

**Files:**
- Create: `frontend/src/lib/utils/perspectiveDraft.ts`
- Test: `frontend/tests/unit/perspectiveDraft.test.ts`

**Interfaces:**
- Produces: `saveDraft(key: string, html: string): void` (debounced by the caller, not internally — keep this module pure/testable), `loadDraft(key: string): string | null`, `clearDraft(key: string): void`, `draftKey(contentId: string | number, userId: string | number): string`.

- [ ] **Step 1: Write failing tests**

`frontend/tests/unit/perspectiveDraft.test.ts`: saving then loading returns the same HTML; loading a never-saved key returns `null`; clearing removes it; `draftKey` produces a stable, collision-free string for different `(contentId, userId)` pairs; wrap `localStorage` access in try/catch so a private-browsing/quota-exceeded environment doesn't throw (assert it degrades to a no-op, not an error).

- [ ] **Step 2: Run to verify failure**

```bash
cd frontend && pnpm exec vitest run tests/unit/perspectiveDraft.test.ts
```

- [ ] **Step 3: Implement**

```ts
const PREFIX = 'perspectize:draft:';

export function draftKey(contentId: string | number, userId: string | number): string {
	return `${PREFIX}${contentId}:${userId}`;
}

export function saveDraft(key: string, html: string): void {
	try {
		localStorage.setItem(key, JSON.stringify({ html, savedAt: Date.now() }));
	} catch {
		// localStorage unavailable (private browsing, quota) — draft persistence
		// is a nice-to-have, never block editing on it.
	}
}

export function loadDraft(key: string): string | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		return JSON.parse(raw).html ?? null;
	} catch {
		return null;
	}
}

export function clearDraft(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		// no-op
	}
}
```

- [ ] **Step 4: Run to verify pass, type-check**

```bash
cd frontend && pnpm exec vitest run tests/unit/perspectiveDraft.test.ts
cd frontend && pnpm run check
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/utils/perspectiveDraft.ts frontend/tests/unit/perspectiveDraft.test.ts
git commit -m "feat(perspective): add localStorage draft persistence helpers"
```

---

## Task 6: Frontend — wire `PerspectiveEditor` + drafts into `PerspectivePopover` and `CommentFullscreen`

**Files:**
- Modify: `frontend/src/lib/components/PerspectivePopover.svelte`
- Modify: `frontend/src/lib/components/CommentFullscreen.svelte`
- Modify: `frontend/tests/components/PerspectivePopover.test.ts`

**Interfaces:**
- Consumes: `PerspectiveEditor` (Task 4), `draftKey`/`saveDraft`/`loadDraft`/`clearDraft` (Task 5).

- [ ] **Step 1: Swap the editor component**

In both `PerspectivePopover.svelte` (~L375-387, inline desktop editor) and `CommentFullscreen.svelte` (~L43), replace `<CommentEditor ...>` with `<PerspectiveEditor ... isMobile={...}>`, passing the same `isMobile` boolean `PerspectivePopover.svelte` already derives for its Dialog/Drawer split.

- [ ] **Step 2: Remove stale TODO comments**

Delete the two "TODO: Backend integration — comment field not yet in GraphQL schema"-style comments at `PerspectivePopover.svelte` L90 and L99 — this wiring already exists end-to-end (confirmed via `review: getReview()` in both create/update mutation calls).

- [ ] **Step 3: Wire draft save on change**

In `PerspectivePopover.svelte`, debounce (~1s, using existing project conventions for debounce if any util exists, otherwise a small local `setTimeout`/`clearTimeout` pair) a call to `saveDraft(draftKey(contentId, userId), comment)` inside the editor's `onChange` handler.

- [ ] **Step 4: Wire draft restore on open**

In the `$effect` that resets form state on open (~L179-206), before falling back to `existingPerspective?.review ?? ''`, check `loadDraft(draftKey(contentId, userId))`. If a draft exists and differs from `existingPerspective?.review`, populate `comment` from the draft and set a `restoredFromDraft = $state(true)` flag; render a small dismissible banner ("Restored unsaved draft") above the editor when true.

- [ ] **Step 5: Clear draft on confirmed save**

In `handleSubmit`'s success paths for both `createMutation`/`updateMutation` (~L257-300), call `clearDraft(draftKey(contentId, userId))` in each mutation's `onSuccess`.

- [ ] **Step 6: Update/extend `PerspectivePopover.test.ts`**

Add cases: typing triggers a debounced `saveDraft` call (mock `perspectiveDraft` module); reopening with an existing draft shows the restore banner and populates the editor; successful save calls `clearDraft`.

- [ ] **Step 7: Run tests, type-check, full suite**

```bash
cd frontend && pnpm exec vitest run tests/components/PerspectivePopover.test.ts
cd frontend && pnpm run check
cd frontend && pnpm run test:run
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/components/PerspectivePopover.svelte frontend/src/lib/components/CommentFullscreen.svelte frontend/tests/components/PerspectivePopover.test.ts
git commit -m "feat(perspective): autosave drafts and switch to PerspectiveEditor"
```

---

## Deferred / Explicitly Out of Scope

- **Structured (ProseMirror JSON) storage** instead of raw HTML string — deferred per prior discussion; revisit once the extension set here has been live long enough to be stable, so the JSON schema isn't migrated twice.
- **Image upload** — URL-insert only, by explicit decision.
- **Unifying the two Editor instances** (inline `PerspectivePopover` vs. `CommentFullscreen`) into one — the `$effect`-based `setContent` sync between them stays as-is; both now use `PerspectiveEditor` but remain separate instances. Worth a follow-up plan if cursor-jump bugs are reported, but out of scope here.
- **Column-resize on desktop tables** — `resizable: false` everywhere per the mobile-gating discussion; not just a mobile restriction.

---

## Self-Review Notes

- **Discussion coverage:** headings (H2/H3 only, no H1) → Task 4. Tables (structural editing desktop-only, resize disabled everywhere) → Task 4 (`desktopOnly` items, `resizable: false`). Images (URL-insert only, no upload) → Task 4 (`promptForImage`). Autosave/draft persistence (top priority) → Tasks 5-6. Server-side sanitization → Task 1. Sanitizer allowlist extension for new tags → Task 2.
- **Placeholder scan:** `promptForLink`/`promptForImage` use `window.prompt` as an explicit, stated v1 simplification (not a TODO/stub) — flagged in Task 4 Step 3 as a deliberate choice, not deferred work left unshown.
- **Type consistency:** `PerspectiveEditor`'s prop surface is `CommentEditor`'s plus `isMobile`, so `PerspectivePopover.svelte`/`CommentFullscreen.svelte` call sites need only an added prop, not a rewrite. `draftKey`/`saveDraft`/`loadDraft`/`clearDraft` signatures used identically in Task 6 as defined in Task 5.
