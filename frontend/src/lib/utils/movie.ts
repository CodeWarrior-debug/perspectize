// Mirrors backend/internal/adapters/tmdb/parse.go ParseMovieInput: the client
// must never reject something the server accepts. Patterns are deliberately
// unanchored at the front, exactly as on the server.
const TMDB_MOVIE_RE = /themoviedb\.org\/movie\/(\d+)(?:[-/?#]|$)/i;
const IMDB_URL_RE = /imdb\.com\/title\/(tt\d{5,})(?:[/?#]|$)/i;
const IMDB_ID_RE = /^tt\d{5,}$/;

const MAX_INT64 = 9223372036854775807n;

/**
 * True when the input is a TMDB movie URL (with or without scheme/slug), an
 * IMDb title URL, or a bare IMDb id like `tt0133093`.
 */
export function validateMovieInput(raw: string): boolean {
	const s = raw.trim();
	const tmdb = TMDB_MOVIE_RE.exec(s);
	if (tmdb) {
		// The server parses the id with Atoi and requires > 0.
		const id = BigInt(tmdb[1]);
		return id > 0n && id <= MAX_INT64;
	}
	if (IMDB_URL_RE.test(s)) return true;
	return IMDB_ID_RE.test(s.toLowerCase());
}

/**
 * The server's message when it rejected the movie as not allowed (extensions.code
 * CONTENT_NOT_ALLOWED, e.g. NC-17), verbatim; null for every other error. Reads the
 * graphql-request ClientError shape (`error.response.errors[0]`).
 */
export function contentNotAllowedMessage(error: unknown): string | null {
	const first = (error as { response?: { errors?: unknown[] } } | null | undefined)?.response?.errors?.[0] as
		{ message?: unknown; extensions?: { code?: unknown } } | undefined;
	if (first?.extensions?.code !== 'CONTENT_NOT_ALLOWED') return null;
	return typeof first.message === 'string' && first.message !== '' ? first.message : null;
}
