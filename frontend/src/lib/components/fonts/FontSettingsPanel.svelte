<script lang="ts">
	import { onMount } from 'svelte';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import InfoIcon from '@lucide/svelte/icons/info';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import FontPicker from './FontPicker.svelte';
	import { parseCatalog, toChoice, type FontCatalogRow, type FontEntry } from '$lib/fonts/googleFonts';
	import { FONT_PAIRINGS, FONT_SLOT_INFO, FONT_SLOTS, type FontPairing } from '$lib/fonts/slots';
	import type { FontState, FontStore } from '$lib/fonts/store.svelte';

	let { store, onPeek }: { store: FontStore; onPeek?: () => void } = $props();

	// ~75 KB of font names: fetched only when this section opens, never on page load.
	let catalog = $state<FontEntry[] | null>(null);
	let loadFailed = $state(false);

	onMount(() => {
		import('$lib/fonts/google-fonts-catalog.json')
			.then((m) => (catalog = parseCatalog(m.default as FontCatalogRow[])))
			.catch(() => (loadFailed = true));
		// Leaving the section mid-browse must not strand a preview on the page.
		return () => store.endPreview();
	});

	function pairingState(pairing: FontPairing): FontState | null {
		if (!catalog) return null;
		const byFamily = new Map(catalog.map((e) => [e.family, e]));
		const state = {} as FontState;
		for (const slot of FONT_SLOTS) {
			const family = pairing.picks[slot];
			const entry = family ? byFamily.get(family) : null;
			if (family && !entry) return null; // a family Google retired: skip the pairing
			state[slot] = entry ? toChoice(entry) : null;
		}
		return state;
	}

	function isActive(pairing: FontPairing): boolean {
		return FONT_SLOTS.every((slot) => (store.state[slot]?.family ?? null) === pairing.picks[slot]);
	}
</script>

<div class="flex flex-col gap-6">
	<div class="sticky top-0 z-10 -mb-3 bg-background pb-3">
		<div class="flex items-start justify-between gap-3">
			<div>
				<h3 class="font-semibold text-base mb-1">Fonts</h3>
				<p class="text-sm text-muted-foreground">
					Pick any Google Font for each part of the app. Changes apply right away.
				</p>
			</div>
			{#if onPeek}
				<button
					type="button"
					onclick={onPeek}
					title="Hide Settings to see the whole page"
					class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
				>
					<EyeIcon class="size-4" />
					Peek
				</button>
			{/if}
		</div>
	</div>

	{#if loadFailed}
		<p class="text-sm text-destructive">Couldn't load the font list. Check your connection and reopen Settings.</p>
	{:else if !catalog}
		<p class="text-sm text-muted-foreground">Loading fonts…</p>
	{:else}
		<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Font pairings">
			<span class="mr-1 text-xs text-muted-foreground">Pairings:</span>
			{#each FONT_PAIRINGS as pairing (pairing.name)}
				{@const picks = pairingState(pairing)}
				{#if picks}
					<button
						type="button"
						aria-pressed={isActive(pairing)}
						title={pairing.name === 'Default'
							? "The app's own fonts"
							: FONT_SLOTS.map((s) => pairing.picks[s]).join(' / ')}
						onclick={() => store.setAll(picks)}
						class="rounded-full border px-2.5 py-0.5 text-xs {isActive(pairing)
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border text-muted-foreground hover:text-foreground'}"
					>
						{pairing.name}
					</button>
				{/if}
			{/each}
		</div>

		{#each FONT_SLOTS as slot (slot)}
			{@const info = FONT_SLOT_INFO[slot]}
			<section class="flex flex-col gap-1.5" aria-labelledby="font-{slot}-label">
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-1.5">
						<label id="font-{slot}-label" for="font-{slot}" class="text-sm font-medium">{info.label}</label>
						<span class="group relative inline-flex text-muted-foreground">
							<button
								type="button"
								class="rounded-full"
								aria-describedby="font-{slot}-tip"
								aria-label="About {info.label}"
							>
								<InfoIcon class="size-3.5" />
							</button>
							<span
								id="font-{slot}-tip"
								role="tooltip"
								class="pointer-events-none absolute top-full left-0 z-20 mt-2 w-64 rounded-md bg-foreground px-2.5 py-2 text-xs leading-snug text-background opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
							>
								<span class="font-semibold">Used for:</span>
								{info.usedFor}<br /><br />
								<span class="font-semibold">Tip:</span>
								{info.advice}
							</span>
						</span>
					</div>
					{#if store.state[slot]}
						<button
							type="button"
							onclick={() => store.set(slot, null)}
							class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
						>
							<RotateCcwIcon class="size-3.5" />
							Use default
						</button>
					{/if}
				</div>
				<FontPicker
					id="font-{slot}"
					{info}
					{catalog}
					value={store.state[slot]}
					onCommit={(choice) => store.set(slot, choice)}
					onPreview={(choice) => store.preview(slot, choice)}
					onPreviewEnd={() => store.endPreview()}
				/>
			</section>
		{/each}

		<p class="text-xs text-muted-foreground">Fonts load from Google Fonts. Your picks are saved on this device only.</p>
	{/if}
</div>
