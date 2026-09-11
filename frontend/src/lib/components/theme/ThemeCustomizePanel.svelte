<script lang="ts">
	import { Button, Input, Label } from '$lib/components/shadcn';
	import ColorWheel from './ColorWheel.svelte';
	import { THEME_PRESETS, THEME_PRESET_TOKENS } from '$lib/theme/presets';
	import { downloadThemeCss } from '$lib/theme/export';
	import { deriveTheme, type BaseThemeTokens } from '$lib/theme/derive';
	import { formatColorForUnit, parseColorInput, type ColorUnit } from '$lib/theme/format';
	import type { ThemeStore } from '$lib/theme/store.svelte';

	let { store }: { store: ThemeStore } = $props();

	const BASE_TOKEN_ROWS: { key: keyof BaseThemeTokens; label: string }[] = [
		{ key: 'primary', label: 'Primary' },
		{ key: 'primaryHover', label: 'Primary hover' },
		{ key: 'secondary', label: 'Secondary' },
		{ key: 'accent', label: 'Accent' },
		{ key: 'background', label: 'Background' },
		{ key: 'foreground', label: 'Foreground' },
		{ key: 'border', label: 'Border' },
		{ key: 'destructive', label: 'Destructive' },
	];

	let unit = $state<ColorUnit>('oklch');

	let customizing = $state(false);
	let editTokens = $state<BaseThemeTokens>(structuredClone(THEME_PRESETS[0].base));
	let openRow = $state<keyof BaseThemeTokens | null>(null);
	let saveName = $state('');
	let showSaveInput = $state(false);

	// Draft text for each row's direct-input field, keyed by token. While a
	// row is focused, its displayed value comes ONLY from this draft, never
	// from re-formatting editTokens — otherwise every valid keystroke (e.g.
	// finishing a hex pair, or a digit that completes a parseable oklch
	// number) round-trips through updateToken -> formatColorForUnit and
	// rewrites the input's value mid-type, which snaps the cursor to the end
	// and makes typing feel like it's fighting back. The draft is seeded from
	// the formatted value on focus and dropped on blur, so once editing ends
	// the field falls back to reflecting editTokens/unit again (including
	// picking up changes made via the color wheel).
	let drafts = $state<Partial<Record<keyof BaseThemeTokens, string>>>({});
	let invalidRows = $state<Partial<Record<keyof BaseThemeTokens, boolean>>>({});

	function colorInputValue(key: keyof BaseThemeTokens): string {
		return drafts[key] ?? formatColorForUnit(editTokens[key], unit);
	}

	function handleColorFocus(key: keyof BaseThemeTokens) {
		drafts = { ...drafts, [key]: formatColorForUnit(editTokens[key], unit) };
	}

	function handleColorInput(key: keyof BaseThemeTokens, text: string) {
		drafts = { ...drafts, [key]: text };
		const hex = parseColorInput(text);
		if (hex) {
			invalidRows = { ...invalidRows, [key]: false };
			updateToken(key, hex);
		} else {
			invalidRows = { ...invalidRows, [key]: true };
		}
	}

	function handleColorBlur(key: keyof BaseThemeTokens) {
		drafts = { ...drafts, [key]: undefined };
		invalidRows = { ...invalidRows, [key]: false };
	}

	function startCustomizing() {
		const active = store.activeFullTokens();
		editTokens = {
			primary: active.primary,
			primaryHover: active.primaryHover,
			secondary: active.secondary,
			accent: active.accent,
			background: active.background,
			foreground: active.foreground,
			border: active.border,
			destructive: active.destructive,
		};
		customizing = true;
	}

	function updateToken(key: keyof BaseThemeTokens, hex: string) {
		editTokens = { ...editTokens, [key]: hex };
		store.previewCustomTokens(editTokens);
	}

	function saveTheme() {
		if (!saveName.trim()) return;
		store.saveCustomTheme(saveName.trim(), editTokens);
		saveName = '';
		showSaveInput = false;
	}

	function exportTheme() {
		const name = saveName.trim() || 'my-theme';
		const tokens = deriveTheme(editTokens);
		downloadThemeCss(name, tokens);
	}

	function deleteCustom(id: string) {
		store.deleteCustomTheme(id);
	}
</script>

<div class="flex flex-col gap-6">
	<div>
		<h3 class="font-semibold text-base mb-1">Customize Theme</h3>
		<p class="text-sm text-muted-foreground">Pick a preset, or fully customize your own colors.</p>
	</div>

	<div class="grid grid-cols-2 sm:grid-cols-3 gap-3" aria-label="Theme presets">
		{#each THEME_PRESETS as preset (preset.id)}
			<button
				type="button"
				onclick={() => store.selectPreset(preset.id)}
				class="text-left rounded-md border p-3 transition-colors {store.state.activeThemeId === preset.id
					? 'border-primary ring-1 ring-primary'
					: 'border-border hover:border-primary/50'}"
			>
				<div class="flex gap-1 mb-2">
					{#each [THEME_PRESET_TOKENS[preset.id].primary, THEME_PRESET_TOKENS[preset.id].secondary, THEME_PRESET_TOKENS[preset.id].accent, THEME_PRESET_TOKENS[preset.id].background] as swatch}
						<span class="size-4 rounded-full border border-black/10" style="background:{swatch}"></span>
					{/each}
				</div>
				<div class="text-sm font-medium">{preset.name}</div>
				<div class="text-xs text-muted-foreground">{preset.mood}</div>
			</button>
		{/each}

		{#each store.state.customThemes as custom (custom.id)}
			<div
				class="relative text-left rounded-md border p-3 {store.state.activeThemeId === custom.id
					? 'border-primary ring-1 ring-primary'
					: 'border-border'}"
			>
				<button type="button" onclick={() => store.selectCustom(custom.id)} class="w-full text-left">
					<div class="flex gap-1 mb-2">
						<span class="size-4 rounded-full border border-black/10" style="background:{custom.tokens.primary}"></span>
						<span class="size-4 rounded-full border border-black/10" style="background:{custom.tokens.secondary}"
						></span>
					</div>
					<div class="text-sm font-medium">{custom.name}</div>
					<div class="text-xs text-muted-foreground">Custom</div>
				</button>
				<button
					type="button"
					aria-label="Delete {custom.name}"
					class="absolute top-1 right-1 text-xs text-muted-foreground hover:text-destructive"
					onclick={() => deleteCustom(custom.id)}
				>
					✕
				</button>
			</div>
		{/each}
	</div>

	{#if !customizing}
		<Button variant="outline" onclick={startCustomizing}>Customize</Button>
	{:else}
		<div class="flex flex-col gap-4 border-t border-border pt-4">
			<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<span class="text-sm font-medium">Custom colors</span>
				<div class="flex gap-1 text-xs">
					{#each ['oklch', 'hex', 'rgb'] as u}
						<button
							type="button"
							class="px-2 py-1 rounded {unit === u ? 'bg-primary text-primary-foreground' : 'bg-muted'}"
							onclick={() => (unit = u as ColorUnit)}
						>
							{u.toUpperCase()}
						</button>
					{/each}
				</div>
			</div>

			{#each BASE_TOKEN_ROWS as row (row.key)}
				<div class="flex items-center gap-3">
					<button
						type="button"
						class="size-6 rounded-full border border-black/10 shrink-0"
						style="background:{editTokens[row.key]}"
						aria-label="Edit {row.label}"
						onclick={() => (openRow = openRow === row.key ? null : row.key)}
					></button>
					<span class="text-sm flex-1">{row.label}</span>
					<Input
						value={colorInputValue(row.key)}
						onfocus={() => handleColorFocus(row.key)}
						oninput={(e) => handleColorInput(row.key, e.currentTarget.value)}
						onblur={() => handleColorBlur(row.key)}
						aria-label="{row.label} value ({unit})"
						aria-invalid={invalidRows[row.key] === true}
						class="h-7 w-36 shrink-0 font-mono text-xs"
					/>
				</div>
				{#if openRow === row.key}
					<div class="pl-9">
						<ColorWheel value={editTokens[row.key]} onChange={(hex) => updateToken(row.key, hex)} />
					</div>
				{/if}
			{/each}

			<div class="flex flex-col gap-2 border-t border-border pt-4">
				{#if showSaveInput}
					<div class="flex gap-2">
						<Label for="theme-name" class="sr-only">Theme name</Label>
						<Input id="theme-name" bind:value={saveName} placeholder="Name your theme" />
						<Button onclick={saveTheme}>Save</Button>
					</div>
				{:else}
					<Button variant="outline" onclick={() => (showSaveInput = true)}>Save as...</Button>
				{/if}
				<Button variant="outline" onclick={exportTheme}>Export CSS</Button>
			</div>
		</div>
	{/if}
</div>
