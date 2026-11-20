<script lang="ts">
	import { otherTypeOptionsWhenOne } from '$lib/utils/gridUrlState';

	let {
		filters,
		onSelect,
	}: {
		filters: Record<string, string>;
		/** Receives the lowercased type value to show on its own (e.g. `movie`). */
		onSelect: (value: string) => void;
	} = $props();

	const options = $derived(otherTypeOptionsWhenOne(filters));
</script>

{#if options.length > 0}
	<div class="w-full max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8 flex flex-wrap items-center gap-2">
		<span class="text-xs text-muted-foreground">Other types:</span>
		{#each options as option (option.value)}
			<button
				type="button"
				aria-label="Show only {option.label}"
				class="inline-flex items-center px-2.5 py-1 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
				onclick={() => onSelect(option.value)}
			>
				{option.label}
			</button>
		{/each}
	</div>
{/if}
