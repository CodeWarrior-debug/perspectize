<script lang="ts">
	// The page's own description, or a plain line when it has none. A webpage has no related-content
	// section: there is nothing to relate it to.
	//
	// The description comes from the list row, else the page metadata in `response` (loaded by the
	// modal when the row lacks it). "No description" is claimed only once the details have loaded and
	// really have none: while they load, or when they failed, the line says so instead.
	let {
		row,
		state = 'loaded',
	}: {
		row: { description: string | null; response?: unknown };
		/** 'loading' while the details request is in flight, 'failed' when it errored, else 'loaded'. */
		state?: 'loading' | 'failed' | 'loaded';
	} = $props();

	const description = $derived(
		row.description?.trim() ||
			(row.response as { description?: string | null } | null | undefined)?.description?.trim() ||
			'',
	);
</script>

<div class="mt-3.5 border-t border-border pt-3.5">
	<div class="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Description</div>
	{#if description}
		<div class="font-slot-longform font-serif text-[13px] whitespace-pre-wrap text-foreground">{description}</div>
	{:else if state === 'loading'}
		<div role="status" class="text-[13px] text-muted-foreground">Loading the page's description…</div>
	{:else if state === 'failed'}
		<div class="text-[13px] text-muted-foreground">Couldn't load this page's description.</div>
	{:else}
		<div class="text-[13px] text-muted-foreground">This page has no description.</div>
	{/if}
</div>
