# UI Gap Audit — 2026-09-24

Places where a feature reached one layer or surface of the UI and not the others.

**How this was produced**
1. A lead reviewer went through the PR history: the 85 commits in the local clone, back to #321, plus PR bodies read through GitHub and the visual-sweep report at `8e482b6`. It listed 21 suspected gaps.
2. Cheaper agents then checked each suspect against the source and proposed small diffs. Sonnet checked grid/sort, mobile/theme/surfaces and perspective data/cache. Haiku checked nav, dead code and docs.
3. I spot-checked the verdicts again before writing this up.

**Limits**
- No verifier could run `vitest` or a browser, because `node_modules` isn't installed in the cloud session. All evidence comes from reading the source and tracing call sites.
- Line numbers are as of `382708f`.

**Verdict key:** ✅ confirmed · 🟡 partial (a real risk, but the user-visible symptom isn't proven) · ❌ refuted

Ordered by how much a user would notice.

---

## Decisions and status (2026-09-24)

| Topic | Decision | Status |
|---|---|---|
| #1 Date Added / Updated | Every user can show them | **Fixed in this PR.** They moved from `INTERNAL_COLUMNS` to `DATA_COLUMNS` with the header labels. Category was added too. A new parity test (`tests/unit/column-registry-parity.test.ts`) fails if a column definition is ever missing from the picker lists. |
| #12 CLAIM content type | No creation UI **until the owner says so** | Deferred. Leave `useCreateClaim` unused. The renderer/modal fixes in #12 and #11 can still ship. |
| #14 Compare nav link | Stays in the top nav ("very close" to done) | The nav link stays. #417 added an empty state with a way back to Activity; a content picker there is still open. |
| #6 Grid theme | — | **Fixed by #417.** Grid colours now come from theme tokens (`lib/utils/grid-theme.ts`). |
| New: first-load filter | The activity table starts filtered to **YouTube only** | **Done in this PR.** `GRID_DEFAULTS.filters = { type: 'youtube' }`. With no `f.*` params the default applies; clearing all filters is stored as `f=none`, following the existing `sort=none` pattern. Loaded-mode filter changes now update the URL, so a cleared default isn't put back. |
| #5 Mobile filter chips | — | **Partly fixed in this PR.** In card view the chips come from the URL, and their X and "Clear all" now edit the URL. Needed because the new default filter would otherwise be stuck on mobile. Still open: adding a filter on mobile, and Loaded-mode card filtering. Today every row is YouTube, so the default filter has no effect there. |

---

## Summary

| # | UI gap | Verdict | Layer(s) missed |
|---|---|---|---|
| 1 | Column picker doesn't list **Category**, and Category disappears after the grid remounts | ✅ | Column-picker list, tests |
| 2 | Clearing a rating, review, feelings or custom field **never saves** | ✅ | GraphQL input, service, form, optimistic patch |
| 3 | Saving a perspective **writes into every cached perspective list**, including the public feed and other content's Compare | ✅ | Query keys, cache patching |
| 4 | Perspective lookups **stop at 10 rows**: wrong glasses/+ icon, and Compare picker missing users | ✅ | Query documents |
| 5 | **Filters don't work in mobile card view**: chips can't be removed, and Loaded mode ignores filters | ✅ | Mobile surface |
| 6 | **Grid ignores the theme picker**: stays light on Midnight/Terminal | ✅ | Theme tokens |
| 7 | **% Liked** sorts in the grid only; the sort picker, mobile and All mode drop it | ✅ | Sort lists, backend enum |
| 8 | Perspective **review and feelings only appear on Compare** | ✅ | Query documents, surfaces |
| 9 | **By-User view** differs from the main view: wrong "Added" time, no URL state, no search | ✅ | Surface, URL state |
| 10 | **Mobile cards** show 2 of 9 data columns and have no copy popover | ✅ | Mobile surface |
| 11 | **Details modal** has no Category, Date Added or content type | 🟡 | Surface |
| 12 | **CLAIM** content type is in the backend but not in the UI | ✅ | Renderer, creation UI |
| 13 | **Column labels differ** between header, picker, sort picker and modal | ✅ | Labels |
| 14 | **Compare** in the header leads to a dead end; **Messages** has no nav link | ✅ | Navigation |
| 15 | Onboarding can't be turned back on (its mutation is never used) | ✅ | Settings |
| 16 | Category hover popover and click typeahead don't close each other | 🟡 | Interaction |
| 17 | `f.item` URL filter overwrites the search box and its field scope | ✅ (only reachable by URL) | URL state |
| 18 | Old, contradicting column/sort lists in `grid-config.ts`, plus 7 unused imports | ✅ | Tech debt |
| 19 | Rating dimensions are defined in 3 places | 🟡 (no mismatch yet) | Shared definitions |
| 20 | Unused components: `CommentEditor`, `AGGridTest`, `UserSelector` | ✅ | Tech debt |
| 21 | `ADDING_AG_GRID_COLUMN.md` names none of the current column/sort/filter lists | ✅ | Docs |

**Refuted during the audit**
- Saved column settings in localStorage hiding new columns. Column visibility only lasts for the session; the only localStorage keys are theme, selected user and perspective drafts.
- #11's claim that the modal has no perspective summary. It does: the Perspectives and Avg. Rating tiles.

---

## 1. Column picker doesn't list Category, and Category disappears after a remount ✅

**Context**
- `ColumnPickerDialog.svelte:43,59` shows only the hand-written lists `DATA_COLUMNS` / `INTERNAL_COLUMNS` in `frontend/src/lib/utils/grid-config.ts:263-282`.
- `ActivityTable.svelte` defines 17 column ids. Take away those two lists and the always-shown `item`/`perspectize`, and `category` is exactly what's left.
  - It is defined at `ActivityTable.svelte:520-529` with `hide: true`.
  - The responsive tiers show it at sm and wider (`smCols = ['category','channel']`, `:977`).
- **Second symptom.** `currentVisibility()` (`:151-159`) filters through `togglableColIds()`, so `category` never gets into `userColumnOverride`.
  - Once the user changes anything in the picker, the effect at `:963-970` only re-applies ids that are in the override.
  - After a grid remount (going below 860px into card mode and back, or recovering from an error), Category falls back to `hide: true` and stays hidden until the page is refreshed.
- **Related.** `createdAt` / `updatedAt` are admin-only in the picker (`INTERNAL_COLUMNS`). But the sort picker offers them to everyone, and the default sort is `updatedAt desc`. So a regular user is sorted by a column they can't show.
- **Why tests didn't catch it.** `tests/unit/grid-config.test.ts:441-482` checks the shape of these lists but never compares them with the real `columnDefs`.

**Suggested fix**
```diff
--- a/frontend/src/lib/utils/grid-config.ts
+++ b/frontend/src/lib/utils/grid-config.ts
@@ export const DATA_COLUMNS: readonly TogglableColumn[] = [
 	{ colId: 'type', label: 'Type' },
+	{ colId: 'category', label: 'Category' },
 	{ colId: 'duration', label: 'Length' },
```
Also add a parity guard that reads the component source, so the test fails the next time a column is added:
```ts
// tests/unit/column-registry-parity.test.ts
import src from '$lib/components/ActivityTable.svelte?raw';
import { togglableColIds } from '$lib/utils/grid-config';

it('every togglable ActivityTable colId is in the column picker registry', () => {
	const ids = [...src.matchAll(/colId:\s*'([^']+)'/g)].map((m) => m[1]);
	const expected = [...new Set(ids)].filter((id) => !['item', 'perspectize'].includes(id));
	expect([...togglableColIds(true)].sort()).toEqual(expected.sort());
});
```
**Decision for you:** should Date Added and Updated move to `DATA_COLUMNS` so everyone can see them? If not, take them out of the non-admin sort picker.

---

## 2. Clearing a rating, review, feelings or custom field never saves ✅

**Context.** Every layer turns "cleared" into "unchanged":
- `PerspectivePopover.svelte:299-337` sends `quality: quality ?? undefined`, and so on for each rating. `buildCustomFields()` and `getReview()` (`:267-276`) return `undefined` when empty. `graphql-request` drops `undefined` keys from the request.
- `useUpdatePerspective.ts:41-53` updates the cache optimistically with `input.x ?? p.x`, so even a real `null` would show the old value.
- In `backend/schema.graphql:283-303`, the `UpdatePerspectiveInput` fields are plain nullable types. gqlgen turns both "missing" and `null` into a Go `nil`.
- `perspective_service.go:157-225` updates each field with `if input.X != nil { … }`.

**Result:** once a value is set, neither the UI nor the API can clear it. The editor looks cleared, and the old value comes back when it's reopened.

**Suggested fix.** Use gqlgen's `omittable` type (`@goField(omittable: true)`), or add explicit clear flags. Flag version:
```diff
--- a/backend/schema.graphql
 input UpdatePerspectiveInput {
   quality: Int
+  clearQuality: Boolean
   review: String
+  clearReview: Boolean
   customFields: JSON
+  clearCustomFields: Boolean
--- a/backend/internal/core/services/perspective_service.go
-	if input.Quality != nil {
+	if input.ClearQuality {
+		existing.Quality = nil
+	} else if input.Quality != nil {
--- a/frontend/src/lib/components/PerspectivePopover.svelte
+	clearQuality: isEditMode && quality === null && existingPerspective?.quality != null,
--- a/frontend/src/lib/queries/perspectives/useUpdatePerspective.ts
-	quality: input.quality ?? p.quality,
+	quality: input.clearQuality ? null : (input.quality ?? p.quality),
```
Repeat for agreement, importance, confidence, like, feelings, review and customFields. This touches the backend and schema, so it needs `go test ./...` and regenerating gqlgen.

---

## 3. Saving a perspective writes into every cached perspective list ✅

**Context**
- In `queries/keys.ts:44-52`, `listByUser`, `listByContent` and `activityFeed` all start with the same `perspectives.lists()` prefix.
- `useCreatePerspective.ts:69` and `useUpdatePerspective.ts:56` pass `{ queryKey: lists() }` to `setQueriesData`. TanStack matches by prefix, so every cached perspective list gets patched.

**Effects**
- The new row goes into **other content's** Compare cache.
- A **private** perspective goes into the public-only `activityFeed(false)` cache.
- The patched row is shaped like `ListPerspectivesByUser` and has no nested `content`. So `UserActivityView.svelte:142-153` shows "a perspective" with no title or thumbnail.
- `onSuccess` uses `refetchType: 'none'`, so the wrong entry stays on screen until something else causes a refetch.

**Suggested fix**
```diff
--- a/frontend/src/lib/queries/keys.ts
-	listByUser: (userId: number) => [...queryKeys.perspectives.lists(), { userId }] as const,
-	listByContent: (contentId: number) => [...queryKeys.perspectives.lists(), { contentId }] as const,
+	byUserLists: () => [...queryKeys.perspectives.lists(), 'byUser'] as const,
+	listByUser: (userId: number) => [...queryKeys.perspectives.byUserLists(), { userId }] as const,
+	byContentLists: () => [...queryKeys.perspectives.lists(), 'byContent'] as const,
+	listByContent: (contentId: number) => [...queryKeys.perspectives.byContentLists(), { contentId }] as const,
--- a/frontend/src/lib/queries/perspectives/useCreatePerspective.ts (same in useUpdatePerspective.ts)
-	const listFilter = { queryKey: queryKeys.perspectives.lists() };
+	const listFilter = { queryKey: queryKeys.perspectives.byUserLists() };
+	// in onSettled: refetch the differently-shaped lists instead of patching them
+	queryClient.invalidateQueries({ queryKey: queryKeys.perspectives.byContentLists() });
+	queryClient.invalidateQueries({ queryKey: [...queryKeys.perspectives.lists(), 'activityFeed'] });
```

---

## 4. Perspective lookups stop at 10 rows ✅

**Context**
- `queries/perspectives/index.ts:92-101` (`LIST_PERSPECTIVES_BY_USER`) and `:113-122` (`…_BY_CONTENT`) never pass `first`.
- The schema default is `perspectives(first: Int = 10)` (`schema.graphql:382-390`). The service allows up to 100 (`perspective_service.go:278`).

**Who uses these queries, all of them unpaginated**
- `ActivityTable.svelte:238-256` decides the glasses/+ icon. For a user with more than 10 perspectives, older rows show "+" and open a blank editor even though a perspective exists.
- `Compare.svelte:56-62` builds the user picker, so the picker only lists the latest 10 perspectives' users.
- `OnboardingShell.svelte:58-66` and `OnboardingCoach.svelte:71-79` get counts and "already rated" checks that stop at 10.

**Suggested fix**
```diff
--- a/frontend/src/lib/queries/perspectives/index.ts
-	query ListPerspectivesByUser($userID: IntID) {
-		perspectives(filter: { userID: $userID }) {
+	query ListPerspectivesByUser($userID: IntID, $first: Int = 100) {
+		perspectives(filter: { userID: $userID }, first: $first) {
```
Make the same change to `ListPerspectivesByContent`. Longer term, use a lightweight "which content ids has this user rated?" query instead of fetching full rows.

---

## 5. Filters don't work in mobile card view (<860px) ✅

**Context**
- When `cardMode` switches on, `gridApi = null` (`ActivityTable.svelte:934-937`).
- `<FilterChips {gridApi}>` (`:1015`) still renders, but `removeFilter` / `removeAllFilters` (`FilterChips.svelte:126-136`) return early when `gridApi` is null. **The chips show, but their X and "Clear all" do nothing.**
- Filters can only be added through AG Grid's own column menus (`onFilterChanged`, `:822-838`). **Card view has no way to add or edit a filter.**
- **All mode:** URL `f.*` filters still go to the server, so the cards are filtered but the filter can't be removed.
- **Loaded mode:** the cards are built from `sortedRowData` (`:359-365`), which sorts and never filters. **Column filters are silently ignored.**

**Suggested fix** (removal and Loaded-mode filtering only; a mobile "add filter" sheet is a separate feature)
```diff
--- a/frontend/src/lib/components/FilterChips.svelte
+	onRemove?: (colId: string) => void;
+	onClearAll?: () => void;
 	function removeFilter(colId: string) {
-		if (!gridApi) return;
+		if (!gridApi) return onRemove?.(colId);
 	function removeAllFilters() {
-		if (!gridApi) return;
+		if (!gridApi) return onClearAll?.();
--- a/frontend/src/lib/components/ActivityTable.svelte
-	<FilterChips {gridApi} filterModel={activeFilterModel} />
+	<FilterChips
+		{gridApi}
+		filterModel={activeFilterModel}
+		onRemove={(colId) => { const next = { ...gridParams.filters }; delete next[colId]; updateUrl({ filters: next, page: 1 }); }}
+		onClearAll={() => updateUrl({ filters: {}, page: 1 })}
+	/>
```
Also add an `applyUrlFilters(rows, filters)` helper next to `compareContentBySorts`, and use it in `sortedRowData` when `mode === 'loaded' && cardMode`.

---

## 6. The grid ignores the theme picker ✅

**Context**
- `ActivityTable.svelte:443-459` gives AG Grid's `themeQuartz.withParams` fixed hex colours (`#1a365d`, `#ffffff`, `#f7fafc`, `#d4d4d4`…). `formatting.ts:400` (glasses icon) and `:434` (Category "+") are fixed too.
- The Midnight and Terminal presets (`theme/presets.ts:62-88`) change `--color-*` variables. So the rest of the app goes dark while the grid stays white with a navy header.
- `formatting.ts:407` in the same file already uses `var(--color-muted-foreground)`, so the pattern is already in the codebase.

**Suggested fix.** Nothing needs to react to theme changes: the browser re-reads `var()` values when the theme updates the root.
```diff
--- a/frontend/src/lib/components/ActivityTable.svelte
-		headerBackgroundColor: '#1a365d',
-		headerTextColor: '#ffffff',
-		oddRowBackgroundColor: '#f7fafc',
-		rowHoverColor: 'rgba(26, 54, 93, 0.06)',
-		borderColor: '#d4d4d4',
-		accentColor: '#1a365d',
-		foregroundColor: '#171717',
-		backgroundColor: '#ffffff',
+		headerBackgroundColor: 'var(--color-primary)',
+		headerTextColor: 'var(--color-primary-foreground)',
+		oddRowBackgroundColor: 'var(--color-accent)',
+		rowHoverColor: 'color-mix(in srgb, var(--color-primary) 6%, transparent)',
+		borderColor: 'var(--color-border)',
+		accentColor: 'var(--color-primary)',
+		foregroundColor: 'var(--color-foreground)',
+		backgroundColor: 'var(--color-background)',
--- a/frontend/src/lib/utils/formatting.ts
-		container.style.color = '#1a365d';
+		container.style.color = 'var(--color-primary)';
-		plus.style.cssText = 'color:#a3a3a3;font-size:18px;';
+		plus.style.cssText = 'color:var(--color-muted-foreground);font-size:18px;';
```
Do the same for `selectedRowBackgroundColor`, `columnHoverColor` and `headerColumnResizeHandleColor`. Check it in a browser with every preset.

---

## 7. % Liked sorts in the grid only ✅

**Context**
- The `percentLiked` column (`ActivityTable.svelte:576-591`) can be sorted and has its own comparator.
- It is missing from:
  - `SORTABLE_COLUMNS` (`grid-config.ts:69-78`): the sort picker can't add it and shows the raw id `percentLiked`.
  - `SORT_VALUE_GETTERS` (`:81-90`): the mobile card sort skips it silently.
  - `COL_TO_SORT` (`gridUrlState.ts:93-103`): in All mode it isn't sent to the server, so only the current page is sorted in the browser.
- The backend `ContentSortBy` (`schema.graphql:169-178`) has no `PERCENT_LIKED`.

**Suggested fix.** This makes it work fully in Loaded mode and on mobile. For All mode, either add a backend sort or mark the column `sortable: mode === 'loaded'`.
```diff
--- a/frontend/src/lib/utils/grid-config.ts
@@ SORT_VALUE_GETTERS
 	likes: (row) => row.likeCount,
+	percentLiked: (row) => (row.viewCount ? row.likeCount / row.viewCount : null),
@@ SORTABLE_COLUMNS
 	{ colId: 'likes', label: 'Likes' },
+	{ colId: 'percentLiked', label: '% Liked' }, // client-side only until ContentSortBy gains PERCENT_LIKED
```
The backend option adds `PERCENT_LIKED` to `ContentSortBy`, a rule in `helpers.go` (`like_count::float / NULLIF(view_count,0)`), and `percentLiked: 'PERCENT_LIKED'` in `COL_TO_SORT`.

---

## 8. Perspective review and feelings only appear on Compare ✅

**Context**
- `LIST_ACTIVITY_PERSPECTIVES` (`queries/perspectives/index.ts:157-179`) doesn't ask for `review` or `feelings` at all.
- `ActivityDetailsModal`, `ActivityCardList` and `UserActivityView` never mention review, feelings or `SafeHtml`.
- Only `CompareTakeColumn.svelte:38-41` renders them.
- So the rich formatting from #405 and the feel-wheel from #364 are invisible in the By-User feed. Perspective events there also can't open the perspective or Compare.

**Suggested fix**
```diff
--- a/frontend/src/lib/queries/perspectives/index.ts  (LIST_ACTIVITY_PERSPECTIVES)
 			description
+			review
+			feelings { emoji label intensity note }
 			content { … }
--- a/frontend/src/lib/components/UserActivityView.svelte (perspective event row)
+	{#if event.review}<SafeHtml html={event.review} class="line-clamp-3 text-sm" />{/if}
+	{#if event.feelings?.length}<span>{event.feelings.map((f) => f.emoji).join(' ')}</span>{/if}
```
Also add a "View perspectives / Compare" link on perspective events.

---

## 9. The By-User view differs from the main view ✅

**Context**
- `UserActivityView.svelte:128-140` labels the time `c.updatedAt` as **"Added"**, and the query sorts by `UPDATED_AT`. `Content` has `createdAt` (`schema.graphql:119-152`). Any update, such as refreshing view counts, moves old content to the top as "just added".
- `:192-200` only opens details when the item is among the 100 most recently updated. The code's own comment admits this.
- `routes/+page.svelte:19-21`: `view` isn't saved in the URL ("Session-only"), although every other grid setting is. The search box and scope popover are hidden in By User (`{#if view === 'content'}`).
- The glasses/+ icons mean "this event was a perspective / content add" here. Everywhere else they mean "you have / haven't rated this".

**Suggested fix**
```diff
--- a/frontend/src/lib/components/UserActivityView.svelte
-				ts: c.updatedAt,
+				ts: c.createdAt,
   (and fetch with sortBy: 'CREATED_AT')
--- a/frontend/src/routes/+page.svelte
-	let view = $state<'content' | 'byUser'>('content');
+	let view = $derived<'content' | 'byUser'>(page.url.searchParams.get('view') === 'byUser' ? 'byUser' : 'content');
+	// setView writes ?view= via goto(..., { replaceState: true, keepFocus: true })
```
Give event-kind icons in the feed their own look (for example a quote icon for perspective events).

---

## 10. Mobile cards show 2 of 9 data columns ✅

**Context**
- `ActivityCardList.svelte:7-14`: `CardRow` has only name, url, channel and length.
- `DATA_COLUMNS` has 9 entries. Cards show none of category, views, likes, % liked, publish date or tags. There's no way to set Category on mobile, and no tap version of the #390 copy popover.
- `:82` shows "—" when length is missing, but `UserActivityView.svelte:288-291` hides it.

**Suggested fix** (small consistency fix now; full parity is a feature)
```diff
--- a/frontend/src/lib/components/ActivityCardList.svelte
-					<span>{formatDuration(row.length, row.lengthUnits)}</span>
+					{#if row.length}
+						<span>{formatDuration(row.length, row.lengthUnits)}</span>
+					{/if}
```
For the follow-up, decide which columns belong on a card. The column-metadata list in the checklist has a `cardVisible` flag for this, so a new column has to choose explicitly.

---

## 11. Details modal is missing fields 🟡

**Context**
- The `ModalContent` props (`ActivityDetailsModal.svelte:20-30`) have no category, `createdAt` or `contentType`.
- The header hard-codes `YouTube Video` (`:96`).
- Labels differ from the grid: "Duration" / "Published" here, "Length" / "Date" in the grid header (`:162,168`).
- The perspective summary *is* there (Perspectives and Avg. Rating tiles, `:132-146`); that part of the suspicion was refuted.

**Suggested fix**
```diff
--- a/frontend/src/lib/components/ActivityDetailsModal.svelte
 	interface ModalContent {
+		contentType?: 'YOUTUBE' | 'CLAIM';
+		primaryCategory?: { label: string } | null;
+		createdAt?: string;
@@
-					YouTube Video
+					{content.contentType === 'CLAIM' ? 'Claim' : 'YouTube Video'}
@@ stat tiles
+	<Tile label="Category">{content.primaryCategory?.label ?? '—'}</Tile>
+	<Tile label="Date Added">{content.createdAt ? formatDate(content.createdAt) : '—'}</Tile>
```
The parent that builds `ModalContent` also has to pass the new fields through.

---

## 12. The CLAIM content type isn't in the UI ✅

**Context**
- The backend has `enum ContentType { YOUTUBE CLAIM }` (`schema.graphql:191-194`) and `createClaim`.
- `typeCellRenderer` (`formatting.ts:316-345`) always draws the red YouTube icon.
- `useCreateClaim.ts` is only used by its own unit test; no screen can create a claim.
- The details modal hard-codes "YouTube Video" (see #11).
- This doesn't meet the checklist in `.claude/docs/ADDING_CONTENT_TYPE.md`.

**Suggested fix** (renderer only; a creation UI is a feature)
```diff
--- a/frontend/src/lib/utils/formatting.ts  (typeCellRenderer)
-	svg.setAttribute('fill', '#FF0000');
+	const isClaim = params.data.contentType === 'CLAIM';
+	svg.setAttribute('fill', isClaim ? 'var(--color-muted-foreground)' : '#FF0000');
@@
-	path.setAttribute('d', YOUTUBE_PLAY_PATH);
+	path.setAttribute('d', isClaim ? CLAIM_GLYPH_PATH : YOUTUBE_PLAY_PATH);
```
**Decision for you:** give claims a creation screen now, or hide `useCreateClaim` until they get one.

---

## 13. Column labels differ between screens ✅

| Column | Grid header | Column picker | Sort picker | Filter chip | Details modal |
|---|---|---|---|---|---|
| publishDate | Date (`ActivityTable:595`) | Published (`grid-config:269`) | Published (`:74`) | Date (`FilterChips:21`) | Published (`:168`) |
| duration | Length (`:532`) | Length | Length | Length | **Duration** (`:162`) |
| createdAt | Date Added (`:663`) | **Created at** (`:280`) | Date added (`:76`) | Date Added | — |
| updatedAt | Updated (`:646`) | **Updated at** (`:281`) | Updated | Updated | — |

**Suggested fix.** Make the grid header the canonical label, and eventually read every label from one list (see the column metadata in the checklist).
```diff
--- a/frontend/src/lib/utils/grid-config.ts
-	{ colId: 'publishDate', label: 'Published' },   // DATA_COLUMNS + SORTABLE_COLUMNS
+	{ colId: 'publishDate', label: 'Date' },
-	{ colId: 'createdAt', label: 'Created at' },     // INTERNAL_COLUMNS
+	{ colId: 'createdAt', label: 'Date Added' },
-	{ colId: 'updatedAt', label: 'Updated at' },
+	{ colId: 'updatedAt', label: 'Updated' },
-	{ colId: 'createdAt', label: 'Date added' },     // SORTABLE_COLUMNS
+	{ colId: 'createdAt', label: 'Date Added' },
```
`grid-config.test.ts` checks these exact strings, so update the test too.

---

## 14. Compare in the header leads to a dead end; Messages has no nav link ✅

**Context**
- `Header.svelte:15` links to `/compare`.
- Without a `contentId`, `routes/compare/+page.svelte:10-15` shows "No content selected" and gives no way to pick content.
- The Messages route (#346) can only be reached through the floating widget.

**Suggested fix.** Either drop Compare from the top nav, since you get there from the details modal, or give the empty state a content search:
```diff
--- a/frontend/src/routes/compare/+page.svelte
 {:else}
-	<p>No content selected</p>
+	<p class="text-muted-foreground">Pick something to compare perspectives on.</p>
+	<ContentSearchTypeahead onSelect={(id) => goto(`/compare?contentId=${id}`)} />
 {/if}
```

---

## 15. Onboarding can't be turned back on ✅

**Context**
- `SettingsDialog.svelte:8-12` has only a Theme section.
- `SET_ONBOARDING_DISPLAY_NEXT_SESSION` (`queries/users/index.ts:92`) is **imported nowhere**, not even by `onboarding/*`. Once a user dismisses onboarding, there's no way back.

**Suggested fix.** Add a "Show onboarding next session" switch in a new "General" section of `SettingsDialog`, backed by a `useSetOnboardingDisplay` mutation hook. Or delete the unused mutation if this was never meant to be a user setting.

---

## 16. Category hover popover and click typeahead don't close each other 🟡

**Context**
- **Hover:** Category has a hover spec (`activityTooltipSpecs.ts:11-14`), so it opens `CellPopover` after 600ms.
- **Click:** `onCellClicked` (`ActivityTable.svelte:762-781`) opens `CategoryTypeahead`.
- The category branch never calls `hover.close()`; the scroll handler at `:334` does.
- bits-ui's outside-click dismissal probably hides the problem, but no one has watched this in a browser. The 2025 visual-sweep item P4 (typeahead with no anchor) also hasn't been re-checked.

**Suggested fix**
```diff
--- a/frontend/src/lib/components/ActivityTable.svelte  (onCellClicked)
 			} else if (event.colDef.colId === 'category') {
+				hover.close(); // don't leave the copy-popover open under the typeahead
```

---

## 17. The `f.item` URL filter overwrites the search box and its field scope ✅ (only reachable by URL)

**Context**
- `urlParamsToGraphQLFilter` (`gridUrlState.ts:463-489`) sets `search` and `searchFields` from `q` / `qFields`. Then `case 'item': result.search = value` overwrites the search and drops the field scope, so the backend falls back to TITLE only.
- The `item` column has no filter menu, so this only happens through a hand-made `?f.item=` URL.
- `FilterChips` `COLUMN_LABELS` has no `item` entry, so such a chip would read "item".

**Suggested fix.** Remove the path, because the page search box is the only way to search by item:
```diff
--- a/frontend/src/lib/utils/gridUrlState.ts
-	item: 'item',                    // COL_TO_FILTER_KEY
@@
-			case 'item':
-				result.search = value;
-				hasAny = true;
-				break;
```

---

## 18. Old, contradicting column/sort lists in `grid-config.ts` ✅

**Context**
- In `ActivityTable.svelte:53-63`, 7 of the 9 imports from `grid-config` are never called: `SORT_FIELD_MAP`, `resolveSortField`, `resolveSortOrder`, `capitalizeContentType`, `durationComparator`, `computeNextPage`, `computePrevPage`.
- `getColumnVisibility`, `COLUMN_IDS`, `COLUMN_FILTERS` and `NON_SORTABLE_COLUMNS` are only used by tests. They already disagree with the live code:
  - `getColumnVisibility` has no category.
  - `SORT_FIELD_MAP` sends duration and channel to NAME, but `COL_TO_SORT` uses LENGTH and CHANNEL_TITLE.
  - `COLUMN_FILTERS.item = false`.
- Passing tests on dead code give false confidence, and the column guide (#21) points contributors to `SORT_FIELD_MAP`.

**Suggested fix**
```diff
--- a/frontend/src/lib/components/ActivityTable.svelte
 	import {
-		SORT_FIELD_MAP, resolveSortField, resolveSortOrder,
-		capitalizeContentType, durationComparator,
-		computeNextPage, computePrevPage,
 		compareContentBySorts, togglableColIds,
 	} from '$lib/utils/grid-config';
```
Then delete the dead exports and their tests from `grid-config.ts`. `capitalizeContentType` and `durationComparator` are also used by `tests/browser/fixtures/AGGridTestHarness.svelte`, so either keep them or use them in place of the matching inline code in the column definitions.

---

## 19. Rating dimensions are defined in 3 places 🟡 (no mismatch yet)

**Context**
- `comparePerspectives.ts:56-61` `STANDARD_DIMENSIONS` sets the labels Compare uses.
- `PerspectivePopover.svelte:100` `DEFAULT_FIELDS` repeats the keys.
- `AddFieldSearch.svelte:23-42` `AVAILABLE_FIELDS` repeats both keys and labels.
- They all agree today, but renaming one dimension won't update the others.

**Suggested fix**
```diff
--- a/frontend/src/lib/components/AddFieldSearch.svelte
+	import { STANDARD_DIMENSIONS } from '$lib/utils/comparePerspectives';
 	const AVAILABLE_FIELDS: FieldDef[] = [
-		{ key: 'quality', label: 'Quality', kind: 'rating', existing: true, desc: '…' },
-		… (×4)
+		...STANDARD_DIMENSIONS.map((d) => ({ ...d, kind: 'rating' as const, existing: true, desc: FIELD_DESC[d.key] })),
--- a/frontend/src/lib/components/PerspectivePopover.svelte
-	const DEFAULT_FIELDS = ['quality', 'agreement', 'importance', 'confidence'];
+	const DEFAULT_FIELDS = STANDARD_DIMENSIONS.map((d) => d.key);
```

---

## 20. Unused components ✅

**Context.** These are not imported anywhere under `frontend/src`:
- `CommentEditor.svelte`: replaced by `PerspectiveEditor` in #405, but has a different sanitizer allowlist, so it's risky if reused by mistake.
- `AGGridTest.svelte`
- `UserSelector.svelte`

**Suggested fix:** delete them with `git rm`, after checking `frontend/tests/**` for imports.

---

## 21. `ADDING_AG_GRID_COLUMN.md` names none of the current lists ✅

**Context**
- Grepping the guide finds 0 mentions of: `DATA_COLUMNS`, `INTERNAL_COLUMNS`, `SORTABLE_COLUMNS`, `SORT_VALUE_GETTERS`, `COL_TO_SORT`, `COL_TO_FILTER_KEY`, `urlParamsToGraphQLFilter`, `COLUMN_LABELS`, `ActivityCardList`, `ActivityDetailsModal`.
- The one list it does name, `SORT_FIELD_MAP`, is dead code (#18).
- It cites `queries/content.ts`, which is now `queries/content/index.ts`.
- It describes a two-branch responsive effect. The real one has 4 tiers plus the user override.
- This is the root cause of #1, #7 and #13: a contributor who follows the guide misses 8 of the lists a column must be added to.

**Suggested fix.** Rewrite the guide's checklist to follow the Grid section of [UI_THOROUGHNESS_CHECKLIST.md](UI_THOROUGHNESS_CHECKLIST.md). Better still, do the column-metadata refactor described there, so the guide shrinks to one step.
