<!-- frontend/src/lib/components/VerseNumber.svelte -->
<script lang="ts">
	import { getVerseJump } from '$lib/utils/verseJump';

	let {
		verseId,
		verse,
		variant = 'sup',
	}: {
		verseId: number;
		verse: number;
		/** `sup`: inline superscript in running text; `label`: the chips row's verse marker */
		variant?: 'sup' | 'label';
	} = $props();

	const jump = getVerseJump();
	const interactive = $derived(!!jump?.enabled);

	function onclick(e: MouseEvent) {
		// Keep the click from reaching delegated handlers (interlinear word pinning).
		e.stopPropagation();
		jump?.toggle(verseId, e.currentTarget as HTMLElement);
	}
</script>

{#snippet number()}
	{#if interactive}
		<button
			type="button"
			data-verse-number={verseId}
			aria-label="Verse {verse}"
			aria-haspopup="dialog"
			aria-expanded={jump?.activeVerseId === verseId}
			class="cursor-pointer rounded-sm border-0 bg-transparent p-0 font-[inherit] text-inherit hover:text-primary hover:underline aria-expanded:text-primary aria-expanded:underline"
			{onclick}>{verse}</button
		>
	{:else}{verse}{/if}
{/snippet}

{#if variant === 'sup'}
	<sup class="mr-0.5 ml-0.5 text-[10px] text-muted-foreground">{@render number()}</sup>
{:else}
	<span class="self-center text-[10px] text-muted-foreground">{@render number()}</span>
{/if}
