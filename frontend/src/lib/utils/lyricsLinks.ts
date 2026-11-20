/**
 * Lyrics are never shown in Perspectize, only linked. Every link's label says
 * where it goes: "Open lyrics" is reserved for LRCLIB's page for this exact song,
 * and every search link carries a warning that it opens a results page. Searches
 * always use title + artist, never the artist alone.
 */
export interface LyricsAvailability {
	available: boolean;
	lrclibId: number | null;
	hasSynced: boolean;
	checkedAt: string;
}

export interface LyricsLink {
	kind: 'track' | 'search' | 'youtubeMusic';
	label: string;
	href: string;
	helper?: string;
}

export interface LyricsLinkState {
	/** Shown instead of a track link when a check found nothing. */
	notice?: string;
	links: LyricsLink[];
}

const SEARCH_HELPER = 'Opens a search results page, not this song directly.';

export function lrclibSearchUrl(title: string, artist: string): string {
	return `https://lrclib.net/search/${encodeURIComponent(`${title} ${artist}`.trim())}`;
}

export function lyricsLinks(opts: {
	title: string;
	artist: string | null;
	lyrics: LyricsAvailability | null;
	youtubeMusicUrl: string | null;
}): LyricsLinkState {
	const { title, lyrics, youtubeMusicUrl } = opts;
	const artist = opts.artist?.trim() ?? '';
	const links: LyricsLink[] = [];
	let notice: string | undefined;
	const who = artist ? `'${title}' – ${artist}` : `'${title}'`;

	if (lyrics?.available && lyrics.lrclibId != null) {
		links.push({ kind: 'track', label: 'Open lyrics', href: `https://lrclib.net/tracks/${lyrics.lrclibId}` });
	} else if (title.trim() && artist) {
		// No artist means a search could only be title-only; skip it rather than guess.
		if (lyrics && !lyrics.available) notice = 'No lyrics found for this song.';
		links.push({
			kind: 'search',
			label: lyrics && !lyrics.available ? `Search LRCLIB for ${who}` : `Search lyrics for ${who}`,
			href: lrclibSearchUrl(title, artist),
			helper: SEARCH_HELPER,
		});
	} else if (lyrics && !lyrics.available) {
		notice = 'No lyrics found for this song.';
	}

	if (youtubeMusicUrl) {
		links.push({
			kind: 'youtubeMusic',
			label: 'Open song in YouTube Music',
			href: youtubeMusicUrl,
			helper: 'Lyrics tab shown there if available.',
		});
	}
	return { notice, links };
}
