<script lang="ts">
	import CategoryTypeahead from '$lib/components/CategoryTypeahead.svelte';

	// Host wrapper for testing CategoryTypeahead's debounce. A plain render()
	// can't observe the internal debounced term; this owns the bound state and
	// surfaces `debouncedTerm` in the DOM so tests can assert the debounce
	// effect actually re-runs on each keystroke (the bug: it only ran on mount).
	let debouncedTerm = $state('');
</script>

<CategoryTypeahead contentId={1} currentCategory={null} onSelect={() => {}} onClose={() => {}} bind:debouncedTerm />
<p data-testid="debounced-term">{debouncedTerm}</p>
