import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildPopoverState, createHoverController } from '$lib/utils/tooltipHover';
import { formatCountExact, percentLikedTooltip, percentLikedValueGetter } from '$lib/utils/formatting';
import { ACTIVITY_TOOLTIP_SPECS } from '$lib/utils/activityTooltipSpecs';
import type { PopoverState } from '$lib/components/CellPopover.svelte';

const cellEl = document.createElement('div');

describe('buildPopoverState', () => {
	it('default column uses formatted value for text and raw value for copy', () => {
		const s = buildPopoverState({
			colDef: {},
			value: 1234,
			valueFormatted: '1.2K',
			data: {},
			cellEl,
		});
		expect(s).toMatchObject({ mode: 'single', text: '1.2K', copy: '1234', anchor: cellEl });
	});

	it('tooltipSpec false returns null', () => {
		expect(buildPopoverState({ colDef: { context: { tooltipSpec: false } }, value: 'x', data: {}, cellEl })).toBeNull();
	});

	it('whitespace-only text is treated as empty', () => {
		expect(buildPopoverState({ colDef: {}, value: '   ', valueFormatted: '  ', cellEl })).toBeNull();
		const s = buildPopoverState({
			colDef: { context: { tooltipSpec: { emptyText: 'None', text: () => ' \n ' } } },
			value: 'x',
			cellEl,
		});
		expect(s).toMatchObject({ text: 'None', copy: null });
	});
});

describe('ACTIVITY_TOOLTIP_SPECS (real column specs)', () => {
	const S = ACTIVITY_TOOLTIP_SPECS;
	const mk = (key: keyof typeof S, data: any, value: unknown = undefined, valueFormatted: string | null = null) =>
		buildPopoverState({ colDef: { context: { tooltipSpec: S[key] } }, value, valueFormatted, data, cellEl });

	it('has an entry for every specced column id', () => {
		// Limitation: asserts the map, not that ActivityTable columnDefs reference it (AG Grid does not render in jsdom).
		expect(Object.keys(S).sort()).toEqual(
			['category', 'description', 'item', 'likes', 'percentLiked', 'perspectize', 'tags', 'views'].sort(),
		);
		expect(S.perspectize).toBe(false);
		for (const k of Object.keys(S) as (keyof typeof S)[]) expect(S[k]).toBeDefined();
	});

	it('perspectize opts out', () => {
		expect(mk('perspectize', {})).toBeNull();
	});

	it('item shows the name despite undefined value', () => {
		expect(mk('item', { name: 'Vid' })).toMatchObject({ text: 'Vid', copy: 'Vid' });
	});

	it('category shows the primary category label', () => {
		expect(mk('category', { primaryCategory: { label: 'Music' } })).toMatchObject({ text: 'Music', copy: 'Music' });
	});

	it('views shows exact count and copies the raw number without commas', () => {
		const s = mk('views', { viewCount: 1234567 }, 1234567, '1.2M');
		expect(s?.text).toBe(formatCountExact(1234567));
		expect(s?.text).toContain(',');
		expect(s?.copy).toBe('1234567');
	});

	it('likes shows exact count and copies the raw number without commas', () => {
		const s = mk('likes', { likeCount: 9876543 }, 9876543, '9.9M');
		expect(s?.text).toBe(formatCountExact(9876543));
		expect(s?.copy).toBe('9876543');
	});

	it('percentLiked uses tooltip text and raw value for copy', () => {
		const data = { likeCount: 1, viewCount: 4 };
		const s = mk('percentLiked', data);
		expect(s?.text).toBe(percentLikedTooltip({ data } as any));
		expect(s?.copy).toBe(String(percentLikedValueGetter({ data } as any)));
	});

	it('tags with items is multi with no copy', () => {
		expect(mk('tags', { tags: ['a', 'b'] })).toMatchObject({ mode: 'multi', items: ['a', 'b'], copy: null, text: '' });
	});

	it('tags empty or missing gives No tags', () => {
		expect(mk('tags', { tags: [] })).toMatchObject({ mode: 'single', text: 'No tags', copy: null, items: [] });
		expect(mk('tags', {})).toMatchObject({ mode: 'single', text: 'No tags', copy: null, items: [] });
	});

	it('description shows full text, or No description when empty', () => {
		expect(mk('description', { description: 'long text' }, 'long...')?.text).toBe('long text');
		expect(mk('description', { description: '' }, '')).toMatchObject({ text: 'No description', copy: null });
	});

	it('default column with null valueFormatted falls back to value', () => {
		expect(buildPopoverState({ colDef: {}, value: 42, valueFormatted: null, data: {}, cellEl })).toMatchObject({
			text: '42',
			copy: '42',
		});
	});

	it('empty text with no emptyText returns null', () => {
		expect(buildPopoverState({ colDef: {}, value: '', cellEl })).toBeNull();
	});
});

describe('createHoverController', () => {
	afterEach(() => vi.useRealTimers());

	function setup() {
		vi.useFakeTimers();
		let state: PopoverState | null = null;
		const ctl = createHoverController({
			getState: () => state,
			setState: (s) => (state = s),
			openDelay: 600,
			closeDelay: 150,
		});
		const cell = (name: string) => {
			const el = document.createElement('div');
			return { el, build: () => ({ anchor: el, mode: 'single', text: name, copy: null, items: [] }) as PopoverState };
		};
		return { ctl, get: () => state, cell };
	}

	it('opens after 600ms', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(599);
		expect(get()).toBeNull();
		vi.advanceTimersByTime(1);
		expect(get()?.text).toBe('a');
	});

	it('repeated hover on the same cell keeps the same state object', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		const first = get();
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(1000);
		expect(get()).toBe(first);
	});

	it('closes 150ms after leave', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		ctl.leave();
		vi.advanceTimersByTime(149);
		expect(get()).not.toBeNull();
		vi.advanceTimersByTime(1);
		expect(get()).toBeNull();
	});

	it('enter cancels the pending close', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		ctl.leave();
		ctl.enter();
		vi.advanceTimersByTime(1000);
		expect(get()?.text).toBe('a');
	});

	it('moving from cell A to cell B opens B', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		const b = cell('b');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		ctl.leave();
		ctl.hover(b.el, b.build);
		vi.advanceTimersByTime(600);
		expect(get()?.text).toBe('b');
	});

	it('moving A to B closes A immediately, then opens B after 600ms', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		const b = cell('b');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		expect(get()?.text).toBe('a');
		ctl.hover(b.el, b.build);
		vi.advanceTimersByTime(100);
		expect(get()?.text).toBe('a');
		vi.advanceTimersByTime(50);
		expect(get()).toBeNull();
		vi.advanceTimersByTime(449);
		expect(get()).toBeNull();
		vi.advanceTimersByTime(1);
		expect(get()?.text).toBe('b');
	});

	it('late cell mouse-out after enter does not close', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		ctl.enter();
		ctl.leave();
		vi.advanceTimersByTime(1000);
		expect(get()?.text).toBe('a');
	});

	it('popoverLeave closes after closeDelay', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		ctl.enter();
		ctl.popoverLeave();
		vi.advanceTimersByTime(149);
		expect(get()).not.toBeNull();
		vi.advanceTimersByTime(1);
		expect(get()).toBeNull();
	});

	it('enter before close delay keeps A and cancels B open', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		const b = cell('b');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		ctl.hover(b.el, b.build);
		vi.advanceTimersByTime(50);
		ctl.enter();
		vi.advanceTimersByTime(1000);
		expect(get()?.text).toBe('a');
	});

	it('close resets the inside flag so later leave closes', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		ctl.enter();
		ctl.close();
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		ctl.leave();
		vi.advanceTimersByTime(150);
		expect(get()).toBeNull();
	});

	it('destroy resets the inside flag', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		ctl.enter();
		ctl.destroy();
		ctl.leave();
		vi.advanceTimersByTime(150);
		expect(get()).toBeNull();
	});

	it('moving A to an opted-out cell leaves no popover', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		const off = document.createElement('div');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		ctl.hover(off, () => null);
		vi.advanceTimersByTime(2000);
		expect(get()).toBeNull();
	});

	it('repeated hover on a pending cell does not restart the open timer', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(300);
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(299);
		expect(get()).toBeNull();
		vi.advanceTimersByTime(1);
		expect(get()?.text).toBe('a');
	});

	it('close closes an open popover immediately', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		ctl.close();
		expect(get()).toBeNull();
	});

	it('close cancels a pending open', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(300);
		ctl.close();
		vi.advanceTimersByTime(1000);
		expect(get()).toBeNull();
	});

	it('destroy clears both timers', () => {
		const { ctl, get, cell } = setup();
		const a = cell('a');
		ctl.hover(a.el, a.build);
		ctl.destroy();
		vi.advanceTimersByTime(1000);
		expect(get()).toBeNull();
		ctl.hover(a.el, a.build);
		vi.advanceTimersByTime(600);
		ctl.leave();
		ctl.destroy();
		vi.advanceTimersByTime(1000);
		expect(get()).not.toBeNull();
	});
});
