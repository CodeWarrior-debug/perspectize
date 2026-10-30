<script lang="ts">
	import { Button, Input } from '$lib/components/shadcn';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import GlassesIcon from '@lucide/svelte/icons/glasses';
	import { youtubeSearchUrl } from '$lib/services/youtubeApi';
	import { validateYouTubeUrl } from '$lib/utils/youtube';

	// Search hands off to youtube.com: search.list is capped at 100 calls a day
	// per project, so the app never calls it. A pasted YouTube link is added
	// directly instead of being searched for.
	let {
		value = $bindable(''),
		inputRef = $bindable(null),
		onAddUrl,
		isAdding = false,
	}: {
		value?: string;
		/** Exposes the underlying input element so callers can imperatively focus it (e.g. a Cmd+K shortcut). */
		inputRef?: HTMLInputElement | null;
		/** Called with the pasted link when the input holds a YouTube video URL. */
		onAddUrl?: (url: string) => void;
		isAdding?: boolean;
	} = $props();

	const trimmed = $derived(value.trim());
	const isVideoLink = $derived(validateYouTubeUrl(trimmed));

	// Autofocus on mount.
	$effect(() => {
		inputRef?.focus();
	});

	function handleClear() {
		value = '';
		inputRef?.focus();
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!trimmed) return;
		if (isVideoLink) {
			onAddUrl?.(trimmed);
			return;
		}
		window.open(youtubeSearchUrl(trimmed), '_blank', 'noopener,noreferrer');
	}
</script>

<form class="flex flex-col gap-1.5" onsubmit={handleSubmit} role="search">
	<!-- Phones: the button stacks under the input so the input keeps the full width. -->
	<div class="flex w-full flex-col gap-2 sm:flex-row">
		<div class="relative flex-1 min-w-0">
			<SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
			<Input
				bind:ref={inputRef}
				type="text"
				placeholder="Search YouTube, or paste a video link"
				aria-label="Search YouTube, or paste a video link"
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
		<Button
			type="submit"
			variant={isVideoLink ? 'default' : 'outline'}
			disabled={!trimmed || isAdding}
			class="w-full sm:w-auto"
		>
			{#if isVideoLink}
				<GlassesIcon class="size-4" />
				{isAdding ? 'Adding...' : 'Add to Perspectize'}
			{:else}
				Search on YouTube
				<ExternalLinkIcon class="size-4" />
			{/if}
		</Button>
	</div>
	<p class="text-xs text-muted-foreground">
		Results open on YouTube in a new tab. Found a video? Paste its link here to add it.
	</p>
</form>
