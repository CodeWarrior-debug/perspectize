<script lang="ts">
	import { Input, Popover, PopoverContent, PopoverTrigger } from '#lib/components/shadcn/index.js';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { otherTypeOptionsWhenOne } from '#lib/utils/gridUrlState.js';

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
	/** Distance in px from an end at which that end counts as reached (sub-pixel scroll positions). */
	const EDGE_SLACK = 2;
	/** One arrow press scrolls this fraction of the visible width, so the last pill stays in view. */
	const PAGE_FRACTION = 0.8;

	const options = $derived(otherTypeOptionsWhenOne(filters));

	let scroller = $state<HTMLDivElement | null>(null);
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);

	function measure() {
		if (!scroller) return;
		const { scrollLeft, scrollWidth, clientWidth } = scroller;
		canScrollLeft = scrollLeft > EDGE_SLACK;
		canScrollRight = scrollLeft + clientWidth < scrollWidth - EDGE_SLACK;
	}

	function page(direction: -1 | 1) {
		if (!scroller) return;
		scroller.scrollBy({ left: direction * scroller.clientWidth * PAGE_FRACTION, behavior: 'smooth' });
	}

	// Re-measure when the row is resized or the set of pills changes.
	$effect(() => {
		if (!scroller) return;
		void options;
		measure();
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(measure);
		observer.observe(scroller);
		return () => observer.disconnect();
	});

	// Fade the clipped ends so a cut-off pill reads as "more this way", not as a glitch.
	const fadeMask = $derived(
		`linear-gradient(to right, ${canScrollLeft ? 'transparent 0, black 2.5rem' : 'black 0, black 0'}, ${
			canScrollRight ? 'black calc(100% - 2.5rem), transparent 100%' : 'black 100%, black 100%'
		})`,
	);

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

		<div class="relative min-w-0 flex-1">
			<div
				bind:this={scroller}
				data-testid="type-pills-scroller"
				class="flex items-center gap-2 overflow-x-auto scroll-smooth snap-x snap-proximity py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

			{#if canScrollLeft}
				<button
					type="button"
					aria-label="Scroll types left"
					class="absolute left-0 top-1/2 -translate-y-1/2 grid size-6 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground hover:bg-muted transition-colors"
					onclick={() => page(-1)}
				>
					<ChevronLeftIcon class="size-3.5" />
				</button>
			{/if}
			{#if canScrollRight}
				<button
					type="button"
					aria-label="Scroll types right"
					class="absolute right-0 top-1/2 -translate-y-1/2 grid size-6 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground hover:bg-muted transition-colors"
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
