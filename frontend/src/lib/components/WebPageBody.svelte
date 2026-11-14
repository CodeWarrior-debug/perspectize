<script lang="ts">
	// The page's own description, or a plain line when it has none. A webpage has no related-content
	// section: there is nothing to relate it to.
	let { row }: { row: { description: string | null } } = $props();

	const description = $derived(row.description?.trim() ?? '');
</script>

<div class="mt-3.5 border-t border-border pt-3.5">
	<div class="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Description</div>
	{#if description}
		<div class="font-slot-longform font-serif text-[13px] whitespace-pre-wrap text-foreground">{description}</div>
	{:else}
		<div class="text-[13px] text-muted-foreground">This page has no description.</div>
	{/if}
</div>
