import type { RelatedMedia } from '$lib/queries/content';

export const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

// Embed errors that mean "this video will never play here": 100 removed/private,
// 101 and 150 embedding disabled by the owner (often a label), 153 missing referrer.
const UNPLAYABLE = new Set([100, 101, 150, 153]);

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

export type EmbedEvent = { type: 'unplayable'; code: number } | { type: 'error'; code: number } | null;

/** Reads a postMessage from a youtube-nocookie embed (enablejsapi=1). Ignores everything else. */
export function parseEmbedMessage(origin: string, data: unknown): EmbedEvent {
	if (origin !== EMBED_ORIGIN || typeof data !== 'string') return null;
	let msg: { event?: string; info?: unknown };
	try {
		msg = JSON.parse(data);
	} catch {
		return null;
	}
	if (msg?.event !== 'onError' || typeof msg.info !== 'number') return null;
	return UNPLAYABLE.has(msg.info) ? { type: 'unplayable', code: msg.info } : { type: 'error', code: msg.info };
}

export function embedUrl(videoId: string, pageOrigin: string): string {
	const q = new URLSearchParams({ enablejsapi: '1', origin: pageOrigin, rel: '0', modestbranding: '1' });
	return `${EMBED_ORIGIN}/embed/${encodeURIComponent(videoId)}?${q}`;
}

/** Mirrors the backend's rule: re-check never-checked or old "not found" results; trust found ones. */
export function lyricsNeedRecheck(lyrics: { available: boolean; checkedAt: string } | null, now = Date.now()): boolean {
	if (!lyrics) return true;
	if (lyrics.available) return false;
	return now - Date.parse(lyrics.checkedAt) > 30 * 24 * 60 * 60 * 1000;
}
