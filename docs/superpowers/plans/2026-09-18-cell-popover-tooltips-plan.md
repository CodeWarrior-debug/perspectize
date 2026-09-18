# Cell Popover Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ActivityTable's mismatched cell tooltips with one shared, interactive bits-ui popover that has per-column copy behavior (default on every column, overridable, opt-out-able, multi-select for Tags).

**Architecture:** Pure logic (`tooltipSpec.ts`) resolves a column's spec and computes display/copy text. One `CellPopover.svelte` (bits-ui Popover) is mounted once beside the grid and anchored to the hovered cell. ActivityTable wires AG Grid cell mouse events to it; columns declare an optional `context.tooltipSpec`. No new npm packages.

**Tech Stack:** SvelteKit / Svelte 5, bits-ui `^2.19.0` (Popover), ag-grid-svelte5, svelte-sonner, vitest + @testing-library/svelte.

**Spec:** `docs/superpowers/specs/2026-09-18-cell-popover-tooltips-design.md`

## Global Constraints

- Activity table only (spec §5). Do not touch `hover-tooltip` or `PerspectivePopover`.
- No new dependencies; use `bits-ui` Popover directly (not the padded shadcn `PopoverContent`).
- Popover look = `.tip-surface`: `rgba(45,45,45,.9)`, 6px radius, `0 1px 4px rgba(0,0,0,.2)` shadow, 13px text, 10px padding.
- Tags: nothing copied by default; offers "Copy selected" and "Copy all".
- Likes/Views copy the raw number without commas.
- Header hover keeps static `headerTooltip` (no copy).
- **No chained bash commands (`&&`)** — one command per Bash call (repo rule).
- **No `make migrate-*`** — irrelevant here, no backend changes.

## Conflict avoidance (other agents / worktrees)

Checked 2026-09-18: `frontend/src/lib/components/ActivityTable.svelte` is modified on `origin/claude/multi-column-sort-clear-lr1syg` (134+/17−) and `origin/claude/pr-366-3m8ing` (70+/16−); `app.css` and the tooltip files are untouched elsewhere. Local worktrees (`feature-username-clerk-improvements-1`, `.claude/worktrees/{1,agent-a3f9…,postgres-auth-test-coverage}`) do not touch these files.

Mitigations built into this plan:
- Work in a **new dedicated worktree** `.claude/worktrees/tooltip-popover` on branch `feature/cell-popover-tooltips`, branched from updated `origin/main` (never the shared repo root, never another agent's worktree).
- Put nearly all logic in **new files**; ActivityTable edits are small and localized (Task 4). Expect a trivial rebase conflict with the sort branch / PR 366 in `columnDefs` — resolve by keeping both sides.
- Merge order: land the sort branch and PR 366 first if possible, then rebase this branch.

---

### Task 0: Isolated worktree

**Files:** none (git only)

- [ ] **Step 1: Update main**

Run: `git fetch origin`

- [ ] **Step 2: Create worktree from origin/main**

Run: `git worktree add .claude/worktrees/tooltip-popover -b feature/cell-popover-tooltips origin/main`
Expected: new worktree; `git worktree list` shows it. All later commands run with that directory as cwd (`git -C .claude/worktrees/tooltip-popover ...`, `pnpm --dir .claude/worktrees/tooltip-popover/frontend ...`).

- [ ] **Step 3: Bring the spec and this plan onto the branch**

Run: `git cherry-pick 697e035` (spec commit; from inside the worktree)
Then copy `docs/superpowers/plans/2026-09-18-cell-popover-tooltips-plan.md` into the worktree and commit: `docs: add cell popover tooltips plan`.

- [ ] **Step 4: Install deps**

Run: `pnpm install --dir .claude/worktrees/tooltip-popover/frontend`

---

### Task 1: Confirm the font mismatch (diagnosis)

**Files:** none (browser only; local session only per CLAUDE.md — skip in cloud/CI and note it)

- [ ] **Step 1:** Using the authenticated Chrome profile (`.claude/scripts/sv-chrome.sh`, `.docs/VERIFICATION.md` §0/§3), hover each ActivityTable column body cell and record which columns render a tooltip whose computed `font-size`/`padding` differ from the rest (use `evaluate_script` on `.ag-tooltip`, and its child `.tags-tooltip`/`.description-tooltip`).
- [ ] **Step 2:** Record the affected column names in the spec's "Open items" (edit the spec, commit `docs: record tooltip mismatch columns`). If the cause differs from the suspected nested-`.ag-tooltip` split, note it; Task 5 removes the split regardless.

---

### Task 2: Spec logic (pure, TDD)

**Files:**
- Create: `frontend/src/lib/utils/tooltipSpec.ts`
- Test: `frontend/tests/unit/tooltipSpec.test.ts`

**Interfaces:**
- Produces:
```ts
export interface CellCtx { value: unknown; valueFormatted?: string | null; data?: any }
export interface TooltipSpec {
  mode?: 'single' | 'multi';
  text?: (c: CellCtx) => string;
  copyValue?: (c: CellCtx) => string | number | null | undefined;
  items?: (c: CellCtx) => string[];
}
export type ColTooltipSpec = TooltipSpec | false;
export function resolveSpec(colSpec: ColTooltipSpec | undefined): TooltipSpec | null; // null = opted out
export function displayText(spec: TooltipSpec, c: CellCtx): string;
export function copyText(spec: TooltipSpec, c: CellCtx): string | null; // null = nothing to copy
export function itemsCopyText(items: string[], selected: ReadonlySet<string> | null): string; // null = all
```

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { resolveSpec, displayText, copyText, itemsCopyText } from '$lib/utils/tooltipSpec';

describe('resolveSpec', () => {
	it('gives every column the default single-mode spec', () => {
		expect(resolveSpec(undefined)?.mode).toBe('single');
	});
	it('returns null when a column opts out', () => {
		expect(resolveSpec(false)).toBeNull();
	});
	it('shallow-merges an override over the default', () => {
		const copyValue = () => 5;
		const spec = resolveSpec({ copyValue });
		expect(spec?.mode).toBe('single');
		expect(spec?.copyValue).toBe(copyValue);
		expect(spec?.text).toBeDefined();
	});
});

describe('displayText / copyText defaults', () => {
	it('shows the formatted value and copies the raw value', () => {
		const spec = resolveSpec(undefined)!;
		const ctx = { value: 1234, valueFormatted: '1.2K' };
		expect(displayText(spec, ctx)).toBe('1.2K');
		expect(copyText(spec, ctx)).toBe('1234');
	});
	it('falls back to raw value for display and returns null copy for empty', () => {
		const spec = resolveSpec(undefined)!;
		expect(displayText(spec, { value: 'abc' })).toBe('abc');
		expect(copyText(spec, { value: null })).toBeNull();
		expect(copyText(spec, { value: '' })).toBeNull();
	});
});

describe('copyValue override', () => {
	it('copies the override without commas', () => {
		const spec = resolveSpec({ copyValue: (c) => c.data.likeCount })!;
		expect(copyText(spec, { value: 1234, data: { likeCount: 1234 } })).toBe('1234');
	});
});

describe('itemsCopyText', () => {
	const items = ['a', 'b', 'c'];
	it('null selection copies all', () => expect(itemsCopyText(items, null)).toBe('a, b, c'));
	it('copies only selected, in original order', () =>
		expect(itemsCopyText(items, new Set(['c', 'a']))).toBe('a, c'));
	it('empty selection yields empty string', () =>
		expect(itemsCopyText(items, new Set())).toBe(''));
});
```

- [ ] **Step 2:** Run `pnpm --dir frontend exec vitest run --project unit tests/unit/tooltipSpec.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
export interface CellCtx { value: unknown; valueFormatted?: string | null; data?: any }
export interface TooltipSpec {
	mode?: 'single' | 'multi';
	text?: (c: CellCtx) => string;
	copyValue?: (c: CellCtx) => string | number | null | undefined;
	items?: (c: CellCtx) => string[];
}
export type ColTooltipSpec = TooltipSpec | false;

const DEFAULT_SPEC: TooltipSpec = {
	mode: 'single',
	text: (c) => String(c.valueFormatted ?? c.value ?? ''),
	copyValue: (c) => (c.value as string | number | null | undefined),
};

export function resolveSpec(colSpec: ColTooltipSpec | undefined): TooltipSpec | null {
	if (colSpec === false) return null;
	return { ...DEFAULT_SPEC, ...(colSpec ?? {}) };
}

export function displayText(spec: TooltipSpec, c: CellCtx): string {
	return (spec.text ?? DEFAULT_SPEC.text!)(c);
}

export function copyText(spec: TooltipSpec, c: CellCtx): string | null {
	const v = (spec.copyValue ?? DEFAULT_SPEC.copyValue!)(c);
	if (v === null || v === undefined || v === '') return null;
	return String(v);
}

export function itemsCopyText(items: string[], selected: ReadonlySet<string> | null): string {
	const picked = selected === null ? items : items.filter((i) => selected.has(i));
	return picked.join(', ');
}
```

- [ ] **Step 4:** Re-run the test — Expected: PASS.
- [ ] **Step 5:** Commit `feat(frontend): add tooltip spec resolution and copy logic`.

---

### Task 3: `CellPopover.svelte` (shared look + copy UI)

**Files:**
- Create: `frontend/src/lib/components/CellPopover.svelte`
- Modify: `frontend/src/app.css` (add `.tip-surface`, `.tip-copy-btn`, `.tip-chip`)
- Test: `frontend/tests/components/CellPopover.test.ts`

**Interfaces:**
- Consumes: `TooltipSpec`-derived data (passed pre-resolved, see below).
- Produces:
```ts
export interface PopoverState {
	anchor: HTMLElement;
	mode: 'single' | 'multi';
	text: string;            // single mode display text
	copy: string | null;     // single mode copy payload (null = hide copy button)
	items: string[];         // multi mode labels
}
// props: { state: PopoverState | null; onEnter: () => void; onLeave: () => void; onClose: () => void }
// Test ids: data-testid="tip-text", "tip-copy", "tip-item-<label>", "tip-copy-selected", "tip-copy-all"
```

- [ ] **Step 1: Write failing tests** (states from spec §4)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CellPopover from '$lib/components/CellPopover.svelte';

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('svelte-sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
	mocks.success.mockClear();
	mocks.error.mockClear();
	writeText = vi.fn().mockResolvedValue(undefined);
	Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

const anchor = () => document.body.appendChild(document.createElement('div'));
const base = { onEnter: vi.fn(), onLeave: vi.fn(), onClose: vi.fn() };

describe('CellPopover', () => {
	it('renders nothing when state is null (closed)', () => {
		render(CellPopover, { ...base, state: null });
		expect(screen.queryByTestId('tip-text')).toBeNull();
	});

	it('single mode shows display text and copies the raw payload, not the display', async () => {
		render(CellPopover, { ...base, state: { anchor: anchor(), mode: 'single', text: '1,234', copy: '1234', items: [] } });
		expect(screen.getByTestId('tip-text').textContent).toBe('1,234');
		await fireEvent.click(screen.getByTestId('tip-copy'));
		expect(writeText).toHaveBeenCalledWith('1234');
		expect(mocks.success).toHaveBeenCalled();
	});

	it('hides the copy button when there is nothing to copy', () => {
		render(CellPopover, { ...base, state: { anchor: anchor(), mode: 'single', text: '--', copy: null, items: [] } });
		expect(screen.queryByTestId('tip-copy')).toBeNull();
	});

	it('multi mode: nothing selected by default, Copy selected disabled', () => {
		render(CellPopover, { ...base, state: { anchor: anchor(), mode: 'multi', text: '', copy: null, items: ['a', 'b'] } });
		expect((screen.getByTestId('tip-copy-selected') as HTMLButtonElement).disabled).toBe(true);
	});

	it('multi mode: copies only selected labels', async () => {
		render(CellPopover, { ...base, state: { anchor: anchor(), mode: 'multi', text: '', copy: null, items: ['a', 'b', 'c'] } });
		await fireEvent.click(screen.getByTestId('tip-item-a'));
		await fireEvent.click(screen.getByTestId('tip-item-c'));
		await fireEvent.click(screen.getByTestId('tip-copy-selected'));
		expect(writeText).toHaveBeenCalledWith('a, c');
	});

	it('multi mode: Copy all copies every label', async () => {
		render(CellPopover, { ...base, state: { anchor: anchor(), mode: 'multi', text: '', copy: null, items: ['a', 'b'] } });
		await fireEvent.click(screen.getByTestId('tip-copy-all'));
		expect(writeText).toHaveBeenCalledWith('a, b');
	});

	it('Esc calls onClose', async () => {
		const onClose = vi.fn();
		render(CellPopover, { ...base, onClose, state: { anchor: anchor(), mode: 'single', text: 'x', copy: 'x', items: [] } });
		await fireEvent.keyDown(document.body, { key: 'Escape' });
		expect(onClose).toHaveBeenCalled();
	});

	it('toasts an error when the clipboard write fails', async () => {
		writeText.mockRejectedValueOnce(new Error('denied'));
		render(CellPopover, { ...base, state: { anchor: anchor(), mode: 'single', text: 'x', copy: 'x', items: [] } });
		await fireEvent.click(screen.getByTestId('tip-copy'));
		await Promise.resolve();
		expect(mocks.error).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2:** Run `pnpm --dir frontend exec vitest run --project unit tests/components/CellPopover.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement component**

```svelte
<script lang="ts" module>
	export interface PopoverState {
		anchor: HTMLElement;
		mode: 'single' | 'multi';
		text: string;
		copy: string | null;
		items: string[];
	}
</script>

<script lang="ts">
	import { Popover } from 'bits-ui';
	import { toast } from 'svelte-sonner';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { itemsCopyText } from '$lib/utils/tooltipSpec';

	let {
		state,
		onEnter,
		onLeave,
		onClose,
	}: { state: PopoverState | null; onEnter: () => void; onLeave: () => void; onClose: () => void } = $props();

	let selected = $state(new Set<string>());
	// Reset selection whenever a different cell opens the popover.
	$effect(() => {
		state;
		selected = new Set();
	});

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Copied');
		} catch {
			toast.error('Could not copy');
		}
	}

	function toggle(item: string) {
		const next = new Set(selected);
		if (next.has(item)) next.delete(item);
		else next.add(item);
		selected = next;
	}
</script>

<Popover.Root open={state !== null} onOpenChange={(o) => !o && onClose()}>
	{#if state}
		<Popover.Portal>
			<Popover.Content
				customAnchor={state.anchor}
				side="bottom"
				align="start"
				sideOffset={6}
				trapFocus={false}
				onOpenAutoFocus={(e) => e.preventDefault()}
				class="tip-surface"
				onpointerenter={onEnter}
				onpointerleave={onLeave}
			>
				{#if state.mode === 'single'}
					<span data-testid="tip-text">{state.text}</span>
					{#if state.copy !== null}
						<button
							type="button"
							class="tip-copy-btn"
							data-testid="tip-copy"
							aria-label="Copy value"
							onclick={() => copy(state.copy!)}><CopyIcon size={14} /></button
						>
					{/if}
				{:else}
					<div class="tip-chips">
						{#each state.items as item (item)}
							<button
								type="button"
								class="tip-chip"
								data-selected={selected.has(item)}
								aria-pressed={selected.has(item)}
								data-testid={`tip-item-${item}`}
								onclick={() => toggle(item)}>{item}</button
							>
						{/each}
					</div>
					<div class="tip-actions">
						<button
							type="button"
							data-testid="tip-copy-selected"
							disabled={selected.size === 0}
							onclick={() => copy(itemsCopyText(state.items, selected))}>Copy selected</button
						>
						<button
							type="button"
							data-testid="tip-copy-all"
							onclick={() => copy(itemsCopyText(state.items, null))}>Copy all</button
						>
					</div>
				{/if}
			</Popover.Content>
		</Popover.Portal>
	{/if}
</Popover.Root>
```

- [ ] **Step 4: CSS** — in `app.css`, replace nothing yet; add:

```css
/* Shared tooltip/popover surface — one look for every cell tooltip */
.tip-surface {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-width: 400px;
	max-height: 300px;
	overflow-y: auto;
	padding: 10px;
	background: rgba(45, 45, 45, 0.9);
	color: rgba(255, 255, 255, 0.95);
	border: none;
	border-radius: 6px;
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
	font-size: 13px;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-word;
	z-index: 100;
}
.tip-copy-btn { align-self: flex-end; opacity: 0.8; cursor: pointer; }
.tip-copy-btn:hover, .tip-copy-btn:focus-visible { opacity: 1; }
.tip-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tip-chip {
	padding: 3px 10px; border-radius: 12px; white-space: nowrap; cursor: pointer;
	background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25);
	color: rgba(255, 255, 255, 0.95);
}
.tip-chip[data-selected='true'] { background: rgba(255, 255, 255, 0.4); border-color: #fff; }
.tip-actions { display: flex; gap: 8px; }
.tip-actions button { cursor: pointer; text-decoration: underline; }
.tip-actions button:disabled { opacity: 0.4; cursor: default; text-decoration: none; }
```

- [ ] **Step 5:** Re-run the component tests — Expected: PASS. Fix any bits-ui prop-name mismatch by checking `PopoverContent` props in `node_modules/bits-ui` (`customAnchor`, `trapFocus`, `onOpenAutoFocus`); use context7 for bits-ui Popover if a prop differs.
- [ ] **Step 6:** Commit `feat(frontend): add CellPopover with copy and multi-select`.

---

### Task 4: Wire into ActivityTable

**Files:**
- Modify: `frontend/src/lib/components/ActivityTable.svelte` (imports ~L71-72; columnDefs tooltip props ~L489-633; `gridOptions` ~L714-726; template; new handlers)
- Test: `frontend/tests/components/ActivityTable.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveSpec`, `displayText`, `copyText`, `ColTooltipSpec` (Task 2); `CellPopover`, `PopoverState` (Task 3).
- Produces: `context: { tooltipSpec?: ColTooltipSpec }` on columns, read via `params.colDef.context`.

- [ ] **Step 1: Write failing tests.** Read the existing `ActivityTable.test.ts` mocking pattern first and follow it. Add tests that call the extracted handler (export `handleCellHover(event)` logic from a small helper `tooltipHover.ts` if the component is hard to drive):
  - default column (no `context`) → state has `text`= formatted value, `copy`= raw string;
  - `tooltipSpec: false` column → state stays `null`;
  - Likes column → `copy` equals `String(likeCount)` (no commas) while `text` has commas;
  - Tags column → `mode: 'multi'` with tags as `items`, and no `copy`.
  Run and confirm FAIL.

- [ ] **Step 2: Implement hover logic.** Create `frontend/src/lib/utils/tooltipHover.ts` exporting `buildPopoverState(params: { colDef; value; valueFormatted?; data; cellEl: HTMLElement }): PopoverState | null` using `resolveSpec(colDef.context?.tooltipSpec)`; return `null` when opted out. Multi: `mode:'multi', items: spec.items?.(ctx) ?? []`, `copy:null`. Single: `text: displayText`, `copy: copyText`.

- [ ] **Step 3: Component wiring.**
  - Add `let popover = $state<PopoverState | null>(null)`, `let openTimer`, `let closeTimer` (clear both in `onDestroy`).
  - `onCellMouseOver`: find `cellEl = (e.event?.target as HTMLElement)?.closest('.ag-cell')`; `clearTimeout(closeTimer)`; after **600ms** set `popover = buildPopoverState(...)`.
  - `onCellMouseOut`: `clearTimeout(openTimer)`; `closeTimer = setTimeout(() => (popover = null), 150)`.
  - `CellPopover` props: `onEnter = () => clearTimeout(closeTimer)`, `onLeave` = schedule close, `onClose = () => (popover = null)`.
  - `onCellKeyDown`: Enter/Space opens immediately; Esc handled by the popover. **Note:** `suppressCellFocus: true` is currently set, so cells cannot take focus and keyboard open will not fire yet — leave it, and record this as a known limitation for the user to decide (changing focus styling is outside this plan).
  - Render `<CellPopover state={popover} .../>` once next to the grid.

- [ ] **Step 4: Column overrides** (edit `columnDefs`):
  - Remove all `tooltipValueGetter`, `tooltipComponent`, `tooltipField` from columns and remove `tooltipValueGetter` from `defaultColDef`; keep `headerTooltip`s, `tooltipShowDelay: 1000`.
  - Add `context: { tooltipSpec: ... }`:
    - Views: `{ text: (c) => formatCountExact(c.data?.viewCount ?? null), copyValue: (c) => c.data?.viewCount }`
    - Likes: same with `likeCount`.
    - % Liked: `{ text: (c) => percentLikedTooltip({ data: c.data }), copyValue: (c) => percentLikedValueGetter({ data: c.data }) }`
    - Tags: `{ mode: 'multi', items: (c) => c.data?.tags ?? [] }`
    - Description: `{ text: (c) => c.data?.description ?? '' }`
    - Name / Category: default.
    - Perspectize/actions and thumbnail-style columns: `tooltipSpec: false`.
  - Remove the now-unused `TagsTooltip`/`DescriptionTooltip` imports.

- [ ] **Step 5:** Run `pnpm --dir frontend run test:run` — Expected: PASS (the Task 4 tests included; existing ActivityTable tests updated only where they asserted the removed tooltip props).
- [ ] **Step 6:** Commit `feat(frontend): wire CellPopover into ActivityTable with per-column specs`.

---

### Task 5: Remove legacy tooltip classes and unify

**Files:**
- Delete: `frontend/src/lib/components/TagsTooltip.ts`, `frontend/src/lib/components/DescriptionTooltip.ts` (and any tests referencing them)
- Modify: `frontend/src/app.css` (remove `.tags-tooltip`, `.tags-tooltip-chip`, `.description-tooltip`; keep `.ag-tooltip` for header tooltips, and align its `font-size` to `13px` and `padding` to `10px`, `border-radius: 6px` so header tooltips match `.tip-surface`)

- [ ] **Step 1:** `grep -rn "TagsTooltip\|DescriptionTooltip\|tags-tooltip\|description-tooltip" frontend/src frontend/tests` — remove every reference (stale-reference rule).
- [ ] **Step 2:** Update `.ag-tooltip` values as above.
- [ ] **Step 3:** Run `pnpm --dir frontend run check` and `pnpm --dir frontend run test:run` — Expected: 0 errors, all pass.
- [ ] **Step 4:** Commit `refactor(frontend): drop legacy Tags/Description tooltips, unify tooltip look`.

---

### Task 6: Verify and hand off

- [ ] **Step 1:** In `backend/` no changes — skip Go steps. Run `pnpm --dir frontend run test:run` and `pnpm --dir frontend run check`; report the summary lines.
- [ ] **Step 2 (local session only):** Drive the running app (Chrome DevTools MCP, authenticated profile). Hover Likes → popover shows `1,234`, copy → paste yields `1234`. Hover Tags → chips, select two, "Copy selected"; "Copy all". Confirm all popover text has the same computed font-size/padding/radius as a header tooltip. Capture `sv-` screenshots per `.docs/PR_SCREENSHOTS.md`.
- [ ] **Step 3:** Run `pnpm --dir frontend exec prettier --write` on touched files; run `graphify update .`.
- [ ] **Step 4:** Run session reflection (`/revise-claude-md` is a user command — ask the user to run it), then create the PR with `gh api` using the `feature.md` template. Note in the PR: mention the known keyboard-open limitation and the rebase order with the sort branch / PR 366.

---

## Self-review

- **Spec coverage:** shared look (T3 css, T5), shared popover + hover delay (T3/T4), keyboard open + Esc (T3 Esc test; T4 keydown, with the `suppressCellFocus` caveat), default + override + opt-out + multi (T2, T4), copy via clipboard + toast + error toast (T3), tests for every §4 state (T2/T3/T4), header keeps static tooltip (T4/T5), activity-table-only (Global Constraints), mismatch confirmation (T1).
- **Deviation from spec:** the default spec is applied in code (`resolveSpec`) rather than through `defaultColDef`, because AG Grid shallow-merges `defaultColDef` and a custom prop would need `context` anyway; behavior is identical.
- **Type consistency:** `CellCtx`, `TooltipSpec`, `ColTooltipSpec`, `resolveSpec`, `displayText`, `copyText`, `itemsCopyText`, `PopoverState` are used with the same names/signatures across tasks.
