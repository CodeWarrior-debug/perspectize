<script lang="ts">
	import {
		BIBLE_PASSAGE_ICON_SVG_SCALABLE,
		BIBLE_ICON_WRAPPER_CLASS,
		BIBLE_ICON_LABEL_CLASS,
		BIBLE_ICON_LEFT_CLASS,
		BIBLE_ICON_RIGHT_CLASS,
		BIBLE_ICON_REF_TEXT_CLASS,
		BIBLE_ICON_TITLE_TEXT_CLASS,
	} from '$lib/utils/icons';

	// Labels come from bible.ts's passageIconLabels.
	let {
		left = '',
		right = '',
		rightIsTitle = false,
	}: { left?: string; right?: string; rightIsTitle?: boolean } = $props();
</script>

<div class="flex h-full w-full items-center justify-center text-primary">
	<div class={BIBLE_ICON_WRAPPER_CLASS}>
		{@html BIBLE_PASSAGE_ICON_SVG_SCALABLE}
		{#if left}
			<span class="{BIBLE_ICON_LABEL_CLASS} {BIBLE_ICON_LEFT_CLASS}">
				<span class={BIBLE_ICON_REF_TEXT_CLASS}>{left}</span>
			</span>
		{/if}
		{#if right}
			<span class="{BIBLE_ICON_LABEL_CLASS} {BIBLE_ICON_RIGHT_CLASS}">
				<span lang="en" class={rightIsTitle ? BIBLE_ICON_TITLE_TEXT_CLASS : BIBLE_ICON_REF_TEXT_CLASS}>{right}</span>
			</span>
		{/if}
	</div>
</div>
