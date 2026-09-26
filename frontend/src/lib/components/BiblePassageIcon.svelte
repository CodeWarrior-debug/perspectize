<script lang="ts">
	import { BIBLE_PASSAGE_ICON_SVG_SCALABLE } from '$lib/utils/icons';

	// left/right are the open book's page-flap labels — see bible.ts's
	// passageIconLabels for how they're derived (abbreviated reference vs.
	// reference + title split).
	let { left = '', right = '' }: { left?: string; right?: string } = $props();
</script>

<div class="relative flex h-full w-full items-center justify-center text-primary">
	{@html BIBLE_PASSAGE_ICON_SVG_SCALABLE}
	{#if left || right}
		<div class="absolute inset-0 flex items-center justify-center px-1 text-[9px] leading-none font-semibold">
			<span class="flex-1 truncate text-right">{left}</span>
			<span class="w-1.5 flex-none"></span>
			<span class="flex-1 truncate text-left">{right}</span>
		</div>
	{/if}
</div>
