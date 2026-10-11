<script lang="ts">
	import SearchBar from '$lib/components/discover/SearchBar.svelte';

	// Host wrapper for testing SearchBar's $bindable value: it owns the bound
	// state and surfaces it in the DOM so tests can assert on two-way writes.
	let { onAddUrl }: { onAddUrl?: (url: string) => void } = $props();
	let value = $state('');
</script>

<SearchBar bind:value {onAddUrl} />
<p data-testid="bound-value">{value}</p>
