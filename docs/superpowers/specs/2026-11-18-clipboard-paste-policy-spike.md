# Spike: can Perspectize always allow paste?

**Status:** spike, not a superpowers plan. Research only; no code changed. Tracks [#543](https://github.com/CodeWarrior-debug/perspectize/issues/543), "spike - find out if we can always allow pastes".

**Issue body, verbatim:** "so chrome/browser content download block prompt doesn't come up"

The body is terse. This spike reads it as the browser's clipboard-read permission prompt (Chrome's "allow this site to read text and images copied to the clipboard" bubble). "Content download block" does not map cleanly onto any paste path in the code, so the owner should confirm that reading.

---

## 1. Short answer

- **The app never blocks paste.** No `onpaste` handler, no `paste` listener, no `preventDefault` on paste, and no clipboard options on AG Grid exist in `frontend/src`. Native Cmd/Ctrl+V and the context-menu Paste already work in every text field, the rich-text editor and the number inputs.
- **The only browser prompt comes from one control:** the Paste button in `AddContentPopover.svelte`, which calls `navigator.clipboard.readText()`. Keyboard paste never calls that API, so it never prompts.
- **The app cannot pre-grant clipboard read to itself.** Nothing in `static/` or `app.html` sets a `Permissions-Policy` header, so the policy is not the cause. A policy could only disable the API (the call would then fail). It could not suppress the user prompt. Hosting-layer headers (Sevalla) were not checked.
- **Recommendation:** keep native paste as the paste path, and stop calling `readText()` from the Paste button. Section 5 has the options.

## 2. Paste inventory

"Allowed today" means the browser's native paste reaches the field. Each row cites the code it was read from.

| Surface | File | Paste allowed? | Why / why not |
|---|---|---|---|
| Add Content link input | `components/AddContentPopover.svelte` (`#content-input`) | Yes | Plain `<Input type="text">`, no paste handler, no `maxlength`. `oninput` calls `resetOverrides`. |
| Add Content Paste button | same file, `handlePaste` | **Prompts** | Calls `navigator.clipboard.readText()`. First use triggers the browser clipboard-read prompt. On denial or error it shows "Could not read clipboard — paste manually." |
| Perspective and todo rich text | `components/CommentsEditor.svelte` (Tiptap 3.34.0) | Yes | ProseMirror handles paste natively. The schema drops what is not registered: strike, code, horizontal rule, code block, and `data:` images (`allowBase64: false` in `@tiptap/extension-image`). Pasting a URL over a selection wraps it as a link (`linkOnPaste`, installed `@tiptap/extension-link` 3.34.0). `autolink` is off. Blockquote is kept; pasted H1-H6 are mapped to the two heading levels. |
| Pasted image files (screenshots) | same editor | No effect | The Image extension has no file-paste or drop handler. Nothing is inserted. Users may read this as "paste is blocked". |
| Discover YouTube search | `components/discover/SearchBar.svelte` | Yes | Plain `Input`, placeholder "Search YouTube, or paste a video link". No `maxlength`. |
| Discover movie and book search | `discover/MovieSearchPanel.svelte`, `discover/BookSearchPanel.svelte` | Yes, truncated | `maxlength` 100 (`MOVIE_SEARCH_MAX_LENGTH`, `BOOK_SEARCH_MAX_LENGTH`). Browsers cut a long paste at the limit with no message. |
| Import source rows | `components/imports/ImportSourceRows.svelte` | Yes, truncated | `maxlength={200}` on the reference field. A long pasted URL is cut silently. |
| Import request name | `components/imports/ImportRequestForm.svelte` | Yes, truncated | `maxlength={120}` on the "Name" field. |
| Import decline reason | `components/imports/ImportJobActions.svelte` | Yes, truncated | `maxlength={500}` on the reviewer's decline reason. |
| Activity details title | `components/ActivityDetailsModal.svelte` | Yes, truncated | `maxlength="120"`. |
| Plan list name | `components/plan/ListSwitcher.svelte` | Yes, truncated | `maxlength={100}`. |
| Rating inputs | `components/RatingInput.svelte` | Yes, numeric only | `type="number"`, `min 0`, `max 10`, `step any`. The browser refuses non-numeric characters. `handleInputChange` ignores NaN and out-of-range values, so they leave the stored value unchanged. Nothing is clamped or shown as an error. Whether the visible text reverts was not checked in a browser. |
| Todo "% complete" | `components/plan/TodoDialog.svelte` (`#todo-percent`) | Yes, but lossy | `type="number"`, `min 0`, `max 100`. The handler is `Number(e.currentTarget.value)`. An empty or non-numeric value gives `Number("") === 0`, so clearing the field or a bad paste silently sets 0 (read from source; not confirmed in a browser). |
| Plan and Activity grids (AG Grid) | `components/ActivityTable.svelte`, `components/plan/PlanBoard.svelte` | Not applicable | No `editable` column or `cellEditor` exists in `src`, and no `suppressClipboard`/`suppressCopy` option is set. Ctrl+V has no target cell, so it does nothing. Copy uses the Community defaults. |
| Copy from cell popover | `components/CellPopover.svelte` | Not applicable | Uses `navigator.clipboard.writeText` (write only). |
| Global keyboard shortcuts | `routes/discover/+page.svelte`, `lib/utils/versionHotkey.ts` | Not intercepted | The Discover handler calls `preventDefault` only for Cmd/Ctrl+K and Escape. `versionHotkey` skips editable targets. Neither matches Cmd/Ctrl+V. |

## 3. What would have to change to "always allow"

**Paste without a prompt.** Only native paste is prompt-free. The app cannot make `readText()` silent, and a button cannot trigger a native paste (`document.execCommand('paste')` is not available to web content in current browsers). So "always allow paste, no prompt" means removing programmatic reads. Keyboard and context-menu paste stay as they are.

**Paste into the rich-text editor.** Nothing needs to change for basic formatting. Changes would only be needed if the owner wants image-file paste (would need a new Tiptap file-paste extension and an upload path, which the backend does not have) or richer pasted formatting (strike or code would need the schema, DOMPurify and bluemonday changed together).

**Length.** Only the native `maxlength` fields truncate. The rest have no cap in the frontend or the backend. See section 4.

## 4. Risks

- **HTML from paste (comments editor).** Three filters apply in order: the ProseMirror schema on paste, DOMPurify in `sanitize.ts` on render, and bluemonday in `backend/internal/core/services/sanitize.go` on save. The tag lists in `sanitize.ts` and `newReviewPolicy` must stay in sync (`frontend/CLAUDE.md` says so). The backend allows `span` and `class` attributes, so pasted Word or Google Docs markup can pass through as spans. Not verified by pasting real content.
- **`data:` URIs.** `allowBase64: false` keeps `data:` images out of the editor. DOMPurify's `ALLOWED_URI_REGEXP` and bluemonday's http/https scheme list reject them again on render and on save.
- **Review length.** `perspectives.review` is `TEXT` (migration `000013`) with no length check in the Go services. Nothing caps a pasted review. The only character cap found is `MaxImportJobDescriptionChars = 20000` in `domain/import_job.go`, enforced by the service. An explicit HTTP body limit was not found in `backend/internal` or `backend/cmd` (grep for `MaxBytesReader` and body-limit terms). The hosting layer might impose one; that was not checked.
- **Silent truncation.** `maxlength` cuts a paste with no message. The import URL field (200) is the most likely to hit it, because real URLs can exceed 200 characters.
- **Numeric fields.** The todo percent field turns an empty or non-numeric value into 0. The rating input ignores out-of-range input, so it never reaches the server. Rating display is 0–10 in three decimals, stored as an integer 0–10000 (`frontend/src/lib/utils/ratings.ts` and `backend/internal/core/domain/perspective.go`).
- **Rating scale mismatch (noted, not a paste issue).** `CLAUDE.md` says rating-style fields use the `valid_integer_range` 0–10000 domain. The frontend rating control displays 0–10. Both are consistent with the conversion helpers, so this is documentation for the owner, not a defect found here.

## 5. Recommendation

1. **Keep native paste. Add no `onpaste` handlers.** Paste already works everywhere a text field exists, and a handler would only add risk.
2. **Change the Paste button in `AddContentPopover`** so it never calls `readText()`. Two options, owner's choice:
   - **(a)** Replace it with "focus the field and show a Cmd/Ctrl+V hint". No prompt, no API call. Keeps the affordance.
   - **(b)** Remove the button. The placeholder "Paste a link or type a reference" already says what to do.
   Either choice touches `tests/components/AddContentPopover.test.ts`, whose two clipboard tests assert the current behaviour. The change is stateful UI, so it needs tests for each state: idle, focused-with-hint, and the removed-button case.
3. **Fix the todo percent field separately:** treat an empty or NaN value as "no change", not 0. This is a stateful input, so it needs a test for the empty and non-numeric states.
4. **Owner decision:** whether to show a message when a paste is cut by `maxlength` on the import URL field, or raise its limit.
5. **Keep the current review length (no cap).** If the owner wants one, it should be a service-enforced limit like the import description, not a frontend-only one.

## 6. Not verified

- **Real browser and OS clipboard behaviour.** No browser was used. Chrome's permission prompt, Safari's paste callout and Firefox's paste-confirmation popup are described from general knowledge. They have not been checked against MDN or the browsers themselves, and the Permissions-Policy and clipboard behaviour on Sevalla's headers was not checked.
- **Clipboard formats.** Pasting images, RTF from Word, and HTML from Google Docs was not tried. Section 2's image result comes from reading the Tiptap source.
- **Rendered behaviour.** Whether the rating input reverts its visible text, and what the todo field shows after a bad paste, need a browser.
- **Tests were not run.** No code changed, so the build and test checks do not apply.
