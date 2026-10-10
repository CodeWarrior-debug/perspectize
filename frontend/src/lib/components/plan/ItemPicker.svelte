<script lang="ts">
	import ContentSearchInput from '$lib/components/ContentSearchInput.svelte';
	import { useContentPicker } from '$lib/queries/content/useContentPicker';
	import { CONTENT_TYPE_OPTIONS, contentTypeLabel } from '$lib/utils/grid-config';

	/**
	 * ItemPicker: search the content already in Perspectize, optionally narrowed
	 * by type chips (none pressed = every type). Choosing a row hands it up; the
	 * last button is the way out for an item that isn't here, so its name can be
	 * typed instead. The parent owns what happens next.
	 */
	let {
		onPick,
		onFreeText,
	}: {
		onPick: (item: { id: number; name: string }) => void;
		onFreeText: () => void;
	} = $props();

	let search = $state('');
	let debouncedSearch = $state('');
	/** Pressed chips, as CONTENT_TYPE_OPTIONS values (lowercase), in press order. */
	let pressed = $state<string[]>([]);

	const types = $derived(pressed.map((value) => value.toUpperCase()));
	const query = useContentPicker(() => ({ search: debouncedSearch, types }));
	const items = $derived(query.data?.content.items ?? []);

	function toggle(value: string) {
		pressed = pressed.includes(value) ? pressed.filter((v) => v !== value) : [...pressed, value];
	}
</script>

<div class="flex flex-col gap-2">
	<ContentSearchInput bind:value={search} bind:debouncedQuery={debouncedSearch} />

	<div class="flex flex-wrap gap-1.5" role="group" aria-label="Item type">
		{#each CONTENT_TYPE_OPTIONS as option (option.value)}
			<button
				type="button"
				aria-pressed={pressed.includes(option.value)}
				onclick={() => toggle(option.value)}
				class="border-border rounded-full border px-3 py-1 text-xs transition-colors {pressed.includes(option.value)
					? 'bg-primary text-primary-foreground border-primary'
					: 'bg-background text-foreground hover:bg-accent'}"
			>
				{option.label}
			</button>
		{/each}
	</div>

	<div role="listbox" aria-label="Items" class="border-border max-h-44 min-h-12 overflow-y-auto rounded-md border p-1">
		{#if query.isPending}
			<p class="text-muted-foreground px-2 py-1.5 text-sm">Searching...</p>
		{:else if items.length === 0}
			<p class="text-muted-foreground px-2 py-1.5 text-sm">No matching items</p>
		{:else}
			{#each items as item (item.id)}
				<button
					type="button"
					role="option"
					aria-selected="false"
					onclick={() => onPick({ id: Number(item.id), name: item.name })}
					class="hover:bg-accent hover:text-accent-foreground flex w-full flex-col rounded-sm px-2 py-1.5 text-left"
				>
					<span class="line-clamp-1 text-sm">{item.name}</span>
					<span class="text-muted-foreground line-clamp-1 text-xs">
						{contentTypeLabel(item.contentType.toLowerCase())}{item.channelTitle ? ` · ${item.channelTitle}` : ''}
					</span>
				</button>
			{/each}
		{/if}
	</div>

	<button type="button" onclick={onFreeText} class="text-primary self-start text-sm underline-offset-2 hover:underline">
		Not in Perspectize
	</button>
</div>
