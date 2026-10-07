<!-- frontend/src/lib/components/VerseJumpPrompt.svelte -->
<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import { useOpenPassage } from '$lib/queries/content/useOpenPassage';
	import { singleVerseRange, singleVerseReference } from '$lib/utils/verseJump';

	let {
		verseId,
		left,
		top,
		onClose,
	}: { verseId: number; left: number; top: number; onClose: (opts?: { restoreFocus?: boolean }) => void } = $props();

	// Mounted only while the prompt is open, so the mutation exists only when it can be used.
	const openPassage = useOpenPassage();
	const reference = $derived(singleVerseReference(verseId));

	let goButton = $state<HTMLButtonElement | undefined>();
	$effect(() => {
		goButton?.focus();
	});

	function go() {
		const range = singleVerseRange(verseId);
		if (!range || openPassage.isPending) return;
		openPassage.mutate(range, { onSuccess: () => onClose() });
	}

	// Capture phase so Escape closes this prompt before the surrounding dialog's escape layer sees it.
	$effect(() => {
		const onKeydown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.stopPropagation();
			onClose({ restoreFocus: true });
		};
		document.addEventListener('keydown', onKeydown, { capture: true });
		return () => document.removeEventListener('keydown', onKeydown, { capture: true });
	});
</script>

{#if reference}
	<div
		role="dialog"
		aria-label="Open {reference} on its own"
		data-verse-jump-prompt
		class="absolute z-30 font-sans"
		style:left="{left}px"
		style:top="{top}px"
	>
		<button
			bind:this={goButton}
			type="button"
			disabled={openPassage.isPending}
			onclick={go}
			class="inline-flex cursor-pointer items-center gap-2.5 rounded-full border border-border bg-popover py-1 pr-1 pl-3.5 text-[13px] whitespace-nowrap text-popover-foreground shadow-md hover:border-primary disabled:cursor-wait"
		>
			<span>See <strong class="font-semibold">{reference}</strong> only</span>
			<span
				aria-hidden="true"
				class="inline-flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
			>
				{#if openPassage.isPending}
					<LoaderCircleIcon class="size-4 animate-spin" />
				{:else}
					<ArrowRightIcon class="size-4" />
				{/if}
			</span>
		</button>
	</div>
{/if}
