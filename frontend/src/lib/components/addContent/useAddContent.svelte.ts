import { untrack } from 'svelte';
import { useAddMovie } from '#lib/queries/content/useAddMovie.js';
import { useAddBook } from '#lib/queries/content/useAddBook.js';
import { useAddVideo } from '#lib/queries/content/useAddVideo.js';
import { useAddPassage } from '#lib/queries/content/useAddPassage.js';
import { useCreateWebPage } from '#lib/queries/content/useCreateWebPage.js';
import { useWebPagePreview } from '#lib/queries/content/useWebPagePreview.js';
import type { WebPageRole } from '#lib/queries/content/index.js';
import { validateYouTubeUrl } from '#lib/utils/youtube.js';
import { contentNotAllowedMessage, validateMovieInput } from '#lib/utils/movie.js';
import { validateBookInput } from '#lib/utils/book.js';
import { detectContentType } from '#lib/utils/detectContentType.js';
import type { PassageRange } from '#lib/utils/bible.js';
import { defaultRange, isRangeInBounds, isRangeOrdered } from '#lib/utils/passageRange.js';

export type ChosenType = 'YOUTUBE_VIDEO' | 'BIBLE_PASSAGE' | 'MOVIE' | 'BOOK' | 'WEB_PAGE';
const CHOSEN_TYPES: readonly ChosenType[] = ['YOUTUBE_VIDEO', 'BIBLE_PASSAGE', 'MOVIE', 'BOOK', 'WEB_PAGE'];
export const isChosenType = (value: string | null): value is ChosenType => CHOSEN_TYPES.includes(value as ChosenType);

/** Detection runs on every keystroke; the preview is requested only once the link has been still this long. */
const WEB_PAGE_PREVIEW_DEBOUNCE_MS = 400;

export interface AddContentOptions {
	/** Skip the mutation hooks' toasts and navigation; the host shows its own feedback. */
	quiet?: boolean;
}

/**
 * The add-content form's model: input, detected type, overrides, the import preview and the five
 * add mutations. Hosts (the header popover, the /add page) render it and decide what a save means.
 * Call during component initialisation, since it creates mutations and effects.
 */
export function useAddContent(options: AddContentOptions = {}) {
	const { quiet = false } = options;

	// Created first so the YouTube hook stays the last createMutation call (existing tests capture its options).
	const movieMutation = useAddMovie({ quiet });
	const bookMutation = useAddBook({ quiet });
	const webPageMutation = useCreateWebPage({ quiet });

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

	const detected = $derived(detectContentType(input));
	const effectiveType = $derived<ChosenType | null>(manualType ?? detected.type);
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
	const passageMutation = useAddPassage({ quiet });
	const videoMutation = useAddVideo({ quiet });
	const isPending = $derived(
		videoMutation.isPending ||
			passageMutation.isPending ||
			movieMutation.isPending ||
			bookMutation.isPending ||
			webPageMutation.isPending,
	);
	const isSuccess = $derived(
		videoMutation.isSuccess ||
			passageMutation.isSuccess ||
			movieMutation.isSuccess ||
			bookMutation.isSuccess ||
			webPageMutation.isSuccess,
	);

	// The saved row and whether the save found it already stored, read from whichever mutation succeeded.
	// Only YouTube and webpages report "already existed"; the other types always read as new.
	const saved = $derived.by((): { id: string | number | null; alreadyExisted: boolean } => {
		if (videoMutation.isSuccess) {
			const r = videoMutation.data?.createContentFromYouTube;
			return { id: r?.content?.id ?? null, alreadyExisted: r?.alreadyExisted === true };
		}
		if (webPageMutation.isSuccess) {
			const r = webPageMutation.data?.createContentFromWebPage;
			return { id: r?.content?.id ?? null, alreadyExisted: r?.alreadyExisted === true };
		}
		if (movieMutation.isSuccess) return { id: movieMutation.data?.createContentFromMovie?.id ?? null, alreadyExisted: false };
		if (bookMutation.isSuccess) return { id: bookMutation.data?.createContentFromBook?.id ?? null, alreadyExisted: false };
		if (passageMutation.isSuccess)
			return { id: passageMutation.data?.createContentFromPassage?.id ?? null, alreadyExisted: false };
		return { id: null, alreadyExisted: false };
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
							: 'Webpage';
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

	/** Back to the just-opened state: no type, no text, no picker edits, mutations cleared. */
	function reset() {
		input = '';
		error = '';
		manualType = null;
		rangeOverride = null;
		webPageRoles = [];
		// Read the prior value via untrack so a calling effect doesn't depend on the
		// state it writes — otherwise the write re-triggers the effect forever
		// (effect_update_depth_exceeded).
		pickerResetToken = untrack(() => pickerResetToken) + 1;
		// `reset` reads the reactive mutation object, so without untrack a success would re-run
		// the calling effect and reset the mutation before a close-on-success effect sees `isSuccess`.
		untrack(() => {
			movieMutation.reset();
			bookMutation.reset();
			webPageMutation.reset();
		});
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

	function changeType(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		manualType = isChosenType(value) ? value : null;
		error = '';
	}

	function submit() {
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

	async function paste() {
		try {
			input = await navigator.clipboard.readText();
			resetOverrides();
		} catch {
			error = 'Could not read clipboard — paste manually.';
		}
	}

	return {
		get input() {
			return input;
		},
		set input(value: string) {
			input = value;
		},
		get error() {
			return error;
		},
		get manualType() {
			return manualType;
		},
		get rangeOverride() {
			return rangeOverride;
		},
		get pickerResetToken() {
			return pickerResetToken;
		},
		get webPageRoles() {
			return webPageRoles;
		},
		get effectiveType() {
			return effectiveType;
		},
		get range() {
			return range;
		},
		get chipLabel() {
			return chipLabel;
		},
		get isPending() {
			return isPending;
		},
		get isSuccess() {
			return isSuccess;
		},
		get isSubmitDisabled() {
			return isSubmitDisabled;
		},
		get submitLabel() {
			return webPageAlreadySaved ? 'Already saved' : 'Add';
		},
		get webPageAlreadySaved() {
			return webPageAlreadySaved;
		},
		get webPagePreview() {
			return webPagePreview;
		},
		get webPageLoading() {
			return webPageLoading;
		},
		get webPageFailed() {
			return webPageFailed;
		},
		get notAllowedMessage() {
			return notAllowedMessage;
		},
		get bookFailed() {
			return bookMutation.isError;
		},
		get movieFailed() {
			return movieMutation.isError;
		},
		/** The saved row's id once a save succeeded, else null. */
		get savedContentId() {
			return saved.id;
		},
		/** True when the save found the row already stored (YouTube and webpages only). */
		get alreadySaved() {
			return saved.alreadyExisted;
		},
		setRange(r: PassageRange) {
			rangeOverride = r;
		},
		setRoles(roles: WebPageRole[]) {
			webPageRoles = roles;
		},
		resetOverrides,
		reset,
		clearAll,
		clearType,
		changeType,
		submit,
		paste,
	};
}

export type AddContent = ReturnType<typeof useAddContent>;
