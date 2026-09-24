<script lang="ts">
	import { page } from '$app/state';
	import Compare from '$lib/components/Compare.svelte';
	import { Button } from '$lib/components/shadcn';

	const contentId = $derived(page.url.searchParams.get('contentId') ?? '');
	const initialLeftId = $derived(page.url.searchParams.get('left') || null);
	const initialRightId = $derived(page.url.searchParams.get('right') || null);
</script>

{#if contentId}
	<Compare {contentId} {initialLeftId} {initialRightId} />
{:else}
	<div class="mx-auto flex max-w-[880px] flex-col items-center gap-4 px-5 py-16 text-center">
		<h1 class="text-xl font-semibold text-foreground">Choose something to compare</h1>
		<p class="max-w-md text-muted-foreground">
			Compare puts two perspectives on the same content side by side. Open it from a piece of content's details in
			Activity.
		</p>
		<Button href="/">Go to Activity</Button>
	</div>
{/if}
