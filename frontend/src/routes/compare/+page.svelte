<script lang="ts">
	import { page } from '$app/state';
	import Compare from '$lib/components/Compare.svelte';

	const contentId = $derived(page.url.searchParams.get('contentId') ?? '');
	const initialLeftId = $derived(page.url.searchParams.get('left') || null);
	const initialRightId = $derived(page.url.searchParams.get('right') || null);
</script>

{#if contentId}
	<Compare {contentId} {initialLeftId} {initialRightId} />
{:else}
	<div class="mx-auto max-w-[880px] px-5 py-12 text-center text-muted-foreground">
		No content selected. Open Compare from a piece of content's details.
	</div>
{/if}
