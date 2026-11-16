<script lang="ts">
	import { Input, Label } from '$lib/components/shadcn';
	import FormPopover from '$lib/components/FormPopover.svelte';
	import PassagePicker from '$lib/components/PassagePicker.svelte';
	import WebPageImportPreview from '$lib/components/webpage/WebPageImportPreview.svelte';
	import { useAddMovie } from '$lib/queries/content/useAddMovie';
	import { useAddBook } from '$lib/queries/content/useAddBook';
	import { useAddVideo } from '$lib/queries/content/useAddVideo';
	import { useAddPassage } from '$lib/queries/content/useAddPassage';
	import { useCreateWebPage } from '$lib/queries/content/useCreateWebPage';
	import { useWebPagePreview } from '$lib/queries/content/useWebPagePreview';
	import type { WebPageRole } from '$lib/queries/content';
	import { validateYouTubeUrl } from '$lib/utils/youtube';
	import { contentNotAllowedMessage, validateMovieInput } from '$lib/utils/movie';
	import { validateBookInput } from '$lib/utils/book';
	import { detectContentType } from '$lib/utils/detectContentType';
	import type { PassageRange } from '$lib/utils/bible';
	import { defaultRange, isRangeInBounds, isRangeOrdered } from '$lib/utils/passageRange';
	import { untrack } from 'svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ClipboardPasteIcon from '@lucide/svelte/icons/clipboard-paste';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';

	type ChosenType = 'YOUTUBE_VIDEO' | 'BIBLE_PASSAGE' | 'MOVIE' | 'BOOK' | 'WEB_PAGE';
	const CHOSEN_TYPES: readonly ChosenType[] = ['YOUTUBE_VIDEO', 'BIBLE_PASSAGE', 'MOVIE', 'BOOK', 'WEB_PAGE'];
	const isChosenType = (value: string | null): value is ChosenType => CHOSEN_TYPES.includes(value as ChosenType);

	/** Detection runs on every keystroke; the preview is requested only once the link has been still this long. */
	const WEB_PAGE_PREVIEW_DEBOUNCE_MS = 400;

	let {
		triggerVariant = 'default',
	}: {
		triggerVariant?: 'default' | 'outline' | 'ghost';
	} = $props();

	// Created first so the YouTube hook stays the last createMutation call (existing tests capture its options).
	const movieMutation = useAddMovie();
	const bookMutation = useAddBook();
	const webPageMutation = useCreateWebPage();

	let open = $state(false);
	let input = $state('');
	let error = $state('');
	// User's explicit type choice; wins over autodetect until the input changes.
	let manualType = $state<ChosenType | null>(null);
	// User's edits in the picker; wins over the range parsed from the input.
	let rangeOverride = $state<PassageRange | null>(null);
	// Bumped to remount PassagePicker, wiping its internal "has the user touched
	// an end field" tracking along with the visible fields it's keyed on.
	let pickerResetToken = $state(0);
	// Webpage roles the adder picked, in pick order. Empty by default (a plain webpage).
	let webPageRoles = $state<WebPageRole[]>([]);
	// The url the import preview is requested for; set by the debounce effect below.
	let debouncedWebPageUrl = $state<string | null>(null);

	$effect(() => {
		if (open) {
			input = '';
			error = '';
			manualType = null;
			rangeOverride = null;
			webPageRoles = [];
			// Read the prior value via untrack so this effect doesn't depend on the
			// state it writes — otherwise the write re-triggers the effect forever
			// (effect_update_depth_exceeded).
			pickerResetToken = untrack(() => pickerResetToken) + 1;
			// Only `open` may be a dependency here: `reset` reads the reactive mutation object, so
			// without untrack a success re-runs this effect (open is still true) and resets the
			// mutation before the close-on-success effect sees `isSuccess`.
			untrack(() => {
				movieMutation.reset();
				bookMutation.reset();
				webPageMutation.reset();
			});
		}
	});

	const detected = $derived(detectContentType(input));
	const effectiveType = $derived<ChosenType | 'CLAIM' | null>(manualType ?? detected.type);
	const range = $derived<PassageRange>(
		rangeOverride ?? (detected.type === 'BIBLE_PASSAGE' ? detected.range : defaultRange(1)),
	);
	const rangeValid = $derived(isRangeOrdered(range) && isRangeInBounds(range));

	// The link the import preview is for: only when the type is a webpage and there is text.
	const webPageUrl = $derived(effectiveType === 'WEB_PAGE' && input.trim() ? input.trim() : null);
	// Reads the url synchronously before its timer, so the timer is the only thing the effect depends on
	// beyond the input. Each keystroke cancels the last timer, so only a settled link is requested.
	$effect(() => {
		const candidate = effectiveType === 'WEB_PAGE' && input.trim() ? input.trim() : null;
		const timer = setTimeout(() => {
			debouncedWebPageUrl = candidate;
		}, WEB_PAGE_PREVIEW_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	});
	const previewQuery = useWebPagePreview(() => debouncedWebPageUrl);
	// The preview only counts once the url has settled, so a stale link's preview is never shown.
	const webPageSettled = $derived(webPageUrl !== null && debouncedWebPageUrl === webPageUrl);
	const webPagePreview = $derived(webPageSettled ? (previewQuery.data ?? null) : null);
	const webPageLoading = $derived(webPageUrl !== null && (!webPageSettled || previewQuery.isPending));
	const webPageFailed = $derived(webPageSettled && previewQuery.isError);
	// A page already saved keeps its stored roles: no dropdown, and Save is replaced by the link.
	const webPageAlreadySaved = $derived(webPagePreview?.alreadyExistsContentId != null);

	// useAddVideo stays the last createMutation call, keeping the existing YouTube-path
	// tests' captured options unchanged.
	const passageMutation = useAddPassage();
	const videoMutation = useAddVideo();
	const isPending = $derived(
		videoMutation.isPending ||
			passageMutation.isPending ||
			movieMutation.isPending ||
			bookMutation.isPending ||
			webPageMutation.isPending,
	);

	$effect(() => {
		if (
			videoMutation.isSuccess ||
			passageMutation.isSuccess ||
			movieMutation.isSuccess ||
			bookMutation.isSuccess ||
			webPageMutation.isSuccess
		) {
			open = false;
		}
	});

	const notAllowedMessage = $derived(
		contentNotAllowedMessage(effectiveType === 'BOOK' ? bookMutation.error : movieMutation.error),
	);

	const chipLabel = $derived.by(() => {
		if (!effectiveType) return 'Select a type';
		const name =
			effectiveType === 'YOUTUBE_VIDEO'
				? 'YouTube'
				: effectiveType === 'BIBLE_PASSAGE'
					? 'Bible passage'
					: effectiveType === 'MOVIE'
						? 'Movie'
						: effectiveType === 'BOOK'
							? 'Book'
							: effectiveType === 'WEB_PAGE'
								? 'Webpage'
								: 'Claim';
		return manualType ? `Type: ${name}` : `Detected: ${name}`;
	});

	const isSubmitDisabled = $derived.by(() => {
		if (effectiveType === 'YOUTUBE_VIDEO' || effectiveType === 'MOVIE' || effectiveType === 'BOOK')
			return !input.trim();
		if (effectiveType === 'WEB_PAGE') return !input.trim() || webPageAlreadySaved;
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
		webPageRoles = [];
		resetOverrides();
		pickerResetToken++;
	}

	// "Type" — clear only the fields the current type actually uses, keeping the
	// chosen type itself so the user doesn't lose their place (e.g. re-typing a
	// passage reference after a typo shouldn't require re-selecting the type).
	function clearType() {
		if (isChosenType(effectiveType)) {
			// Clearing the text would otherwise make autodetection fall back to "no
			// type" — pin the type explicitly so the user stays on the same type.
			manualType = effectiveType;
			input = '';
		}
		if (effectiveType === 'BIBLE_PASSAGE') {
			rangeOverride = defaultRange(1);
			pickerResetToken++;
		}
		error = '';
	}

	function handleTypeChange(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		manualType = isChosenType(value) ? value : null;
		error = '';
	}

	function handleSubmit() {
		if (effectiveType === 'YOUTUBE_VIDEO') {
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
		} else if (effectiveType === 'BOOK') {
			const url = input.trim();
			if (!validateBookInput(url)) {
				error = 'Please enter a valid Open Library book link';
				return;
			}
			error = '';
			bookMutation.mutate(url);
		} else if (effectiveType === 'WEB_PAGE') {
			const url = input.trim();
			// A saved page keeps its stored roles, so there is nothing to add from here.
			if (!url || webPageAlreadySaved) return;
			error = '';
			// `webPageRoles` is left out entirely when none are picked: nothing is sent for roles.
			webPageMutation.mutate(webPageRoles.length ? { url, webPageRoles: [...webPageRoles] } : { url });
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
	description="Paste a YouTube, TMDB, IMDb or Open Library link, any other web link, or type a Bible reference like John 3:16-18."
	submitLabel={webPageAlreadySaved ? 'Already saved' : 'Add'}
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
			{#if effectiveType === 'BOOK' && bookMutation.isError}
				<p class="text-sm text-red-600">
					{notAllowedMessage ?? 'Could not add this book. Check the link and try again.'}
				</p>
			{/if}
			{#if effectiveType === 'MOVIE' && movieMutation.isError}
				<p class="text-sm text-red-600">
					{notAllowedMessage ?? 'Could not add this movie. Check the link and try again.'}
				</p>
			{/if}

			<div class="flex items-center gap-2 text-sm">
				<span data-testid="type-chip" class="text-muted-foreground">{chipLabel}</span>
				<select
					aria-label="Change type"
					class="border-input bg-background h-8 rounded-md border px-2 text-sm"
					value={isChosenType(effectiveType) ? effectiveType : ''}
					onchange={handleTypeChange}
					disabled={isPending}
				>
					<option value="" disabled>Select a type</option>
					<option value="YOUTUBE_VIDEO">YouTube</option>
					<option value="BIBLE_PASSAGE">Bible passage</option>
					<option value="MOVIE">Movie</option>
					<option value="BOOK">Book</option>
					<option value="WEB_PAGE">Webpage</option>
				</select>
				<div class="ml-auto flex items-center gap-1">
					<button
						type="button"
						onclick={clearType}
						disabled={isPending || !isChosenType(effectiveType)}
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

			{#if effectiveType === 'BOOK'}
				<p class="text-xs text-muted-foreground">
					Data: Open Library (archive.org), community-contributed; may be incomplete.
				</p>
			{/if}

			{#if effectiveType === 'BIBLE_PASSAGE'}
				{#key pickerResetToken}
					<PassagePicker {range} onchange={(r) => (rangeOverride = r)} disabled={isPending} />
				{/key}
			{/if}

			{#if effectiveType === 'WEB_PAGE'}
				<WebPageImportPreview
					url={input.trim()}
					preview={webPagePreview}
					loading={webPageLoading}
					failed={webPageFailed}
					roles={webPageRoles}
					onRolesChange={(roles) => (webPageRoles = roles)}
					disabled={isPending}
				/>
			{/if}
		</div>
	{/snippet}
</FormPopover>
