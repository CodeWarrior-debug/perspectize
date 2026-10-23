import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHART_SETTINGS_KEY, isChartOn, loadChartFlags, setChartFlag } from '$lib/utils/columnChartSettings';
import { COLUMN_LAYOUTS_KEY } from '$lib/utils/columnLayouts';

describe('columnChartSettings', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('uses its own key, distinct from the column layouts key', () => {
		expect(CHART_SETTINGS_KEY).toBe('perspectize.columnCharts');
		expect(CHART_SETTINGS_KEY).not.toBe(COLUMN_LAYOUTS_KEY);
	});

	it('returns {} when the key is missing', () => {
		expect(loadChartFlags()).toEqual({});
	});

	it('returns {} for malformed JSON', () => {
		localStorage.setItem(CHART_SETTINGS_KEY, '{not json');
		expect(loadChartFlags()).toEqual({});
	});

	it('returns {} for a wrong version', () => {
		localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify({ version: 2, flags: { views: true } }));
		expect(loadChartFlags()).toEqual({});
	});

	it('returns {} when flags is not a boolean map', () => {
		localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify({ version: 1, flags: { views: 'yes' } }));
		expect(loadChartFlags()).toEqual({});
		localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify({ version: 1, flags: [true] }));
		expect(loadChartFlags()).toEqual({});
	});

	it('does not overwrite data it does not understand on read', () => {
		const raw = JSON.stringify({ version: 2, flags: { views: true } });
		localStorage.setItem(CHART_SETTINGS_KEY, raw);
		loadChartFlags();
		expect(localStorage.getItem(CHART_SETTINGS_KEY)).toBe(raw);
	});

	it('defaults isChartOn to false', () => {
		expect(isChartOn('views')).toBe(false);
	});

	it('persists a flag and reads it back, per column', () => {
		setChartFlag('views', true);
		expect(isChartOn('views')).toBe(true);
		expect(isChartOn('likes')).toBe(false);
		expect(JSON.parse(localStorage.getItem(CHART_SETTINGS_KEY)!)).toEqual({ version: 1, flags: { views: true } });
	});

	it('turns a flag off and keeps other flags', () => {
		setChartFlag('views', true);
		setChartFlag('likes', true);
		setChartFlag('views', false);
		expect(loadChartFlags()).toEqual({ views: false, likes: true });
	});

	it('leaves the column layouts value untouched', () => {
		const layouts = JSON.stringify({ general: { views: true } });
		localStorage.setItem(COLUMN_LAYOUTS_KEY, layouts);
		setChartFlag('views', true);
		expect(localStorage.getItem(COLUMN_LAYOUTS_KEY)).toBe(layouts);
	});

	it('does not throw when setItem throws', () => {
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('quota');
		});
		expect(() => setChartFlag('views', true)).not.toThrow();
	});

	it('does not throw when getItem throws', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('denied');
		});
		expect(loadChartFlags()).toEqual({});
		expect(isChartOn('views')).toBe(false);
	});

	it('does not overwrite a wrong-version value on write', () => {
		const raw = '{"version":2,"flags":{"views":true}}';
		localStorage.setItem(CHART_SETTINGS_KEY, raw);
		setChartFlag('likes', true);
		expect(localStorage.getItem(CHART_SETTINGS_KEY)).toBe(raw);
	});

	it('does not overwrite unparseable text on write', () => {
		const raw = '{not json';
		localStorage.setItem(CHART_SETTINGS_KEY, raw);
		setChartFlag('likes', true);
		expect(localStorage.getItem(CHART_SETTINGS_KEY)).toBe(raw);
	});

	it('does not overwrite a wrong-shape value on write', () => {
		const raw = '{"version":1,"flags":{"views":"yes"}}';
		localStorage.setItem(CHART_SETTINGS_KEY, raw);
		setChartFlag('likes', true);
		expect(localStorage.getItem(CHART_SETTINGS_KEY)).toBe(raw);
	});

	it('skips the write when the read throws', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('denied');
		});
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		setChartFlag('views', true);
		expect(setItem).not.toHaveBeenCalled();
	});
});
