<script lang="ts">
	import ContentSearchInput from '$lib/components/ContentSearchInput.svelte';

	// Host wrapper for testing ContentSearchInput's $bindable props. A plain render()
	// can't observe two-way bound prop writes without a component that
	// actually owns the bound state and re-renders on change — this does
	// that, and surfaces `debouncedQuery` in the DOM so tests can assert on
	// it via testing-library queries instead of reaching into internals.
	let value = $state('');
	let debouncedQuery = $state('');
</script>

<ContentSearchInput bind:value bind:debouncedQuery />
<p data-testid="debounced-query">{debouncedQuery}</p>
