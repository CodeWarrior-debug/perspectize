<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import { PASSAGE_TEXT_QUERY, type PassageTextResponse } from '$lib/queries/bible';
	import { queryKeys } from '$lib/queries/keys';
	import OriginalLanguage from '$lib/components/interlinear/OriginalLanguage.svelte';
	import VerseNumber from '$lib/components/VerseNumber.svelte';
	import VerseJumpPrompt from '$lib/components/VerseJumpPrompt.svelte';
	import { setVerseJump } from '$lib/utils/verseJump';

	let { startVerseId, endVerseId }: { startVerseId: number; endVerseId: number } = $props();

	// Two-tier cap (AN Q13): render in full up to COLLAPSE_THRESHOLD verses,
	// collapse behind a toggle up to HARD_CAP, and show no text beyond that
	// (PassageLinks, rendered alongside, carries the outbound link).
	const COLLAPSE_THRESHOLD = 30;
	const HARD_CAP = 150;
	const COLLAPSED_PREVIEW_COUNT = 10;

	let expanded = $state(false);
	// "Show original language": off on every open. The interlinear query lives in the lazily
	// mounted OriginalLanguage child, so nothing extra is fetched until this is turned on.
	let showOriginal = $state(false);

	const verseCount = $derived(endVerseId - startVerseId + 1);
	const overCap = $derived(verseCount > HARD_CAP);

	// Over the hard cap we never fetch — no inline text is shown anyway.
	const query = createQuery(() => ({
		queryKey: queryKeys.bible.passageText(startVerseId, endVerseId),
		queryFn: () => graphqlRequest<PassageTextResponse>(PASSAGE_TEXT_QUERY, { startVerseId, endVerseId }),
		enabled: !overCap,
		staleTime: Infinity, // verse text never changes
	}));

	// "See <ref> only": clicking a verse number (plain or interlinear view) opens a small
	// prompt under it that jumps to — or first adds — that single verse as its own passage.
	const PROMPT_WIDTH = 220;
	let container = $state<HTMLDivElement | undefined>();
	let jump = $state<{ verseId: number; left: number; top: number; anchor: HTMLElement } | null>(null);

	function closeJump(opts?: { restoreFocus?: boolean }) {
		if (opts?.restoreFocus) jump?.anchor.focus();
		jump = null;
	}

	setVerseJump({
		get enabled() {
			return verseCount > 1;
		},
		get activeVerseId() {
			return jump?.verseId ?? null;
		},
		toggle(verseId, anchor) {
			if (jump?.verseId === verseId || !container) {
				jump = null;
				return;
			}
			const c = container.getBoundingClientRect();
			const a = anchor.getBoundingClientRect();
			const left = Math.max(0, Math.min(a.left - c.left - 8, c.width - PROMPT_WIDTH));
			jump = { verseId, left, top: a.bottom - c.top + 6, anchor };
		},
	});

	// A different passage (e.g. after jumping to a single verse) drops any open prompt.
	$effect(() => {
		void startVerseId;
		void endVerseId;
		jump = null;
	});

	function onDocumentPointerDown(e: Event) {
		const target = e.target as HTMLElement | null;
		if (!jump || target?.closest('[data-verse-jump-prompt],[data-verse-number]')) return;
		jump = null;
	}

	const verses = $derived(query.data?.passageText.verses ?? []);
	const visibleVerses = $derived(
		verseCount <= COLLAPSE_THRESHOLD || expanded ? verses : verses.slice(0, COLLAPSED_PREVIEW_COUNT),
	);
</script>

{#snippet plain()}
	<div>
		{#each visibleVerses as v (v.verseId)}
			<!-- The explicit trailing space keeps a verse number from running into the previous verse's last word. -->
			<span
				>{#if v.text}<VerseNumber verseId={v.verseId} verse={v.verse} />{v.text}{' '}{/if}</span
			>
		{/each}
	</div>
{/snippet}

<svelte:document onpointerdown={onDocumentPointerDown} />
<svelte:window onresize={() => closeJump()} />

<div
	bind:this={container}
	class="passage-text relative font-[family-name:var(--font-family-serif)] text-[15px] leading-relaxed text-foreground"
>
	{#if overCap}
		<p class="text-muted-foreground">{verseCount} verses — too long to display here.</p>
	{:else if query.isLoading}
		<p class="text-muted-foreground">Loading passage…</p>
	{:else if query.isError}
		<p class="text-destructive">Couldn't load this passage.</p>
	{:else if query.data}
		{@const { translation, copyright } = query.data.passageText}
		{#if showOriginal}
			<OriginalLanguage {startVerseId} {endVerseId} verses={visibleVerses} {plain} />
		{:else}
			{@render plain()}
		{/if}
		<button
			type="button"
			aria-pressed={showOriginal}
			class="mt-2 mr-3 text-[13px] font-semibold text-primary hover:underline aria-pressed:underline"
			onclick={() => (showOriginal = !showOriginal)}
		>
			Show original language
		</button>
		{#if verseCount > COLLAPSE_THRESHOLD}
			<button
				type="button"
				class="mt-2 text-[13px] font-semibold text-primary hover:underline"
				onclick={() => (expanded = !expanded)}
			>
				{expanded ? 'Show less' : 'Show full passage'}
			</button>
		{/if}
		<p class="mt-2 text-[11px] text-muted-foreground">{translation} · {copyright}</p>
	{/if}
	{#if jump}
		<VerseJumpPrompt verseId={jump.verseId} left={jump.left} top={jump.top} onClose={closeJump} />
	{/if}
</div>
