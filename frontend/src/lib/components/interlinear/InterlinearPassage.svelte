<!-- frontend/src/lib/components/interlinear/InterlinearPassage.svelte -->
<script lang="ts">
	import type { InterlinearVerse, InterlinearWord, VerseText } from '$lib/queries/bible';
	import {
		activeKey,
		connectorLine,
		englishOrderWords,
		formatStrongs,
		initialInterlinearState,
		placePopover,
		primaryWordKey,
		reduceInterlinear,
		wordKey,
		type InterlinearEvent,
	} from '$lib/utils/interlinear';
	import WordPopover from './WordPopover.svelte';

	let { verses, interlinear }: { verses: VerseText[]; interlinear: InterlinearVerse[] } = $props();

	const POPOVER_WIDTH = 260;

	const byVerse = $derived(new Map(interlinear.map((v) => [v.verseId, v])));
	// Verses that have data, in passage order; the chips row shows each verse's words in English (translated) order.
	const chipVerses = $derived(verses.map((v) => byVerse.get(v.verseId)).filter((v): v is InterlinearVerse => !!v));
	// The active word resolves only against verses that are on screen (rendered AND have data).
	const visibleByVerse = $derived(new Map(chipVerses.map((v) => [v.verseId, v])));

	let ui = $state(initialInterlinearState); // not named `state`: that collides with the $state rune
	let container = $state<HTMLDivElement | undefined>();
	let tick = $state(0); // bumped on resize so geometry is recomputed

	function send(event: InterlinearEvent) {
		ui = reduceInterlinear(ui, event);
	}

	const active = $derived(activeKey(ui));

	function lookup(key: string | null): { verse: InterlinearVerse; word: InterlinearWord } | null {
		if (!key) return null;
		const [verseId, wordId] = key.split(':').map(Number);
		const verse = visibleByVerse.get(verseId);
		const word = verse?.words[wordId];
		return verse && word ? { verse, word } : null;
	}
	const activeWord = $derived(lookup(active));
	const activeEnglish = $derived(
		activeWord && activeWord.word.segment !== null
			? (activeWord.verse.segments[activeWord.word.segment]?.text ?? null)
			: null,
	);

	// A pinned/hovered key whose verse is no longer visible (e.g. the passage collapsed) is dropped so
	// it cannot resurface when the verse comes back. Reads derived values, writes only `ui`.
	$effect(() => {
		if (active && !activeWord) send({ type: 'outside' });
	});

	let popover = $state<{ left: number; top: number } | null>(null);
	let line = $state<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

	// Geometry is measured after the active word changes (or the window resizes). It reads
	// `active`/`tick`/`container` synchronously and only writes popover/line, so it cannot loop.
	$effect(() => {
		const key = active;
		void tick;
		const c = container;
		const found = lookup(key);
		if (!key || !c || !found) {
			popover = null;
			line = null;
			return;
		}
		const cBox = c.getBoundingClientRect();
		const chip = c.querySelector<HTMLElement>(`[data-chip="${key}"]`);
		popover = chip ? placePopover(chip.getBoundingClientRect(), cBox, POPOVER_WIDTH) : null;
		const seg = found.word.segment;
		const phrase = seg !== null ? c.querySelector<HTMLElement>(`[data-segment="${found.verse.verseId}:${seg}"]`) : null;
		line = chip && phrase ? connectorLine(phrase.getBoundingClientRect(), chip.getBoundingClientRect(), cBox) : null;
	});

	// Delegated handlers: one listener per container, not one per phrase or chip.
	function keyFromTarget(e: Event): string | null {
		const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-segment],[data-chip]');
		if (!el) return null;
		const chip = el.getAttribute('data-chip');
		if (chip) return chip;
		const [verseId, index] = (el.getAttribute('data-segment') as string).split(':').map(Number);
		const verse = byVerse.get(verseId);
		return verse ? primaryWordKey(verse, index) : null;
	}
	const onOver = (e: Event) => {
		const k = keyFromTarget(e);
		if (k) send({ type: 'enter', key: k });
	};
	const onOut = (e: Event) => {
		const k = keyFromTarget(e);
		if (k) send({ type: 'leave', key: k });
	};
	const onClick = (e: Event) => {
		const k = keyFromTarget(e);
		if (k) send({ type: 'click', key: k });
	};
	const onDblClick = (e: Event) => {
		if (keyFromTarget(e)) send({ type: 'dblclick' });
	};

	// Escape is handled in the CAPTURE phase so it runs before the surrounding dialog's bubble-phase
	// escape layer; the key is only swallowed while a popover is actually showing, so a second
	// Escape still reaches (and closes) the dialog. State is read inside the handler, not the effect.
	$effect(() => {
		const onKeydown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			if (!(activeWord && popover)) return;
			e.stopPropagation();
			send({ type: 'escape' });
		};
		document.addEventListener('keydown', onKeydown, { capture: true });
		return () => document.removeEventListener('keydown', onKeydown, { capture: true });
	});

	function onDocumentPointerDown(e: Event) {
		if (ui.pinned && container && !container.contains(e.target as Node)) send({ type: 'outside' });
	}
</script>

<svelte:document onpointerdown={onDocumentPointerDown} />
<svelte:window onresize={() => (tick += 1)} />

<div bind:this={container} class="relative">
	<!-- Delegated handlers on the container: keyboard activation happens on the inner <button>s, whose click bubbles here. -->
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div
		class="font-[family-name:var(--font-family-serif)] text-[15px] leading-relaxed text-foreground"
		onmouseover={onOver}
		onmouseout={onOut}
		onfocusin={onOver}
		onfocusout={onOut}
		onclick={onClick}
		ondblclick={onDblClick}
	>
		{#each verses as v (v.verseId)}
			{@const iv = byVerse.get(v.verseId)}
			{#if iv}
				<span
					>{#each iv.segments as seg, i (i)}{#if seg.spaceBefore}{' '}{/if}{#if iv.words.some((w) => w.segment === i)}<button
								type="button"
								data-segment="{iv.verseId}:{i}"
								aria-describedby={active !== null && active === primaryWordKey(iv, i)
									? 'interlinear-popover'
									: undefined}
								class="cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-primary underline decoration-dotted underline-offset-4"
								>{seg.text}</button
							>{:else}<span>{seg.text}</span>{/if}{/each}{' '}</span
				>
			{:else if v.text}
				<span><sup class="mr-0.5 ml-0.5 text-[10px] text-muted-foreground">{v.verse}</sup>{v.text}{' '}</span>
			{/if}
		{/each}
	</div>

	{#if chipVerses.length}
		<div class="mt-3 flex flex-col gap-2 border-t border-dashed border-border pt-3.5">
			<div class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Original language</div>
			<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
			<div
				class="flex flex-wrap gap-x-1.5 gap-y-2"
				onmouseover={onOver}
				onmouseout={onOut}
				onfocusin={onOver}
				onfocusout={onOut}
				onclick={onClick}
				ondblclick={onDblClick}
			>
				{#each chipVerses as iv (iv.verseId)}
					<span class="self-center text-[10px] text-muted-foreground">{iv.verse}</span>
					{#each englishOrderWords(iv) as w (w.id)}
						<button
							type="button"
							data-chip={wordKey(iv.verseId, w.id)}
							aria-describedby={active === wordKey(iv.verseId, w.id) ? 'interlinear-popover' : undefined}
							class="inline-flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border border-border bg-muted/40 px-2 py-1"
						>
							<span dir={w.language === 'heb' ? 'rtl' : 'ltr'} class="text-base text-foreground">{w.source}</span>
							<span class="text-[10px] text-muted-foreground italic">{w.translit}</span>
							<span class="rounded bg-muted px-1 font-mono text-[10px] font-bold text-foreground"
								>{formatStrongs(w.strongs)}</span
							>
						</button>
					{/each}
				{/each}
			</div>
		</div>
	{/if}

	{#if activeWord && popover}
		<WordPopover
			id="interlinear-popover"
			word={activeWord.word}
			english={activeEnglish}
			left={popover.left}
			top={popover.top}
		/>
	{/if}

	{#if line}
		<svg
			data-testid="connector"
			class="pointer-events-none absolute inset-0 z-[25] h-full w-full overflow-visible"
			aria-hidden="true"
		>
			<line
				x1={line.x1}
				y1={line.y1}
				x2={line.x2}
				y2={line.y2}
				stroke="currentColor"
				class="text-primary"
				stroke-width="1.5"
				stroke-dasharray="4 3"
			/>
			<circle cx={line.x1} cy={line.y1} r="3" fill="currentColor" class="text-primary" />
			<circle cx={line.x2} cy={line.y2} r="3" fill="currentColor" class="text-primary" />
		</svg>
	{/if}
</div>
