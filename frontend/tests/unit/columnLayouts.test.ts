import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
	COLUMN_LAYOUTS_KEY,
	columnViewFor,
	loadLayout,
	saveLayout,
	clearLayout,
	defaultLayout,
	planColumnSwitch,
} from '$lib/utils/columnLayouts';
import { togglableColIds } from '$lib/utils/grid-config';

describe('columnViewFor', () => {
	it('is movie only when the type filter is exactly MOVIE', () => {
		expect(columnViewFor('movie')).toBe('movie');
		expect(columnViewFor(' MOVIE ')).toBe('movie');
	});

	it('is general for no filter, another single type, or several types', () => {
		expect(columnViewFor(undefined)).toBe('general');
		expect(columnViewFor('youtube')).toBe('general');
		expect(columnViewFor('bible_passage')).toBe('general');
		expect(columnViewFor('movie,youtube')).toBe('general');
	});
});

describe('layout storage', () => {
	beforeEach(() => localStorage.clear());
	afterEach(() => vi.restoreAllMocks());

	it('a view with nothing saved has no layout', () => {
		expect(loadLayout('movie')).toBeNull();
	});

	it('saves and loads each view separately', () => {
		saveLayout('movie', { cast: false });
		saveLayout('general', { channel: true });
		expect(loadLayout('movie')).toEqual({ cast: false });
		expect(loadLayout('general')).toEqual({ channel: true });
	});

	it('clearing one view leaves the other', () => {
		saveLayout('movie', { cast: false });
		saveLayout('general', { channel: true });
		clearLayout('movie');
		expect(loadLayout('movie')).toBeNull();
		expect(loadLayout('general')).toEqual({ channel: true });
	});

	it('corrupt JSON falls back to no layout', () => {
		localStorage.setItem(COLUMN_LAYOUTS_KEY, '{not json');
		expect(loadLayout('movie')).toBeNull();
	});

	it('a stored value of the wrong shape is ignored', () => {
		localStorage.setItem(COLUMN_LAYOUTS_KEY, JSON.stringify({ movie: { cast: 'yes' } }));
		expect(loadLayout('movie')).toBeNull();
		localStorage.setItem(COLUMN_LAYOUTS_KEY, JSON.stringify([1, 2]));
		expect(loadLayout('movie')).toBeNull();
	});

	it('storage that throws never breaks the table', () => {
		for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
			vi.spyOn(localStorage, method).mockImplementation(() => {
				throw new Error('denied');
			});
		}
		expect(() => saveLayout('movie', { cast: true })).not.toThrow();
		expect(loadLayout('movie')).toBeNull();
		expect(() => clearLayout('movie')).not.toThrow();
	});
});

describe('defaultLayout', () => {
	it('covers every column a user or admin can toggle', () => {
		const layout = defaultLayout('lg', 'general');
		for (const colId of togglableColIds(true)) expect(layout).toHaveProperty(colId);
	});

	it('shows the Movie set (with Type) in the movie view and hides YouTube-only columns', () => {
		const layout = defaultLayout('lg', 'movie');
		expect(layout.type).toBe(true);
		expect(layout.cast).toBe(true);
		expect(layout.boxOffice).toBe(true);
		expect(layout.channel).toBe(false);
	});

	it('hides picker-only columns such as Date Added', () => {
		expect(defaultLayout('lg', 'general').createdAt).toBe(false);
	});
});

describe('planColumnSwitch', () => {
	const generalDefaults = defaultLayout('lg', 'general');
	const movieDefaults = defaultLayout('lg', 'movie');

	it('first load applies the view without a toast', () => {
		const plan = planColumnSwitch({
			prevView: null,
			view: 'movie',
			current: generalDefaults,
			saved: null,
			defaults: movieDefaults,
		});
		expect(plan).toEqual({ apply: movieDefaults, toast: false });
	});

	it('staying in the same view (resize, remount) never toasts', () => {
		const plan = planColumnSwitch({
			prevView: 'general',
			view: 'general',
			current: { ...generalDefaults, views: false },
			saved: null,
			defaults: generalDefaults,
		});
		expect(plan.toast).toBe(false);
	});

	it('default to default with different columns toasts', () => {
		const plan = planColumnSwitch({
			prevView: 'general',
			view: 'movie',
			current: generalDefaults,
			saved: null,
			defaults: movieDefaults,
		});
		expect(plan).toEqual({ apply: movieDefaults, toast: true });
	});

	it('custom to default applies the defaults and toasts', () => {
		const custom = { ...generalDefaults, description: true, views: false };
		const plan = planColumnSwitch({
			prevView: 'general',
			view: 'movie',
			current: custom,
			saved: null,
			defaults: movieDefaults,
		});
		expect(plan).toEqual({ apply: movieDefaults, toast: true });
	});

	it('switching to a view with a saved setup restores it', () => {
		const savedMovie = { ...movieDefaults, cast: false, budget: true };
		const plan = planColumnSwitch({
			prevView: 'general',
			view: 'movie',
			current: generalDefaults,
			saved: savedMovie,
			defaults: movieDefaults,
		});
		expect(plan).toEqual({ apply: savedMovie, toast: true });
	});

	it('a switch that leaves every column as it was does not toast', () => {
		const plan = planColumnSwitch({
			prevView: 'general',
			view: 'movie',
			current: movieDefaults,
			saved: null,
			defaults: movieDefaults,
		});
		expect(plan.toast).toBe(false);
	});

	it('a column missing from the current state counts as hidden', () => {
		const plan = planColumnSwitch({
			prevView: 'general',
			view: 'movie',
			current: {},
			saved: { cast: false },
			defaults: movieDefaults,
		});
		expect(plan.toast).toBe(false);
	});
});
