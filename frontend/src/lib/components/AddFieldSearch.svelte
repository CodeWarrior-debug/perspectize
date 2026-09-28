<script lang="ts" module>
	/**
	 * TODO: Backend integration needed for:
	 * - Persisting custom field definitions
	 * - Loading user's custom fields from API
	 * - Syncing available fields with backend schema
	 */
	export type FieldDef = {
		key: string;
		label: string;
		kind: string;
		existing: boolean;
		desc?: string;
		custom?: boolean;
	};
</script>

<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import SearchIcon from '@lucide/svelte/icons/search';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { STANDARD_DIMENSIONS } from '$lib/utils/comparePerspectives';

	/** Search-box description shown for each standard dimension, keyed by STANDARD_DIMENSIONS' key. */
	const STANDARD_DIMENSION_DESCRIPTIONS: Record<(typeof STANDARD_DIMENSIONS)[number]['key'], string> = {
		quality: 'How well made is this?',
		agreement: 'Do you agree with it?',
		importance: 'How much does this matter?',
		confidence: 'How sure are you?',
	};

	const AVAILABLE_FIELDS: FieldDef[] = [
		// The 4 core dimensions read from STANDARD_DIMENSIONS (comparePerspectives.ts) --
		// the single source of truth also used by PerspectivePopover's DEFAULT_FIELDS and
		// Compare's getFieldLabel, so a renamed/relabeled dimension can't drift between
		// them (see the UI gap audit, gap #17). Only the descriptions are local to this
		// search box.
		...STANDARD_DIMENSIONS.map((d) => ({
			key: d.key,
			label: d.label,
			kind: 'rating' as const,
			existing: true,
			desc: STANDARD_DIMENSION_DESCRIPTIONS[d.key],
		})),
		{ key: 'originality', label: 'Originality', kind: 'rating', existing: false, desc: 'How fresh is the take?' },
		{ key: 'clarity', label: 'Clarity', kind: 'rating', existing: false, desc: 'Is it easy to follow?' },
		{ key: 'depth', label: 'Depth', kind: 'rating', existing: false, desc: 'How deep does it go?' },
		{ key: 'entertainment', label: 'Entertainment', kind: 'rating', existing: false, desc: 'How fun was it?' },
		{ key: 'rigor', label: 'Rigor', kind: 'rating', existing: false, desc: 'Is it well-argued?' },
		{ key: 'relevance', label: 'Relevance', kind: 'rating', existing: false, desc: 'Does it matter now?' },
		{ key: 'bias', label: 'Bias', kind: 'rating', existing: false, desc: 'How slanted is it?' },
		{
			key: 'actionability',
			label: 'Actionability',
			kind: 'rating',
			existing: false,
			desc: 'Can you do something with this?',
		},
	];

	let {
		addedKeys,
		onAdd,
		placeholder = 'Add a field — e.g. clarity',
		dense = false,
	}: {
		addedKeys: string[];
		onAdd: (field: FieldDef) => void;
		placeholder?: string;
		dense?: boolean;
	} = $props();

	let query = $state('');
	let isOpen = $state(false);
	let isFocused = $state(false);
	let wrapperEl: HTMLDivElement;

	const filtered = $derived(() => {
		const needle = query.trim().toLowerCase();
		const available = AVAILABLE_FIELDS.filter((f) => !addedKeys.includes(f.key));
		if (!needle) return available.slice(0, 8);
		return available.filter((f) => f.label.toLowerCase().includes(needle) || f.key.includes(needle)).slice(0, 8);
	});

	const canCreateCustom = $derived(() => {
		const trimmed = query.trim();
		return trimmed.length > 0 && !filtered().some((f) => f.label.toLowerCase() === trimmed.toLowerCase());
	});

	function handleClickOutside(e: MouseEvent) {
		if (wrapperEl && !wrapperEl.contains(e.target as Node)) {
			isOpen = false;
		}
	}

	function addExisting(field: FieldDef) {
		onAdd(field);
		query = '';
		isOpen = false;
	}

	function addCustom() {
		const name = query.trim();
		const key = `custom:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
		const field: FieldDef = { key, label: name, kind: 'rating', existing: false, custom: true };
		onAdd(field);
		query = '';
		isOpen = false;
	}

	$effect(() => {
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	});
</script>

<div bind:this={wrapperEl} class="relative">
	<!-- Search input -->
	<div
		class="flex items-center gap-2 px-3 border rounded-lg bg-background transition-shadow"
		class:h-[34px]={dense}
		class:h-10={!dense}
		style="border-color: {isFocused ? 'var(--color-ring)' : 'var(--color-input)'}; box-shadow: {isFocused
			? '0 0 0 3px color-mix(in srgb, var(--color-ring) 15%, transparent)'
			: 'none'};"
	>
		<SearchIcon class="size-3.5 text-muted-foreground flex-shrink-0" />
		<input
			type="text"
			bind:value={query}
			oninput={() => {
				isOpen = true;
			}}
			onfocus={() => {
				isOpen = true;
				isFocused = true;
			}}
			onblur={() => {
				isFocused = false;
			}}
			{placeholder}
			class="flex-1 border-none outline-none bg-transparent font-sans text-sm text-foreground min-w-0"
		/>
		{#if query}
			<button
				type="button"
				onclick={() => {
					query = '';
				}}
				class="border-none bg-transparent text-muted-foreground cursor-pointer p-0.5"
				aria-label="Clear"
			>
				<XIcon class="size-3" />
			</button>
		{/if}
	</div>

	<!-- Dropdown -->
	{#if isOpen && (filtered().length > 0 || canCreateCustom())}
		<div
			class="absolute top-[calc(100%+6px)] left-0 right-0 bg-popover border border-border rounded-[10px] shadow-lg p-1 z-50 max-h-[260px] overflow-y-auto"
		>
			{#each filtered() as field (field.key)}
				<button
					type="button"
					onmousedown={(e) => e.preventDefault()}
					onclick={() => addExisting(field)}
					class="flex items-center justify-between w-full px-2.5 py-2 rounded-md bg-transparent border-none cursor-pointer text-left hover:bg-accent transition-colors"
				>
					<div class="flex flex-col gap-0.5">
						<span class="font-sans font-medium text-[13px] text-foreground">{field.label}</span>
						{#if field.desc}
							<span class="font-serif text-xs text-muted-foreground">{field.desc}</span>
						{/if}
					</div>
					<span
						class="font-sans text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ml-2"
						style="background: {field.existing
							? 'color-mix(in srgb, var(--color-primary) 10%, transparent)'
							: 'var(--color-muted)'}; color: {field.existing
							? 'var(--color-primary)'
							: 'var(--color-muted-foreground)'};"
					>
						{field.existing ? 'existing' : 'suggested'}
					</span>
				</button>
			{/each}

			{#if canCreateCustom()}
				<button
					type="button"
					onmousedown={(e) => e.preventDefault()}
					onclick={addCustom}
					class="flex items-center gap-2 w-full px-2.5 py-2 rounded-md bg-transparent border-none cursor-pointer text-left hover:bg-accent transition-colors"
					class:border-t={filtered().length > 0}
					class:border-border={filtered().length > 0}
					class:mt-1={filtered().length > 0}
					class:pt-2.5={filtered().length > 0}
				>
					<PlusIcon class="size-3.5 text-primary flex-shrink-0" />
					<span class="font-sans text-[13px] text-primary font-medium">
						Create "{query.trim()}"
					</span>
				</button>
			{/if}
		</div>
	{/if}
</div>
