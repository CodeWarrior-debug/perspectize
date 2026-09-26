/**
 * The assistant (Jeeves) sidebar is dev-only for now: it renders only when
 * VITE_JEEVES_DEV=true at build time, and the backend must also run with
 * JEEVES_ENABLED=true. Production builds leave it unset, so the feature is dark.
 */
export const JEEVES_DEV = import.meta.env.VITE_JEEVES_DEV === 'true';

/** What users see unless they rename the assistant (renaming comes later). */
export const ASSISTANT_NAME = 'Jeevesbot';

/** Maps a pathname to the page slug the backend uses to pick page tools. */
export function pageForPath(pathname: string): string {
	if (pathname === '/') return 'activity';
	const first = pathname.split('/').filter(Boolean)[0] ?? '';
	return first.slice(0, 64);
}
