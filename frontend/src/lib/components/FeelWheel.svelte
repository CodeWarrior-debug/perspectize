<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import SearchIcon from '@lucide/svelte/icons/search';
	import RatingInput from '$lib/components/RatingInput.svelte';
	import { FEEL_WHEEL, FAMILY_ORDER, searchExtendedFeelings, type ExtendedFeeling } from '$lib/data/feelings';

	export interface Feeling {
		emoji: string;
		label?: string | null;
		intensity: number;
		note?: string | null;
	}

	const MAX_FEELINGS = 10;

	let {
		value = $bindable<Feeling[]>([]),
	}: {
		value?: Feeling[];
	} = $props();

	let searchQuery = $state('');
	let searchResults = $derived<ExtendedFeeling[]>(searchQuery.trim() ? searchExtendedFeelings(searchQuery) : []);

	// Group search results by family so the list reads as a browsed picker,
	// not a flat wall of emoji.
	let groupedResults = $derived(
		FAMILY_ORDER.map(({ family, header }) => ({
			header,
			items: searchResults.filter((f) => f.family === family),
		})).filter((g) => g.items.length > 0),
	);

	const atCap = $derived(value.length >= MAX_FEELINGS);

	function isSelected(emoji: string): boolean {
		return value.some((f) => f.emoji === emoji);
	}

	function addFeeling(emoji: string, label: string) {
		if (atCap || isSelected(emoji)) return;
		value = [...value, { emoji, label, intensity: 5000, note: null }];
	}

	function removeFeeling(emoji: string) {
		value = value.filter((f) => f.emoji !== emoji);
	}

	function updateIntensity(emoji: string, intensity: number | null) {
		value = value.map((f) => (f.emoji === emoji ? { ...f, intensity: intensity ?? 5000 } : f));
	}

	function updateNote(emoji: string, note: string) {
		value = value.map((f) => (f.emoji === emoji ? { ...f, note: note || null } : f));
	}

	// Radius/center are in px for a fixed-size wheel — no need for
	// resize-driven recalculation since the wheel doesn't stretch.
	const RADIUS = 96;
	const CENTER = 120;

	function wheelPosition(angleDeg: number): string {
		const rad = ((angleDeg - 90) * Math.PI) / 180; // -90 so 0deg = top
		const x = CENTER + RADIUS * Math.cos(rad);
		const y = CENTER + RADIUS * Math.sin(rad);
		return `left: ${x}px; top: ${y}px;`;
	}
</script>

<div class="flex flex-col gap-4">
	<!-- The wheel itself: 20 emoji positioned by angle, native text glyphs only -->
	<div class="relative mx-auto" style="width: 240px; height: 240px;">
		{#each FEEL_WHEEL as f (f.angle)}
			{@const selected = isSelected(f.emoji)}
			<button
				type="button"
				class="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 transition-transform"
				class:opacity-40={selected}
				class:scale-90={selected}
				style={wheelPosition(f.angle)}
				disabled={atCap && !selected}
				onclick={() => (selected ? removeFeeling(f.emoji) : addFeeling(f.emoji, f.label))}
				aria-pressed={selected}
				aria-label={f.label}
				title={f.label}
			>
				<span class="text-2xl leading-none">{f.emoji}</span>
			</button>
		{/each}
	</div>

	<!-- Search for anything beyond the 20 on the wheel -->
	<div class="relative">
		<SearchIcon class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
		<input
			type="text"
			bind:value={searchQuery}
			placeholder="Search more feelings — e.g. nervous"
			disabled={atCap}
			class="w-full rounded-md border border-border bg-white pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
		/>
	</div>

	{#if groupedResults.length > 0}
		<div class="max-h-40 overflow-y-auto rounded-md border border-border">
			{#each groupedResults as group (group.header)}
				<div class="px-2 py-1.5">
					<div class="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground px-1">
						{group.header}
					</div>
					<div class="flex flex-wrap gap-1 mt-1">
						{#each group.items as item (item.emoji)}
							<button
								type="button"
								class="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-sm hover:bg-muted disabled:opacity-40"
								disabled={atCap || isSelected(item.emoji)}
								onclick={() => {
									addFeeling(item.emoji, item.label);
									searchQuery = '';
								}}
							>
								<span>{item.emoji}</span>
								<span class="text-xs text-muted-foreground">{item.label}</span>
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if atCap}
		<p class="text-xs text-muted-foreground text-center">Up to {MAX_FEELINGS} feelings per perspective</p>
	{/if}

	<!-- Selected feelings: intensity + optional note -->
	{#if value.length > 0}
		<div class="flex flex-col gap-2">
			{#each value as f (f.emoji)}
				<div class="rounded-md border border-border p-2.5 flex flex-col gap-2">
					<div class="flex items-center justify-between gap-2">
						<span class="flex items-center gap-1.5 text-sm font-medium">
							<span class="text-lg leading-none">{f.emoji}</span>
							{f.label}
						</span>
						<button
							type="button"
							onclick={() => removeFeeling(f.emoji)}
							class="text-muted-foreground hover:opacity-70"
							aria-label="Remove {f.label}"
						>
							<XIcon class="size-3.5" />
						</button>
					</div>
					<RatingInput
						label="Intensity"
						name="feeling-{f.emoji}-intensity"
						bind:value={() => f.intensity, (v) => updateIntensity(f.emoji, v)}
						compact
						trackWidth={110}
					/>
					<textarea
						value={f.note ?? ''}
						oninput={(e) => updateNote(f.emoji, e.currentTarget.value)}
						placeholder="Why / nuance / observations…"
						rows={2}
						class="w-full rounded-md border border-border bg-white px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
					></textarea>
				</div>
			{/each}
		</div>
	{/if}
</div>
