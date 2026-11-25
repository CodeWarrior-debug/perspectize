/**
 * How a numbers-from-a-source cell (views, likes, ...) is shown once the
 * backend says those numbers have aged out (Content.sourceDataExpired).
 *
 * The retention window itself lives only on the backend (SOURCE_DATA_MAX_AGE_DAYS);
 * the client never guesses it, it just reads the flag. All wording lives here so
 * it can be changed in one place, and it deliberately names no provider, no
 * number of days and no policy: the rule can change without the copy going stale.
 */

export type SourceDataCellState =
	/** Numbers are current: render them. */
	| 'fresh'
	/** Aged out and the viewer can refresh them. */
	| 'expired'
	/** Aged out and the viewer is signed out, so they cannot refresh. */
	| 'expired-signed-out'
	/** A refresh is in flight. */
	| 'refreshing';

export function sourceDataCellState(opts: {
	expired: boolean | null | undefined;
	signedIn: boolean;
	refreshing?: boolean;
}): SourceDataCellState {
	if (!opts.expired) return 'fresh';
	if (opts.refreshing) return 'refreshing';
	return opts.signedIn ? 'expired' : 'expired-signed-out';
}

/** Short text standing in for a number that has aged out (never "0" or a bare dash). */
export const SOURCE_DATA_EXPIRED_CELL = 'Refresh to view';

/** Text for the in-flight state. */
export const SOURCE_DATA_REFRESHING_CELL = 'Refreshing…';

/** Label for the call-to-action button. */
export const SOURCE_DATA_REFRESH_LABEL = 'Refresh numbers';

/** Tooltip / helper text explaining the placeholder. */
export function sourceDataExpiredHint(signedIn: boolean): string {
	return signedIn
		? 'These numbers are only kept for a limited time. Refresh to see the latest.'
		: 'These numbers are only kept for a limited time. Sign in to refresh them.';
}

/**
 * What a count cell should display. `formatted` is the normal text for a
 * current value; anything aged out shows the placeholder instead.
 */
export function sourceDataCellText(state: SourceDataCellState, formatted: string): string {
	switch (state) {
		case 'fresh':
			return formatted;
		case 'refreshing':
			return SOURCE_DATA_REFRESHING_CELL;
		default:
			return SOURCE_DATA_EXPIRED_CELL;
	}
}

/** Grid tooltip: the table cannot refresh, so it points at the item's details. */
export const SOURCE_DATA_EXPIRED_GRID_HINT =
	'These numbers are only kept for a limited time. Open the item to refresh them.';
