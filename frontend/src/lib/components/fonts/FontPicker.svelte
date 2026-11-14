<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import {
		CATEGORY_LABEL,
		fontStack,
		searchFonts,
		toChoice,
		type FontCategory,
		type FontChoice,
		type FontEntry,
	} from '$lib/fonts/googleFonts';
	import { fontPreview } from '$lib/fonts/previewFonts';
	import type { FontSlotInfo } from '$lib/fonts/slots';

	/**
	 * Type-ahead font combobox for one slot. Arrow keys and hover preview a font on the live
	 * page (via onPreview); Enter or click keeps it; Escape, Tab or leaving restores the saved
	 * pick. `null` everywhere means "the app's default font for this slot".
	 */
	let {
		id,
		info,
		catalog,
		value,
		onCommit,
		onPreview,
		onPreviewEnd,
	}: {
		id: string;
		info: FontSlotInfo;
		catalog: readonly FontEntry[];
		value: FontChoice | null;
		onCommit: (choice: FontChoice | null) => void;
		onPreview: (choice: FontChoice | null) => void;
		onPreviewEnd: () => void;
	} = $props();

	type Row = { kind: 'default' } | { kind: 'font'; entry: FontEntry; group: 'recommended' | 'all'; note?: string };

	const PAGE = 120; // rows rendered at a time; more load as the list scrolls
	const CATEGORIES: (FontCategory | 'all')[] = ['all', 's', 'a', 'm', 'd', 'h'];

	let open = $state(false);
	let query = $state('');
	let category = $state<FontCategory | 'all'>('all');
	let variableOnly = $state(false);
	let active = $state(-1);
	let limit = $state(PAGE);
	let listEl = $state<HTMLElement | null>(null);
	let rootEl = $state<HTMLElement | null>(null);

	const rows = $derived.by<Row[]>(() => {
		const found = searchFonts(catalog, { query, category, variableOnly, recommended: info.recommended });
		const fonts: Row[] = found.map((o) => ({ kind: 'font', entry: o.entry, group: o.group, note: o.note }));
		const showDefault = !query.trim() && category === 'all' && !variableOnly;
		return showDefault ? [{ kind: 'default' }, ...fonts] : fonts;
	});
	const shown = $derived(rows.slice(0, limit));
	const fontCount = $derived(rows.filter((r) => r.kind === 'font').length);
	const displayValue = $derived(value ? value.family : `${info.defaultLabel} (default)`);

	function choiceOf(row: Row): FontChoice | null {
		return row.kind === 'default' ? null : toChoice(row.entry);
	}

	function isCurrent(row: Row): boolean {
		return row.kind === 'default' ? value === null : value?.family === row.entry.family;
	}

	function groupLabel(row: Row): string {
		if (row.kind === 'default') return 'In the app today';
		return row.group === 'recommended' ? `Recommended for ${info.label.toLowerCase()}` : 'All Google Fonts';
	}

	function startsGroup(i: number): boolean {
		if (i === 0) return true;
		const a = shown[i - 1];
		const b = shown[i];
		return a.kind !== b.kind || (a.kind === 'font' && b.kind === 'font' && a.group !== b.group);
	}

	function openList() {
		if (open) return;
		open = true;
		query = '';
		active = -1;
		limit = PAGE;
	}

	function close(revert: boolean) {
		if (!open) return;
		open = false;
		query = '';
		active = -1;
		if (revert) onPreviewEnd();
	}

	function commit(row: Row) {
		onCommit(choiceOf(row));
		close(false);
	}

	function setActive(i: number, scroll: boolean) {
		active = i;
		if (i >= limit) limit = i + PAGE;
		onPreview(choiceOf(rows[i]));
		if (scroll) queueMicrotask(() => listEl?.querySelector(`#${id}-opt-${i}`)?.scrollIntoView?.({ block: 'nearest' }));
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			openList();
			if (rows.length === 0) return;
			const n = rows.length;
			setActive(e.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n, true);
		} else if (e.key === 'Enter') {
			if (!open) return;
			e.preventDefault();
			const row = rows[active >= 0 ? active : 0];
			if (row) commit(row);
		} else if (e.key === 'Tab') {
			close(true);
		}
	}

	// Escape must be caught before bits-ui's dialog sees it (capture phase), or the whole
	// Settings dialog closes instead of just this list — see frontend/CLAUDE.md.
	$effect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.stopPropagation();
			e.preventDefault();
			close(true);
		};
		document.addEventListener('keydown', handler, { capture: true });
		return () => document.removeEventListener('keydown', handler, { capture: true });
	});

	function onFocusOut(e: FocusEvent) {
		if (!rootEl?.contains(e.relatedTarget as Node | null)) close(true);
	}

	function onListScroll() {
		if (!listEl || limit >= rows.length) return;
		if (listEl.scrollTop + listEl.clientHeight > listEl.scrollHeight - 300) limit += PAGE;
	}

	const sampleFamily = $derived.by(() => {
		const row = active >= 0 ? rows[active] : undefined;
		const choice = row ? choiceOf(row) : value;
		return choice ? fontStack(choice) : undefined;
	});
</script>

<div class="flex flex-col gap-1.5" bind:this={rootEl} onfocusout={onFocusOut}>
	<div class="relative">
		<input
			{id}
			type="text"
			role="combobox"
			aria-expanded={open}
			aria-controls="{id}-list"
			aria-autocomplete="list"
			aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
			autocomplete="off"
			spellcheck="false"
			placeholder="Type to search Google Fonts…"
			value={open ? query : displayValue}
			onfocus={openList}
			onclick={openList}
			oninput={(e) => {
				openList();
				query = e.currentTarget.value;
				limit = PAGE;
				active = -1;
				if (query.trim() && rows.length > 0) setActive(0, true);
			}}
			onkeydown={onKeydown}
			class="border-input bg-background placeholder:text-muted-foreground flex h-9 w-full min-w-0 rounded-md border pl-3 pr-9 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
		/>
		<ChevronDownIcon
			class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
			aria-hidden="true"
		/>
	</div>

	{#if open}
		<!-- In the document flow (not a floating popover) so the Settings pane's own scroll never clips it. -->
		<div class="rounded-md border border-border bg-popover text-popover-foreground shadow-sm">
			<div class="flex flex-wrap items-center gap-1 border-b border-border p-2">
				{#each CATEGORIES as c (c)}
					<button
						type="button"
						aria-pressed={category === c}
						onmousedown={(e) => e.preventDefault()}
						onclick={() => {
							category = c;
							limit = PAGE;
							active = -1;
						}}
						class="rounded-full border px-2 py-0.5 text-xs {category === c
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border text-muted-foreground hover:text-foreground'}"
					>
						{c === 'all' ? 'All' : CATEGORY_LABEL[c]}
					</button>
				{/each}
				<label
					class="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground"
					title="Variable fonts carry every weight in one file"
				>
					<input type="checkbox" bind:checked={variableOnly} class="size-3.5 accent-primary" />
					Variable only
				</label>
			</div>

			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				id="{id}-list"
				role="listbox"
				aria-label="{info.label} fonts"
				tabindex="-1"
				bind:this={listEl}
				onscroll={onListScroll}
				onmouseleave={() => {
					active = -1;
					onPreviewEnd();
				}}
				class="max-h-72 overflow-y-auto py-1"
			>
				{#each shown as row, i (row.kind === 'default' ? '__default' : row.entry.family)}
					{#if startsGroup(i)}
						<div class="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
							{groupLabel(row)}
						</div>
					{/if}
					<div
						id="{id}-opt-{i}"
						role="option"
						tabindex="-1"
						aria-selected={i === active}
						title={row.kind === 'font' ? row.note : undefined}
						onmouseenter={() => i !== active && setActive(i, false)}
						onclick={() => commit(row)}
						onkeydown={() => {}}
						class="flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 {i === active ? 'bg-accent' : ''}"
					>
						{#if row.kind === 'default'}
							<div class="min-w-0">
								<div class="truncate text-[15px]">{info.defaultLabel}</div>
								<div class="text-[11px] text-muted-foreground">The app's default</div>
							</div>
						{:else}
							<div class="min-w-0" use:fontPreview={{ family: row.entry.family, root: listEl }}>
								<div class="truncate text-[15px]" style:font-family={fontStack(row.entry)}>{row.entry.family}</div>
								{#if row.note}
									<div class="truncate text-[11px] text-muted-foreground">{row.note}</div>
								{/if}
							</div>
							<div class="flex flex-none items-center gap-1">
								{#if row.entry.variable}
									<span class="rounded bg-muted px-1 py-px text-[10px] leading-none text-muted-foreground">Var</span>
								{/if}
								<span
									class="rounded border border-border px-1 py-px text-[10px] leading-none whitespace-nowrap text-muted-foreground"
									>{CATEGORY_LABEL[row.entry.category]}</span
								>
							</div>
						{/if}
						{#if isCurrent(row)}<span class="flex-none text-xs text-primary" aria-label="current">✓</span>{/if}
					</div>
				{:else}
					<div class="px-3 py-6 text-center text-sm text-muted-foreground">No fonts match.</div>
				{/each}
			</div>
			<div class="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
				{fontCount.toLocaleString()} fonts · ↑↓ preview on the page · Enter keeps · Esc cancels
			</div>
		</div>
	{/if}

	<div
		class="rounded-md border border-dashed border-border px-3 py-2 text-foreground {info.sampleClass} {info.defaultFontClass}"
		style:font-family={sampleFamily}
		data-testid="{id}-sample"
	>
		{info.sample}
	</div>
</div>
