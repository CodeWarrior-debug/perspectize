import { describe, it, expect } from 'vitest';
import {
	SOURCE_DATA_EXPIRED_CELL,
	SOURCE_DATA_REFRESHING_CELL,
	sourceDataCellState,
	sourceDataCellText,
	sourceDataExpiredHint,
} from '#lib/utils/sourceDataExpiry.js';

describe('sourceDataCellState', () => {
	it('is fresh whenever the backend has not flagged the row, signed in or not', () => {
		expect(sourceDataCellState({ expired: false, signedIn: true })).toBe('fresh');
		expect(sourceDataCellState({ expired: false, signedIn: false })).toBe('fresh');
		expect(sourceDataCellState({ expired: undefined, signedIn: true })).toBe('fresh');
		expect(sourceDataCellState({ expired: null, signedIn: false })).toBe('fresh');
	});

	it('is expired for a signed-in viewer who can refresh', () => {
		expect(sourceDataCellState({ expired: true, signedIn: true })).toBe('expired');
	});

	it('is expired-signed-out for a viewer who cannot refresh', () => {
		expect(sourceDataCellState({ expired: true, signedIn: false })).toBe('expired-signed-out');
	});

	it('is refreshing while a refresh is in flight', () => {
		expect(sourceDataCellState({ expired: true, signedIn: true, refreshing: true })).toBe('refreshing');
	});

	it('ignores a stray refreshing flag on a fresh row', () => {
		expect(sourceDataCellState({ expired: false, signedIn: true, refreshing: true })).toBe('fresh');
	});
});

describe('sourceDataCellText', () => {
	it('shows the number when fresh', () => {
		expect(sourceDataCellText('fresh', '1.2 K')).toBe('1.2 K');
	});

	it('never shows a number, 0 or a bare dash for an expired cell', () => {
		for (const state of ['expired', 'expired-signed-out'] as const) {
			const text = sourceDataCellText(state, '0');
			expect(text).toBe(SOURCE_DATA_EXPIRED_CELL);
			expect(text).not.toMatch(/^[0—-]$/);
		}
	});

	it('shows progress while refreshing', () => {
		expect(sourceDataCellText('refreshing', '5')).toBe(SOURCE_DATA_REFRESHING_CELL);
	});
});

describe('sourceDataExpiredHint', () => {
	it('invites a refresh when signed in and a sign-in when not', () => {
		expect(sourceDataExpiredHint(true)).toMatch(/Refresh/);
		expect(sourceDataExpiredHint(false)).toMatch(/Sign in/);
	});

	it('names no provider, number of days or policy, so it cannot go stale', () => {
		for (const signedIn of [true, false]) {
			expect(sourceDataExpiredHint(signedIn)).not.toMatch(/youtube|google|api|policy|\d/i);
		}
	});
});
