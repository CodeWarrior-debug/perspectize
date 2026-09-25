<script lang="ts">
	import { Input, Label } from '$lib/components/shadcn';
	import FormPopover from '$lib/components/FormPopover.svelte';
	import PassagePicker from '$lib/components/PassagePicker.svelte';
	import { useAddVideo } from '$lib/queries/content/useAddVideo';
	import { useAddPassage } from '$lib/queries/content/useAddPassage';
	import { validateYouTubeUrl } from '$lib/utils/youtube';
	import { detectContentType } from '$lib/utils/detectContentType';
	import type { PassageRange } from '$lib/utils/bible';
	import { defaultRange, isRangeInBounds, isRangeOrdered } from '$lib/utils/passageRange';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ClipboardPasteIcon from '@lucide/svelte/icons/clipboard-paste';

	type ChosenType = 'YOUTUBE' | 'BIBLE_PASSAGE';

	let {
		triggerVariant = 'default',
	}: {
		triggerVariant?: 'default' | 'outline' | 'ghost';
	} = $props();

	let open = $state(false);
	let input = $state('');
	let error = $state('');
	// User's explicit type choice; wins over autodetect until the input changes.
	let manualType = $state<ChosenType | null>(null);
	// User's edits in the picker; wins over the range parsed from the input.
	let rangeOverride = $state<PassageRange | null>(null);

	$effect(() => {
		if (open) {
			input = '';
			error = '';
			manualType = null;
			rangeOverride = null;
		}
	});

	const detected = $derived(detectContentType(input));
	const effectiveType = $derived<ChosenType | 'CLAIM' | null>(manualType ?? detected.type);
	const range = $derived<PassageRange>(
		rangeOverride ?? (detected.type === 'BIBLE_PASSAGE' ? detected.range : defaultRange(1)),
	);
	const rangeValid = $derived(isRangeOrdered(range) && isRangeInBounds(range));

	// addPassage is created first so the YouTube hook stays the last createMutation
	// call, keeping the existing YouTube-path tests' captured options unchanged.
	const passageMutation = useAddPassage();
	const videoMutation = useAddVideo();
	const isPending = $derived(videoMutation.isPending || passageMutation.isPending);

	$effect(() => {
		if (videoMutation.isSuccess || passageMutation.isSuccess) {
			open = false;
		}
	});

	const chipLabel = $derived.by(() => {
		if (!effectiveType) return 'Select a type';
		const name =
			effectiveType === 'YOUTUBE' ? 'YouTube' : effectiveType === 'BIBLE_PASSAGE' ? 'Bible passage' : 'Claim';
		return manualType ? `Type: ${name}` : `Detected: ${name}`;
	});

	const isSubmitDisabled = $derived.by(() => {
		if (effectiveType === 'YOUTUBE') return !input.trim();
		if (effectiveType === 'BIBLE_PASSAGE') return !rangeValid;
		return true;
	});

	function resetOverrides() {
		manualType = null;
		rangeOverride = null;
		error = '';
	}

	function handleTypeChange(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		manualType = value === 'YOUTUBE' || value === 'BIBLE_PASSAGE' ? value : null;
		error = '';
	}

	function handleSubmit() {
		if (effectiveType === 'YOUTUBE') {
			const url = input.trim();
			if (!validateYouTubeUrl(url)) {
				error = 'Please enter a valid YouTube URL';
				return;
			}
			error = '';
			videoMutation.mutate(url);
		} else if (effectiveType === 'BIBLE_PASSAGE') {
			if (!rangeValid) return;
			error = '';
			// Only the numeric range is sent; the server regenerates the canonical
			// name/url, so a pasted Bible Gateway link is never stored.
			passageMutation.mutate(range);
		}
	}

	async function handlePaste() {
		try {
			input = await navigator.clipboard.readText();
			resetOverrides();
		} catch {
			error = 'Could not read clipboard — paste manually.';
		}
	}
</script>

<FormPopover
	bind:open
	{triggerVariant}
	triggerLabel="Add Content"
	title="Add Content"
	description="Paste a YouTube link, or type a Bible reference like John 3:16-18."
	submitLabel="Add"
	pendingLabel="Adding..."
	{isPending}
	{isSubmitDisabled}
	onSubmit={handleSubmit}
>
	{#snippet triggerIcon()}
		<PlusIcon class="size-4" />
	{/snippet}
	{#snippet formFields()}
		<div class="space-y-2">
			<Label for="content-input">Link or reference</Label>
			<div class="relative">
				<Input
					id="content-input"
					type="text"
					placeholder="Paste a link or type a reference"
					bind:value={input}
					oninput={resetOverrides}
					disabled={isPending}
					autocomplete="off"
					class="pr-9"
				/>
				<button
					type="button"
					onclick={handlePaste}
					disabled={isPending}
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

			<div class="flex items-center gap-2 text-sm">
				<span data-testid="type-chip" class="text-muted-foreground">{chipLabel}</span>
				<select
					aria-label="Change type"
					class="border-input bg-background h-8 rounded-md border px-2 text-sm"
					value={effectiveType === 'YOUTUBE' || effectiveType === 'BIBLE_PASSAGE' ? effectiveType : ''}
					onchange={handleTypeChange}
					disabled={isPending}
				>
					<option value="" disabled>Select a type</option>
					<option value="YOUTUBE">YouTube</option>
					<option value="BIBLE_PASSAGE">Bible passage</option>
				</select>
			</div>

			{#if effectiveType === 'CLAIM'}
				<p class="text-sm text-muted-foreground">Claims can't be added from here yet. Pick a type above to continue.</p>
			{/if}

			{#if effectiveType === 'BIBLE_PASSAGE'}
				<PassagePicker {range} onchange={(r) => (rangeOverride = r)} disabled={isPending} />
			{/if}
		</div>
	{/snippet}
</FormPopover>
