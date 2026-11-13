<script lang="ts">
	import { Button } from '$lib/components/shadcn';
	import LazyLoadError from '$lib/components/LazyLoadError.svelte';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import { activityContentHref } from '$lib/utils/contentLinks';
	import CheckIcon from '@lucide/svelte/icons/check';

	let {
		contentId,
		contentName,
	}: {
		/** The library row's id, from the page's URL → item map. */
		contentId: string;
		contentName: string;
	} = $props();

	// The signed-in user's numeric id, which PerspectivePopover needs.
	const meCtx = useMe();
	const userId = $derived(meCtx.me ? parseInt(meCtx.me.id, 10) : null);
	const contentIdNumber = $derived(Number(contentId));

	let popoverOpen = $state(false);

	/** Keeps the action buttons from also triggering a clickable parent card (VideoCard's click-to-watch). */
	function stopPropagation(event: Event) {
		event.stopPropagation();
	}
</script>

<!-- The one "already in your library" state, shared by every content type's Discover card. -->
<div class="flex flex-col gap-2" data-testid="library-status">
	<p class="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
		<CheckIcon class="size-4 text-primary" aria-hidden="true" />
		In Library
	</p>
	<div class="flex flex-wrap gap-2">
		<Button
			variant="outline"
			size="sm"
			onclick={(event: MouseEvent) => {
				stopPropagation(event);
				popoverOpen = true;
			}}
		>
			Add perspective
		</Button>
		<Button variant="outline" size="sm" href={`/compare?contentId=${contentId}`} onclick={stopPropagation}>
			Compare
		</Button>
		<Button variant="outline" size="sm" href={activityContentHref(contentId)} onclick={stopPropagation}>
			Go to item
		</Button>
	</div>
</div>

{#if popoverOpen}
	<!-- Dynamically imported: PerspectivePopover pulls in the Tiptap-based CommentsEditor, which
	     shouldn't load eagerly for every Discover page visit (same pattern as ActivityTable). -->
	{#await import('$lib/components/PerspectivePopover.svelte') then { default: PerspectivePopover }}
		<PerspectivePopover
			contentId={contentIdNumber}
			{contentName}
			userId={userId ?? 0}
			bind:open={popoverOpen}
			onClose={() => {
				popoverOpen = false;
			}}
		/>
	{:catch}
		<LazyLoadError what="the perspective editor" floating />
	{/await}
{/if}
