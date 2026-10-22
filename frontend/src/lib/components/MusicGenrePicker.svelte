<script lang="ts">
	import {
		buildGenreTree,
		filterGenreTree,
		flattenGenres,
		loadRecentGenres,
		pushRecent,
		saveRecentGenres,
		type GenreInput,
		type GenreNode,
	} from '$lib/utils/genreTree';

	let {
		genres,
		value = null,
		onSelect,
		label = 'Genre',
		disabled = false,
	}: {
		genres: readonly GenreInput[];
		value?: string | null;
		onSelect: (id: string) => void;
		label?: string;
		disabled?: boolean;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let expanded = $state(new Set<string>());
	// While searching every matching branch is open, unless the user closed it.
	let closedInSearch = $state(new Set<string>());
	let recent = $state<string[]>(loadRecentGenres());

	const tree = $derived(buildGenreTree(genres));
	const byId = $derived(flattenGenres(tree));
	const visible = $derived(filterGenreTree(tree, query));
	const searching = $derived(query.trim() !== '');
	const selected = $derived(value ? (byId.get(value) ?? null) : null);
	const recentNodes = $derived(recent.map((id) => byId.get(id)).filter((n): n is GenreNode => !!n));

	function isOpen(n: GenreNode) {
		return searching ? !closedInSearch.has(n.id) : expanded.has(n.id);
	}

	function toggle(n: GenreNode) {
		const set = new Set(searching ? closedInSearch : expanded);
		if (set.has(n.id)) set.delete(n.id);
		else set.add(n.id);
		if (searching) closedInSearch = set;
		else expanded = set;
	}

	function expandAll() {
		expanded = new Set(byId.keys());
		closedInSearch = new Set();
	}

	function collapseAll() {
		expanded = new Set();
		if (searching) closedInSearch = new Set(byId.keys());
	}

	function finish(n: GenreNode) {
		recent = pushRecent(recent, n.id);
		saveRecentGenres(recent);
		onSelect(n.id);
		open = false;
		query = '';
		closedInSearch = new Set();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation(); // don't close the surrounding dialog/popover
			open = false;
		}
	}
</script>

<div class="relative" data-testid="music-genre-picker">
	<button
		type="button"
		class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-left text-[13px] hover:bg-muted disabled:opacity-50"
		aria-haspopup="tree"
		aria-expanded={open}
		{disabled}
		onclick={() => (open = !open)}
	>
		{selected ? selected.path.join(' › ') : 'Choose a genre'}
	</button>

	{#if open}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-background p-2 text-[13px] shadow-md"
			role="dialog"
			aria-label="Choose a genre"
			tabindex="-1"
			onkeydown={onKeydown}
		>
			<input
				type="search"
				class="w-full rounded border border-border bg-background px-2 py-1"
				placeholder="Search genres"
				aria-label="Search genres"
				bind:value={query}
				oninput={() => (closedInSearch = new Set())}
			/>
			<div class="mt-1.5 flex gap-2 text-[12px]">
				<button type="button" class="text-primary hover:underline" onclick={expandAll}>Expand all</button>
				<button type="button" class="text-primary hover:underline" onclick={collapseAll}>Collapse all</button>
			</div>
			{#if recentNodes.length}
				<div class="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Recent genres">
					<span class="text-[12px] text-muted-foreground">Recent</span>
					{#each recentNodes as n (n.id)}
						<button
							type="button"
							class="rounded-full border border-border px-2 py-0.5 hover:bg-muted"
							title={n.path.join(' › ')}
							onclick={() => finish(n)}>{n.name}</button
						>
					{/each}
				</div>
			{/if}
			<ul role="tree" aria-label={label} class="mt-2">
				{#each visible as node (node.id)}
					{@render branch(node)}
				{/each}
			</ul>
			{#if visible.length === 0}
				<p class="px-1 py-2 text-muted-foreground">No genre matches “{query}”.</p>
			{/if}
		</div>
	{/if}
</div>

{#snippet branch(n: GenreNode)}
	<li role="treeitem" aria-expanded={n.children.length ? isOpen(n) : undefined} aria-selected={n.id === value}>
		<div class="flex items-center gap-1">
			{#if n.children.length}
				<button
					type="button"
					class="h-7 w-6 shrink-0 rounded text-[11px] text-muted-foreground hover:bg-muted"
					aria-label={(isOpen(n) ? 'Collapse ' : 'Expand ') + n.name}
					onclick={() => toggle(n)}>{isOpen(n) ? '▼' : '▶'}</button
				>
			{:else}
				<span class="h-7 w-6 shrink-0"></span>
			{/if}
			<button
				type="button"
				class="pick flex-1 rounded px-1 py-1 text-left hover:bg-muted"
				class:font-semibold={n.id === value}
				onclick={() => (n.children.length ? toggle(n) : finish(n))}>{n.name}</button
			>
			{#if n.children.length}
				<button
					type="button"
					class="rounded px-1.5 text-[12px] text-primary hover:underline"
					aria-label={'Select ' + n.path.join(' › ')}
					onclick={() => finish(n)}>Select</button
				>
			{/if}
		</div>
		{#if n.children.length && isOpen(n)}
			<ul role="group" class="ml-4">
				{#each n.children as child (child.id)}
					{@render branch(child)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}
