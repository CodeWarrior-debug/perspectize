import { classifyYouTubeUrl } from './youtube';

/** Mirrors backend/internal/adapters/musiclinks (ADR 0002): the same ids and canonical urls. */
export type MusicProvider = 'youtube' | 'spotify' | 'apple_music' | 'amazon_music';

export interface ParsedMusicLink {
	provider: MusicProvider;
	providerTrackId: string;
	canonicalUrl: string;
	kind: 'LISTEN' | 'EMBED';
	/** From an Apple song slug; a hint the user confirms, never trusted. */
	suggestedTitle: string;
}

export type MusicLinkResult = { ok: true; link: ParsedMusicLink } | { ok: false; reason: 'collection' | 'unsupported' };

export const PROVIDER_LABEL: Record<MusicProvider, string> = {
	youtube: 'YouTube Music',
	spotify: 'Spotify',
	apple_music: 'Apple Music',
	amazon_music: 'Amazon Music',
};

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_URI = /^spotify:track:([A-Za-z0-9]{22})$/;
const APPLE_ID = /^[0-9]{5,15}$/;
const ASIN = /^[A-Z0-9]{10}$/;
const COUNTRY = /^[a-z]{2}$/;
const UNSUPPORTED: MusicLinkResult = { ok: false, reason: 'unsupported' };
const COLLECTION: MusicLinkResult = { ok: false, reason: 'collection' };

const ok = (link: ParsedMusicLink): MusicLinkResult => ({ ok: true, link });
const spotify = (id: string): ParsedMusicLink => ({
	provider: 'spotify',
	providerTrackId: id,
	canonicalUrl: `https://open.spotify.com/track/${id}`,
	kind: 'LISTEN',
	suggestedTitle: '',
});
const titleFromSlug = (slug: string) =>
	slug
		.split('-')
		.filter(Boolean)
		.map((w) => w[0].toUpperCase() + w.slice(1))
		.join(' ');

export function parseMusicLink(input: string): MusicLinkResult {
	const s = input.trim();
	const uri = SPOTIFY_URI.exec(s);
	if (uri) return ok(spotify(uri[1]));
	if (!/^https?:\/\//i.test(s)) return UNSUPPORTED;
	let url: URL;
	try {
		url = new URL(s);
	} catch {
		return UNSUPPORTED;
	}
	const host = url.hostname.toLowerCase();
	let parts = url.pathname.split('/').filter(Boolean);

	if (host === 'open.spotify.com' || host === 'play.spotify.com') {
		if (parts[0]?.startsWith('intl-')) parts = parts.slice(1);
		if (parts[0] === 'track' && SPOTIFY_ID.test(parts[1] ?? '')) return ok(spotify(parts[1]));
		if (['album', 'playlist', 'artist', 'show', 'episode'].includes(parts[0] ?? '')) return COLLECTION;
		return UNSUPPORTED;
	}

	if (host === 'music.apple.com' || host === 'geo.music.apple.com') {
		const [cc, kind, ...rest] = parts;
		if (!cc || !COUNTRY.test(cc)) return UNSUPPORTED;
		const apple = (id: string, title: string) =>
			ok({
				provider: 'apple_music',
				providerTrackId: id,
				canonicalUrl: `https://music.apple.com/${cc}/song/${id}`,
				kind: 'LISTEN',
				suggestedTitle: title,
			});
		if (kind === 'song') {
			if (rest.length === 1 && APPLE_ID.test(rest[0])) return apple(rest[0], '');
			if (rest.length === 2 && APPLE_ID.test(rest[1])) return apple(rest[1], titleFromSlug(rest[0]));
			return UNSUPPORTED;
		}
		if (kind === 'album') {
			const i = url.searchParams.get('i') ?? '';
			return APPLE_ID.test(i) ? apple(i, '') : COLLECTION;
		}
		if (['playlist', 'artist', 'station', 'music-video'].includes(kind ?? '')) return COLLECTION;
		return UNSUPPORTED;
	}

	if (host.startsWith('music.amazon.')) {
		const amazon = (asin: string) =>
			ok({
				provider: 'amazon_music',
				providerTrackId: asin,
				canonicalUrl: `https://${host}/tracks/${asin}`,
				kind: 'LISTEN',
				suggestedTitle: '',
			});
		if (parts[0] === 'tracks') return ASIN.test(parts[1] ?? '') ? amazon(parts[1]) : UNSUPPORTED;
		if (parts[0] === 'albums') {
			const t = url.searchParams.get('trackAsin') ?? '';
			return ASIN.test(t) ? amazon(t) : COLLECTION;
		}
		if (['playlists', 'artists', 'user-playlists', 'podcasts'].includes(parts[0] ?? '')) return COLLECTION;
		return UNSUPPORTED;
	}

	if (host === 'music.youtube.com') {
		const kind = classifyYouTubeUrl(s);
		if (kind === 'musicCollection') return COLLECTION;
		const v = url.searchParams.get('v');
		if (kind === 'musicTrack' && v) {
			return ok({
				provider: 'youtube',
				providerTrackId: v,
				canonicalUrl: `https://music.youtube.com/watch?v=${v}`,
				kind: 'EMBED',
				suggestedTitle: '',
			});
		}
	}
	return UNSUPPORTED;
}

export function providerOfUrl(url: string | null | undefined): MusicProvider | null {
	if (!url) return null;
	const r = parseMusicLink(url);
	return r.ok ? r.link.provider : null;
}
