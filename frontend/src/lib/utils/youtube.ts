/**
 * Validates if a string is a YouTube URL.
 *
 * Supports:
 * - youtube.com, www.youtube.com, m.youtube.com, music.youtube.com
 *   (with /watch, /embed, /v, /e, /shorts, /live)
 * - youtu.be (short URLs)
 * - youtube-nocookie.com, www.youtube-nocookie.com (with /embed)
 *
 * Uses URL constructor to avoid catastrophic backtracking issues with complex regex.
 *
 * @param url - The URL string to validate
 * @returns true if the URL is a valid YouTube URL, false otherwise
 */
export function validateYouTubeUrl(url: string): boolean {
	// Empty or whitespace-only strings are invalid
	if (!url.trim()) {
		return false;
	}

	try {
		const urlObj = new URL(url);

		// youtu.be short URLs — pathname must have video ID (length > 1)
		if (urlObj.hostname === 'youtu.be') {
			return urlObj.pathname.length > 1;
		}

		// youtube-nocookie.com — only /embed is valid
		if (urlObj.hostname === 'youtube-nocookie.com' || urlObj.hostname.endsWith('.youtube-nocookie.com')) {
			return urlObj.pathname.startsWith('/embed/');
		}

		// youtube.com variants (www., m., music.)
		if (urlObj.hostname === 'youtube.com' || urlObj.hostname.endsWith('.youtube.com')) {
			return /^\/(watch|embed|v|e|shorts|live)(\/|$)/.test(urlObj.pathname);
		}

		return false;
	} catch {
		// Malformed URLs throw, which we treat as invalid
		return false;
	}
}

export type YouTubeUrlKind = 'video' | 'musicTrack' | 'musicCollection';

/**
 * Decides which create flow a URL belongs to. Mirrors the backend's ClassifyURL:
 * music.youtube.com watch links are tracks; its playlist/browse/channel pages are
 * collections (albums, playlists, artists) and cannot be added as one item.
 * Returns null for anything that is not a YouTube URL.
 */
export function classifyYouTubeUrl(url: string): YouTubeUrlKind | null {
	let u: URL;
	try {
		u = new URL(url.trim());
	} catch {
		return null;
	}
	if (u.hostname === 'music.youtube.com') {
		if (u.pathname === '/watch' && /^[\w-]{11}$/.test(u.searchParams.get('v') ?? '')) return 'musicTrack';
		if (/^\/(playlist|browse|channel)(\/|$)/.test(u.pathname)) return 'musicCollection';
		return null;
	}
	return validateYouTubeUrl(url) ? 'video' : null;
}
