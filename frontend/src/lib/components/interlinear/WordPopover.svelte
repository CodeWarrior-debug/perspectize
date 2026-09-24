<script lang="ts">
	import type { InterlinearWord } from '$lib/queries/bible';
	import { formatStrongs } from '$lib/utils/interlinear';

	let {
		word,
		english,
		left,
		top,
		id,
	}: { word: InterlinearWord; english: string | null; left: number; top: number; id: string } = $props();

	const isHebrew = $derived(word.language === 'heb');
</script>

<div
	{id}
	role="tooltip"
	class="pointer-events-none absolute z-30 flex w-[260px] max-w-full flex-col gap-2.5 rounded-[14px] border border-border bg-popover p-4 text-left shadow-lg"
	style="left: {left}px; top: {top}px"
>
	<div class="flex items-center justify-between">
		<span class="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold text-foreground"
			>{formatStrongs(word.strongs)}</span
		>
		<span class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
			>{isHebrew ? 'Hebrew' : 'Greek'}</span
		>
	</div>
	<div class="flex flex-col gap-0.5">
		<div dir={isHebrew ? 'rtl' : 'ltr'} class="font-[family-name:var(--font-family-serif)] text-2xl text-foreground">
			{word.source}
		</div>
		<div class="text-[13px] text-muted-foreground italic">{word.translit}</div>
	</div>
	{#if word.gloss}
		<div class="h-px bg-border"></div>
		<div data-testid="popover-gloss" class="text-[13px] leading-relaxed text-foreground">{word.gloss}</div>
	{/if}
	{#if english}
		<div class="text-[12px] text-muted-foreground">Rendered here as "{english}"</div>
	{/if}
	{#if word.parsing}
		<div class="text-[11px] break-words whitespace-normal text-muted-foreground">{word.parsing}</div>
	{/if}
</div>
