<script lang="ts">
	import { passagePosition } from '$lib/utils/biblePosition';

	let { startVerseId, endVerseId }: { startVerseId: number; endVerseId: number } = $props();

	const position = $derived(passagePosition(startVerseId, endVerseId));
</script>

{#if position}
	<div class="space-y-1">
		<div
			data-testid="position-bar"
			title={position.tooltip}
			class="relative h-2 w-full overflow-hidden rounded-full bg-muted"
		>
			<div
				data-testid="nt-boundary"
				class="absolute top-0 h-full w-px bg-border"
				style="left: {position.ntBoundaryPct}%"
			></div>
			<div
				data-testid="position-segment"
				class="absolute top-0 h-full rounded-full bg-primary"
				style="left: {position.leftPct}%; width: {position.widthPct}%; min-width: 4px"
			></div>
		</div>
		<p class="text-[11px] text-muted-foreground">{position.label}</p>
	</div>
{/if}
