<script lang="ts">
	import { Input } from '$lib/components/shadcn';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';

	// Debounced in-app content search (Compare picker). Discover's SearchBar
	// hands off to youtube.com instead, so it no longer debounces.

	let {
		value = $bindable(''),
		debouncedQuery = $bindable(''),
		inputRef = $bindable(null),
	}: {
		value?: string;
		debouncedQuery?: string;
		/** Exposes the underlying input element so callers can imperatively focus it (e.g. a Cmd+K shortcut). */
		inputRef?: HTMLInputElement | null;
	} = $props();

	// Debounce: only propagate to debouncedQuery 300ms after typing stops.
	$effect(() => {
		const query = value;
		const timer = setTimeout(() => {
			debouncedQuery = query;
		}, 300);
		return () => clearTimeout(timer);
	});

	// Autofocus on mount.
	$effect(() => {
		inputRef?.focus();
	});

	function handleClear() {
		value = '';
		debouncedQuery = '';
		inputRef?.focus();
	}
</script>

<div class="relative w-full">
	<SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
	<Input
		bind:ref={inputRef}
		type="text"
		placeholder="Search Content Sources..."
		bind:value
		class="pl-9 {value ? 'pr-9' : ''}"
	/>
	{#if value}
		<button
			type="button"
			onclick={handleClear}
			aria-label="Clear search"
			class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
		>
			<XIcon class="size-4" />
		</button>
	{/if}
</div>
