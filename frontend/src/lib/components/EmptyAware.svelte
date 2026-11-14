<script lang="ts">
	import { EMPTY_CLASS, isEmptyMarker } from '$lib/utils/grid-empty';

	let { text }: { text: string } = $props();
</script>

<span class={isEmptyMarker(text) ? EMPTY_CLASS : undefined}>{text}</span>
