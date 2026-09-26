<script lang="ts">
	import {
		BIBLE_PASSAGE_ICON_SVG_SCALABLE,
		BIBLE_ICON_WRAPPER_CLASS,
		BIBLE_ICON_LABEL_CLASS,
		BIBLE_ICON_LEFT_CLASS,
		BIBLE_ICON_RIGHT_CLASS,
		bibleIconLabelLines,
	} from '$lib/utils/icons';

	// Labels come from bible.ts's passageIconLabels.
	let { left = '', right = '' }: { left?: string; right?: string } = $props();
</script>

<div class="flex h-full w-full items-center justify-center text-primary">
	<div class={BIBLE_ICON_WRAPPER_CLASS}>
		{@html BIBLE_PASSAGE_ICON_SVG_SCALABLE}
		{#each [[left, BIBLE_ICON_LEFT_CLASS], [right, BIBLE_ICON_RIGHT_CLASS]] as [text, side] (side)}
			{#if text}
				{@const { lines, sizeClass } = bibleIconLabelLines(text)}
				<span class="{BIBLE_ICON_LABEL_CLASS} {side} {sizeClass}">
					{#each lines as line, i (i)}<span>{line}</span>{/each}
				</span>
			{/if}
		{/each}
	</div>
</div>
