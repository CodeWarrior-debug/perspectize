<script lang="ts">
	import { Input, Popover, PopoverContent, PopoverTrigger } from '#lib/components/shadcn/index.js';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { otherTypeOptionsWhenOne } from '#lib/utils/gridUrlState.js';
	import { scrollEdges, scrollFadeMask } from '#lib/utils/scrollFade.js';

	let {
		filters,
		onSelect,
	}: {
		filters: Record<string, string>;
		/** Receives the lowercased type value to show on its own (e.g. `movie`). */
		onSelect: (value: string) => void;
	} = $props();

	/** The searchable "All types" list appears once the row would be too long to scan by eye. */
	const SEARCH_THRESHOLD = 8;
	/** One arrow press scrolls this fraction of the visible width, so the last pill stays in view. */
	const PAGE_FRACTION = 0.8;

	const options = $derived(otherTypeOptionsWhenOne(filters));

	let scroller = $state<HTMLDivElement | null>(null);
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);
	const hasOverflow = $derived(canScrollLeft || canScrollRight);

	function measure() {
		if (!scroller) return;
		const edges = scrollEdges(scroller);
		canScrollLeft = edges.canScrollLeft;
		canScrollRight = edges.canScrollRight;
	}

	function page(direction: -1 | 1) {
		if (!scroller) return;
		scroller.scrollBy({ left: direction * scroller.clientWidth * PAGE_FRACTION, behavior: 'smooth' });
	}

	// `options` is a fresh array whenever the page re-derives its filters, even when the same types
	// are listed, so the effect below keys on this string, which only changes with the set itself.
	const optionKey = $derived(options.map((option) => option.value).join(','));

	// Re-measure when the row is resized or the set of pills changes. A new set of pills (the user
	// picked a type) starts from the first pill, so the type that just left the chip is in view.
	$effect(() => {
		if (!scroller) return;
		void optionKey;
		scroller.scrollLeft = 0;
		measure();
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(measure);
		observer.observe(scroller);
		return () => observer.disconnect();
	});

	// Fade the clipped ends so a cut-off pill reads as "more this way", not as a glitch.
	const fadeMask = $derived(scrollFadeMask(canScrollLeft, canScrollRight));

	let search = $state('');
	let moreOpen = $state(false);
	const matches = $derived(
		options.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase())),
	);

	function pick(value: string) {
		moreOpen = false;
		onSelect(value);
	}

	$effect(() => {
		if (!moreOpen) search = '';
	});
</script>

{#if options.length > 0}
	<div class="flex items-center gap-2 min-w-0 max-w-full">
		<span class="shrink-0 text-xs text-muted-foreground">Other types:</span>

		<!-- The arrows sit beside the row, not over it, so no pill ever runs underneath one. They show
		     whenever the row overflows; the one at the end of the row is dimmed and disabled, so the
		     row doesn't shift as you scroll. -->
		<div class="flex min-w-0 flex-1 items-center gap-1">
			{#if hasOverflow}
				<button
					type="button"
					aria-label="Scroll types left"
					disabled={!canScrollLeft}
					class="grid size-6 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
					onclick={() => page(-1)}
				>
					<ChevronLeftIcon class="size-3.5" />
				</button>
			{/if}

			<div
				bind:this={scroller}
				data-testid="type-pills-scroller"
				class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scroll-smooth snap-x snap-proximity py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				style:mask-image={fadeMask}
				style:-webkit-mask-image={fadeMask}
				onscroll={measure}
			>
				{#each options as option (option.value)}
					<button
						type="button"
						aria-label="Show only {option.label}"
						class="shrink-0 snap-start whitespace-nowrap inline-flex items-center px-2.5 py-1 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
						onclick={() => onSelect(option.value)}
					>
						{option.label}
					</button>
				{/each}
			</div>

			{#if hasOverflow}
				<button
					type="button"
					aria-label="Scroll types right"
					disabled={!canScrollRight}
					class="grid size-6 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
					onclick={() => page(1)}
				>
					<ChevronRightIcon class="size-3.5" />
				</button>
			{/if}
		</div>

		{#if options.length >= SEARCH_THRESHOLD}
			<Popover bind:open={moreOpen}>
				<PopoverTrigger
					class="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-border text-foreground hover:bg-muted transition-colors"
					aria-label="Search all types"
				>
					All types
					<ChevronDownIcon class="size-3.5 text-muted-foreground" />
				</PopoverTrigger>
				<PopoverContent align="end" class="w-60 p-2">
					<Input
						type="text"
						placeholder="Find a type…"
						aria-label="Find a type"
						value={search}
						oninput={(e) => (search = e.currentTarget.value)}
						class="h-8 text-sm"
					/>
					<ul class="mt-2 max-h-64 overflow-y-auto">
						{#each matches as option (option.value)}
							<li>
								<button
									type="button"
									class="w-full text-left px-2 py-1.5 rounded-sm text-sm hover:bg-accent"
									onclick={() => pick(option.value)}
								>
									{option.label}
								</button>
							</li>
						{:else}
							<li class="px-2 py-1.5 text-sm text-muted-foreground">No types match.</li>
						{/each}
					</ul>
				</PopoverContent>
			</Popover>
		{/if}
	</div>
{/if}
