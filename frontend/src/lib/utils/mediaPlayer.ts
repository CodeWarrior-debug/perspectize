import type { RelatedMedia } from '$lib/queries/content';

export const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

// Ticket 03: only these mark a link unavailable (per link, never re-checked in v1).
const MARK_UNAVAILABLE = new Set([101, 150]);
// "This upload will not play here": try the next upload of the same song.
const SKIP_TO_NEXT = new Set([100, 101, 150]);
// 153 = the embed got no referrer: our setup, not the song. Never marks anything.
const CONFIG_ERROR = 153;

const KIND_ORDER: Record<string, number> = { audio: 0, official_video: 1, lyric_video: 2, other: 3, live: 4 };

/**
 * Video IDs to try, in order: the track's own upload first, then related
 * uploads (studio audio before videos, live last). Skips ones already known
 * to be unplayable, and duplicates.
 */
export function playbackQueue(primaryVideoId: string | null, related: RelatedMedia[]): string[] {
	const ids: string[] = primaryVideoId ? [primaryVideoId] : [];
	const rest = related
		.filter((r) => r.provider === 'youtube' && !r.unavailable)
		.sort((a, b) => (KIND_ORDER[a.kind] ?? 3) - (KIND_ORDER[b.kind] ?? 3));
	for (const r of rest) if (!ids.includes(r.videoId)) ids.push(r.videoId);
	return ids;
}

export type EmbedEvent =
	| { type: 'unplayable'; code: number; markUnavailable: boolean }
	| { type: 'config'; code: number }
	| { type: 'error'; code: number }
	| { type: 'playing' }
	| { type: 'paused' }
	| { type: 'ended' }
	| null;

const STATE_EVENTS: Record<number, EmbedEvent> = {
	0: { type: 'ended' },
	1: { type: 'playing' },
	2: { type: 'paused' },
};

/** Reads a postMessage from a youtube-nocookie embed (enablejsapi=1). Ignores everything else. */
export function parseEmbedMessage(origin: string, data: unknown): EmbedEvent {
	if (origin !== EMBED_ORIGIN || typeof data !== 'string') return null;
	let msg: { event?: string; info?: unknown };
	try {
		msg = JSON.parse(data);
	} catch {
		return null;
	}
	if (msg?.event === 'onError' && typeof msg.info === 'number') {
		if (msg.info === CONFIG_ERROR) return { type: 'config', code: msg.info };
		if (SKIP_TO_NEXT.has(msg.info))
			return { type: 'unplayable', code: msg.info, markUnavailable: MARK_UNAVAILABLE.has(msg.info) };
		return { type: 'error', code: msg.info };
	}
	if (msg?.event === 'onStateChange' && typeof msg.info === 'number') return STATE_EVENTS[msg.info] ?? null;
	if (msg?.event === 'infoDelivery' && msg.info && typeof msg.info === 'object') {
		const state = (msg.info as { playerState?: unknown }).playerState;
		return typeof state === 'number' ? (STATE_EVENTS[state] ?? null) : null;
	}
	return null;
}

/** Sent on iframe load: the embed only posts events after the parent says it is listening. */
export const LISTEN_COMMAND = JSON.stringify({ event: 'listening', id: 'perspectize-player' });
export const PAUSE_COMMAND = JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] });

export function embedUrl(videoId: string, pageOrigin: string): string {
	// autoplay=0: nothing plays until the user presses play (ticket 03).
	const q = new URLSearchParams({ enablejsapi: '1', origin: pageOrigin, rel: '0', modestbranding: '1', autoplay: '0' });
	return `${EMBED_ORIGIN}/embed/${encodeURIComponent(videoId)}?${q}`;
}

/** Mirrors the backend's rule: re-check never-checked or old "not found" results; trust found ones. */
export function lyricsNeedRecheck(lyrics: { available: boolean; checkedAt: string } | null, now = Date.now()): boolean {
	if (!lyrics) return true;
	if (lyrics.available) return false;
	return now - Date.parse(lyrics.checkedAt) > 30 * 24 * 60 * 60 * 1000;
}
