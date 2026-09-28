<script lang="ts">
	import { page } from '$app/state';
	import Compare from '$lib/components/Compare.svelte';
	import ComparePicker from '$lib/components/ComparePicker.svelte';

	const contentId = $derived(page.url.searchParams.get('contentId') ?? '');
	const initialLeftId = $derived(page.url.searchParams.get('left') || null);
	const initialRightId = $derived(page.url.searchParams.get('right') || null);
</script>

{#if contentId}
	<Compare {contentId} {initialLeftId} {initialRightId} />
{:else}
	<ComparePicker />
{/if}
