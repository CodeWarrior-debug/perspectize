<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';

	let {
		onPickType,
		onChooseColumns,
		disabled = false,
	}: {
		/** Opens the Type column's filter popup. */
		onPickType: () => void;
		/** Opens the column picker. */
		onChooseColumns: () => void;
		/** True until the grid is ready: both targets live on the grid API. */
		disabled?: boolean;
	} = $props();

	/**
	 * Float the note above the grid card, top right (#activity-callout-slot in the page),
	 * so it reads as a hint about the table rather than a row inside it. Without the
	 * slot (tests, other pages) it simply stays where it was rendered.
	 */
	function moveToCalloutSlot(node: HTMLElement) {
		document.getElementById('activity-callout-slot')?.appendChild(node);
	}

	const linkClass =
		'underline underline-offset-2 font-bold text-foreground hover:text-primary disabled:no-underline disabled:opacity-60 disabled:cursor-not-allowed';
</script>

<div
	role="note"
	data-testid="column-relevance-callout"
	use:moveToCalloutSlot
	class="flex items-center gap-1.5 pb-1.5 text-xs md:text-sm text-muted-foreground"
>
	<InfoIcon class="size-4 shrink-0" aria-hidden="true" />
	<p>
		Select
		<button type="button" class={linkClass} {disabled} onclick={onPickType}>one type</button>
		or
		<button type="button" class={linkClass} {disabled} onclick={onChooseColumns}>custom columns</button>
		for the most relevant info.
	</p>
</div>
