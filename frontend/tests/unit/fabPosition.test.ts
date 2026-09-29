import { beforeEach, describe, expect, it } from 'vitest';
import {
	FAB_MARGIN,
	FAB_POSITION_KEY,
	FAB_SIZE,
	clampFabPosition,
	loadFabPosition,
	saveFabPosition,
} from '$lib/components/messaging/fabPosition';

describe('clampFabPosition', () => {
	it('leaves an in-bounds position alone', () => {
		expect(clampFabPosition({ right: 100, bottom: 200 }, 1000, 800)).toEqual({ right: 100, bottom: 200 });
	});

	it('pulls an off-screen position back inside the viewport', () => {
		const max = { right: 400 - FAB_SIZE - FAB_MARGIN, bottom: 600 - FAB_SIZE - FAB_MARGIN };
		expect(clampFabPosition({ right: 5000, bottom: 5000 }, 400, 600)).toEqual(max);
		expect(clampFabPosition({ right: -50, bottom: -50 }, 400, 600)).toEqual({ right: FAB_MARGIN, bottom: FAB_MARGIN });
	});
});

describe('fab position persistence', () => {
	beforeEach(() => localStorage.clear());

	it('round-trips through localStorage', () => {
		saveFabPosition({ right: 33, bottom: 44 });
		expect(loadFabPosition()).toEqual({ right: 33, bottom: 44 });
	});

	it('returns null when nothing is stored', () => {
		expect(loadFabPosition()).toBeNull();
	});

	it('ignores corrupt or malformed values', () => {
		localStorage.setItem(FAB_POSITION_KEY, '{not json');
		expect(loadFabPosition()).toBeNull();
		localStorage.setItem(FAB_POSITION_KEY, JSON.stringify({ right: 'x', bottom: 1 }));
		expect(loadFabPosition()).toBeNull();
	});
});
