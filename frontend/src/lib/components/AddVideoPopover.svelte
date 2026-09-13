<script lang="ts">
	import { Input, Label } from '$lib/components/shadcn';
	import FormPopover from '$lib/components/FormPopover.svelte';
	import { useAddVideo } from '$lib/queries/content/useAddVideo';
	import { validateYouTubeUrl } from '$lib/utils/youtube';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ClipboardPasteIcon from '@lucide/svelte/icons/clipboard-paste';

	let {
		triggerVariant = 'default',
	}: {
		triggerVariant?: 'default' | 'outline' | 'ghost';
	} = $props();

	// Reactive state
	let open = $state(false);
	let url = $state('');
	let error = $state('');

	// Reset form when popover opens
	$effect(() => {
		if (open) {
			url = '';
			error = '';
		}
	});

	// Shared mutation hook
	const mutation = useAddVideo();

	// Close popover on success
	$effect(() => {
		if (mutation.isSuccess) {
			open = false;
		}
	});

	// Form submission handler
	function handleSubmit() {
		if (!validateYouTubeUrl(url)) {
			error = 'Please enter a valid YouTube URL';
			return;
		}

		error = '';
		mutation.mutate(url);
	}

	// Paste URL from clipboard
	async function handlePaste() {
		try {
			url = await navigator.clipboard.readText();
			error = '';
		} catch {
			error = 'Could not read clipboard — paste manually.';
		}
	}
</script>

<FormPopover
	bind:open
	{triggerVariant}
	triggerLabel="Add Video"
	title="Add Video"
	description="Paste a YouTube URL to add it to your library."
	submitLabel="Add Video"
	pendingLabel="Adding..."
	isPending={mutation.isPending}
	isSubmitDisabled={!url.trim()}
	onSubmit={handleSubmit}
>
	{#snippet triggerIcon()}
		<PlusIcon class="size-4" />
	{/snippet}
	{#snippet formFields()}
		<div class="space-y-2">
			<Label for="url">YouTube URL</Label>
			<div class="relative">
				<Input
					id="url"
					type="text"
					placeholder="https://www.youtube.com/watch?v=..."
					bind:value={url}
					disabled={mutation.isPending}
					autocomplete="off"
					class="pr-9"
				/>
				<button
					type="button"
					onclick={handlePaste}
					disabled={mutation.isPending}
					aria-label="Paste from clipboard"
					title="Paste from clipboard"
					class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
				>
					<ClipboardPasteIcon class="size-4" />
				</button>
			</div>
			{#if error}
				<p class="text-sm text-red-600">{error}</p>
			{/if}
		</div>
	{/snippet}
</FormPopover>
