<script lang="ts">
	import { Input, Label } from '$lib/components/shadcn';
	import FormPopover from '$lib/components/FormPopover.svelte';
	import PassagePicker from '$lib/components/PassagePicker.svelte';
	import AudioTrackFields from '$lib/components/AudioTrackFields.svelte';
	import { useAddAudioTrack } from '$lib/queries/content/useAddAudioTrack';
	import { useMusicGenres } from '$lib/queries/content/useAudioTrack';
	import { PROVIDER_LABEL } from '$lib/utils/audioLinks';
	import type { CreateAudioTrackInput, SameSongCandidate } from '$lib/queries/content';
	import { useAddMovie } from '$lib/queries/content/useAddMovie';
	import { useAddVideo } from '$lib/queries/content/useAddVideo';
	import { useAddPassage } from '$lib/queries/content/useAddPassage';
	import { validateYouTubeUrl } from '$lib/utils/youtube';
	import { contentNotAllowedMessage, validateMovieInput } from '$lib/utils/movie';
	import { detectContentType } from '$lib/utils/detectContentType';
	import type { PassageRange } from '$lib/utils/bible';
	import { defaultRange, isRangeInBounds, isRangeOrdered } from '$lib/utils/passageRange';
	import { untrack } from 'svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ClipboardPasteIcon from '@lucide/svelte/icons/clipboard-paste';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';

	type ChosenType = 'YOUTUBE_VIDEO' | 'BIBLE_PASSAGE' | 'MOVIE' | 'AUDIO_TRACK';

	let {
		triggerVariant = 'default',
	}: {
		triggerVariant?: 'default' | 'outline' | 'ghost';
	} = $props();

	// Created first so the YouTube hook stays the last createMutation call (existing tests capture its options).
	const movieMutation = useAddMovie();
	// Also before useAddVideo, which must stay the last createMutation call.
	const audioMutation = useAddAudioTrack();

	let open = $state(false);
	let input = $state('');
	let audioTitle = $state('');
	let audioArtist = $state('');
	let audioGenreId = $state<string | null>(null);
	let candidates = $state<SameSongCandidate[]>([]);
	let error = $state('');
	// User's explicit type choice; wins over autodetect until the input changes.
	let manualType = $state<ChosenType | null>(null);
	// User's edits in the picker; wins over the range parsed from the input.
	let rangeOverride = $state<PassageRange | null>(null);
	// Bumped to remount PassagePicker, wiping its internal "has the user touched
	// an end field" tracking along with the visible fields it's keyed on.
	let pickerResetToken = $state(0);

	$effect(() => {
		if (open) {
			input = '';
			error = '';
			manualType = null;
			rangeOverride = null;
			audioTitle = '';
			audioArtist = '';
			audioGenreId = null;
			candidates = [];
			// Read the prior value via untrack so this effect doesn't depend on the
			// state it writes — otherwise the write re-triggers the effect forever
			// (effect_update_depth_exceeded).
			pickerResetToken = untrack(() => pickerResetToken) + 1;
			// Only `open` may be a dependency here: `reset` reads the reactive mutation object, so
			// without untrack a success re-runs this effect (open is still true) and resets the
			// mutation before the close-on-success effect sees `isSuccess`.
			untrack(() => movieMutation.reset());
			untrack(() => audioMutation.reset());
		}
	});

	const detected = $derived(detectContentType(input));
	const effectiveType = $derived<ChosenType | 'CLAIM' | null>(manualType ?? detected.type);
	const range = $derived<PassageRange>(
		rangeOverride ?? (detected.type === 'BIBLE_PASSAGE' ? detected.range : defaultRange(1)),
	);
	const rangeValid = $derived(isRangeOrdered(range) && isRangeInBounds(range));
	const audioLink = $derived(detected.type === 'AUDIO_TRACK' ? detected.link : null);
	const genresQuery = useMusicGenres(() => open && effectiveType === 'AUDIO_TRACK');
	const genres = $derived(genresQuery.data ?? []);
	// Prefill the title from an Apple slug once per pasted link; the user can edit it.
	$effect(() => {
		const suggested = audioLink?.suggestedTitle ?? '';
		if (suggested) untrack(() => (audioTitle = suggested));
	});

	// useAddVideo stays the last createMutation call, keeping the existing YouTube-path
	// tests' captured options unchanged.
	const passageMutation = useAddPassage();
	const videoMutation = useAddVideo();
	const isPending = $derived(
		videoMutation.isPending || passageMutation.isPending || movieMutation.isPending || audioMutation.isPending,
	);

	$effect(() => {
		if (videoMutation.isSuccess || passageMutation.isSuccess || movieMutation.isSuccess) open = false;
	});

	const notAllowedMessage = $derived(contentNotAllowedMessage(movieMutation.error));

	const chipLabel = $derived.by(() => {
		if (!effectiveType) return 'Select a type';
		const name =
			effectiveType === 'YOUTUBE_VIDEO'
				? 'YouTube'
				: effectiveType === 'BIBLE_PASSAGE'
					? 'Bible passage'
					: effectiveType === 'MOVIE'
						? 'Movie'
						: effectiveType === 'AUDIO_TRACK'
							? audioLink
								? `Audio track (${PROVIDER_LABEL[audioLink.provider]})`
								: 'Audio track'
							: 'Claim';
		return manualType ? `Type: ${name}` : `Detected: ${name}`;
	});

	const isMusicCollection = $derived(detected.type === 'AUDIO_TRACK' && detected.link === null);

	const isSubmitDisabled = $derived.by(() => {
		if (effectiveType === 'AUDIO_TRACK') {
			if (!audioLink) return true;
			return audioLink.provider !== 'youtube' && !audioTitle.trim();
		}
		if (effectiveType === 'YOUTUBE_VIDEO' || effectiveType === 'MOVIE') return !input.trim();
		if (effectiveType === 'BIBLE_PASSAGE') return !rangeValid;
		return true;
	});

	function resetOverrides() {
		manualType = null;
		rangeOverride = null;
		error = '';
	}

	// "All" — back to the just-opened state: no type, no text, no picker edits.
	function clearAll() {
		input = '';
		resetOverrides();
		pickerResetToken++;
	}

	// "Type" — clear only the fields the current type actually uses, keeping the
	// chosen type itself so the user doesn't lose their place (e.g. re-typing a
	// passage reference after a typo shouldn't require re-selecting the type).
	function clearType() {
		if (
			effectiveType === 'YOUTUBE_VIDEO' ||
			effectiveType === 'BIBLE_PASSAGE' ||
			effectiveType === 'MOVIE' ||
			effectiveType === 'AUDIO_TRACK'
		) {
			// Clearing the text would otherwise make autodetection fall back to "no
			// type" — pin the type explicitly so the user stays on the same type.
			manualType = effectiveType;
			input = '';
		}
		if (effectiveType === 'AUDIO_TRACK') {
			audioTitle = '';
			audioArtist = '';
			audioGenreId = null;
			candidates = [];
		}
		if (effectiveType === 'BIBLE_PASSAGE') {
			rangeOverride = defaultRange(1);
			pickerResetToken++;
		}
		error = '';
	}

	function handleTypeChange(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		manualType =
			value === 'YOUTUBE_VIDEO' || value === 'BIBLE_PASSAGE' || value === 'MOVIE' || value === 'AUDIO_TRACK'
				? value
				: null;
		error = '';
	}

	function audioInput(extra: Partial<CreateAudioTrackInput> = {}): CreateAudioTrackInput {
		const req: CreateAudioTrackInput = { url: audioLink!.canonicalUrl };
		if (audioLink!.provider !== 'youtube') {
			req.title = audioTitle.trim();
			if (audioArtist.trim()) req.artist = audioArtist.trim();
		}
		if (audioGenreId) req.genreId = Number(audioGenreId);
		return { ...req, ...extra };
	}

	function submitAudio(extra: Partial<CreateAudioTrackInput> = {}) {
		audioMutation.mutate(audioInput(extra), {
			onSuccess: (r) => {
				candidates = r.sameSongCandidates;
				// A same-song prompt keeps the popover open; anything else is done.
				if (candidates.length === 0) open = false;
			},
		});
	}

	function handleSubmit() {
		if (effectiveType === 'AUDIO_TRACK') {
			if (!audioLink) return;
			error = '';
			submitAudio();
		} else if (effectiveType === 'YOUTUBE_VIDEO') {
			const url = input.trim();
			if (!validateYouTubeUrl(url)) {
				error = 'Please enter a valid YouTube URL';
				return;
			}
			error = '';
			videoMutation.mutate(url);
		} else if (effectiveType === 'MOVIE') {
			const url = input.trim();
			if (!validateMovieInput(url)) {
				error = 'Please enter a valid TMDB or IMDb movie link';
				return;
			}
			error = '';
			movieMutation.mutate(url);
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
	description="Paste a YouTube, YouTube Music, Spotify, Apple Music, Amazon Music, TMDB or IMDb link, or type a Bible reference like John 3:16-18."
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
			{:else if isMusicCollection}
				<p data-testid="music-collection-notice" class="text-sm text-red-600">
					This is an album, playlist, or artist link. Paste a link to a single song.
				</p>
			{/if}
			{#if effectiveType === 'MOVIE' && movieMutation.isError}
				<p class="text-sm text-red-600">
					{notAllowedMessage ?? 'Could not add this movie. Check the link and try again.'}
				</p>
			{/if}

			{#if effectiveType === 'AUDIO_TRACK' && audioLink}
				<AudioTrackFields
					link={audioLink}
					bind:title={audioTitle}
					bind:artist={audioArtist}
					bind:genreId={audioGenreId}
					{genres}
					{candidates}
					disabled={isPending}
					onSameSong={(id) => submitAudio({ sameAsContentId: Number(id) })}
					onDifferentSong={() => submitAudio({ createNew: true })}
				/>
			{/if}

			<div class="flex items-center gap-2 text-sm">
				<span data-testid="type-chip" class="text-muted-foreground">{chipLabel}</span>
				<select
					aria-label="Change type"
					class="border-input bg-background h-8 rounded-md border px-2 text-sm"
					value={effectiveType === 'YOUTUBE_VIDEO' ||
					effectiveType === 'BIBLE_PASSAGE' ||
					effectiveType === 'MOVIE' ||
					effectiveType === 'AUDIO_TRACK'
						? effectiveType
						: ''}
					onchange={handleTypeChange}
					disabled={isPending}
				>
					<option value="" disabled>Select a type</option>
					<option value="YOUTUBE_VIDEO">YouTube</option>
					<option value="BIBLE_PASSAGE">Bible passage</option>
					<option value="MOVIE">Movie</option>
					<option value="AUDIO_TRACK">Audio track</option>
				</select>
				<div class="ml-auto flex items-center gap-1">
					<button
						type="button"
						onclick={clearType}
						disabled={isPending ||
							(effectiveType !== 'YOUTUBE_VIDEO' &&
								effectiveType !== 'BIBLE_PASSAGE' &&
								effectiveType !== 'MOVIE' &&
								effectiveType !== 'AUDIO_TRACK')}
						aria-label="Clear type"
						title="Clear this type's fields"
						class="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors disabled:pointer-events-none disabled:opacity-40"
					>
						<RotateCcwIcon class="size-3.5" />
						Type
					</button>
					<button
						type="button"
						onclick={clearAll}
						disabled={isPending || (!input && !manualType && !rangeOverride)}
						aria-label="Clear all"
						title="Clear everything"
						class="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors disabled:pointer-events-none disabled:opacity-40"
					>
						<EraserIcon class="size-3.5" />
						All
					</button>
				</div>
			</div>

			{#if effectiveType === 'CLAIM'}
				<p class="text-sm text-muted-foreground">Claims can't be added from here yet. Pick a type above to continue.</p>
			{/if}

			{#if effectiveType === 'MOVIE'}
				<p class="text-xs text-muted-foreground">
					This product uses the TMDB API but is not endorsed or certified by TMDB.
				</p>
			{/if}

			{#if effectiveType === 'BIBLE_PASSAGE'}
				{#key pickerResetToken}
					<PassagePicker {range} onchange={(r) => (rangeOverride = r)} disabled={isPending} />
				{/key}
			{/if}
		</div>
	{/snippet}
</FormPopover>
