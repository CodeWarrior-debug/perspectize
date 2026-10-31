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

	const linkClass =
		'underline underline-offset-2 font-medium text-foreground hover:text-primary disabled:no-underline disabled:opacity-60 disabled:cursor-not-allowed';
</script>

<div
	role="note"
	data-testid="column-relevance-callout"
	class="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/50 text-xs md:text-sm text-muted-foreground"
>
	<InfoIcon class="size-4 shrink-0" aria-hidden="true" />
	<p>
		<button type="button" class={linkClass} {disabled} onclick={onPickType}>Pick one type</button>
		or
		<button type="button" class={linkClass} {disabled} onclick={onChooseColumns}>choose custom columns</button>
		for the most relevant info.
	</p>
</div>
