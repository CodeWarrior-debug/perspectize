import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildPopoverState, createHoverController } from '$lib/utils/tooltipHover';
import { formatCountExact, percentLikedTooltip, percentLikedValueGetter } from '$lib/utils/formatting';
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

	it('likes-style override copies the raw number without commas', () => {
		const spec = {
			text: (c: any) => formatCountExact(c.data?.likeCount ?? null),
			copyValue: (c: any) => c.data?.likeCount,
		};
		const s = buildPopoverState({
			colDef: { context: { tooltipSpec: spec } },
			value: 1234567,
			valueFormatted: '1.2M',
			data: { likeCount: 1234567 },
			cellEl,
		});
		expect(s?.copy).toBe('1234567');
		expect(s?.text).toContain(',');
	});

	it('tags-style multi mode returns items and no copy', () => {
		const s = buildPopoverState({
			colDef: { context: { tooltipSpec: { mode: 'multi', items: (c: any) => c.data?.tags ?? [] } } },
			value: ['a', 'b'],
			data: { tags: ['a', 'b'] },
			cellEl,
		});
		expect(s).toMatchObject({ mode: 'multi', items: ['a', 'b'], copy: null, text: '' });
	});
});

describe('buildPopoverState column specs', () => {
	const mk = (tooltipSpec: any, data: any, value: unknown = undefined, valueFormatted: string | null = null) =>
		buildPopoverState({ colDef: { context: { tooltipSpec } }, value, valueFormatted, data, cellEl });

	it('item column shows the name despite undefined value', () => {
		const s = mk({ text: (c: any) => c.data?.name ?? '', copyValue: (c: any) => c.data?.name ?? '' }, { name: 'Vid' });
		expect(s).toMatchObject({ text: 'Vid', copy: 'Vid' });
	});

	it('category column shows the primary category label', () => {
		const s = mk(
			{
				text: (c: any) => c.data?.primaryCategory?.label ?? '',
				copyValue: (c: any) => c.data?.primaryCategory?.label ?? '',
			},
			{ primaryCategory: { label: 'Music' } },
		);
		expect(s).toMatchObject({ text: 'Music', copy: 'Music' });
	});

	it('default column with null valueFormatted falls back to value', () => {
		expect(mk(undefined, {}, 42, null)).toMatchObject({ text: '42', copy: '42' });
	});

	it('description column shows full description', () => {
		const s = mk({ text: (c: any) => c.data?.description ?? '' }, { description: 'long text' }, 'long...');
		expect(s?.text).toBe('long text');
	});

	it('percent liked uses tooltip text and raw value for copy', () => {
		const data = { likeCount: 1, viewCount: 4 };
		const s = mk(
			{
				text: (c: any) => percentLikedTooltip({ data: c.data }),
				copyValue: (c: any) => percentLikedValueGetter({ data: c.data }),
			},
			data,
		);
		expect(s?.text).toBe(percentLikedTooltip({ data } as any));
		expect(s?.copy).toBe(String(percentLikedValueGetter({ data } as any)));
	});
});

describe('buildPopoverState empty states', () => {
	const tags = { tooltipSpec: { mode: 'multi' as const, emptyText: 'No tags', items: (c: any) => c.data?.tags ?? [] } };
	const desc = { tooltipSpec: { emptyText: 'No description', text: (c: any) => c.data?.description ?? '' } };

	it('tags [] gives the No tags popover with no copy and no items', () => {
		const s = buildPopoverState({ colDef: { context: tags }, value: null, data: { tags: [] }, cellEl });
		expect(s).toMatchObject({ mode: 'single', text: 'No tags', copy: null, items: [] });
	});

	it('tags missing gives the No tags popover', () => {
		const s = buildPopoverState({ colDef: { context: tags }, value: null, data: {}, cellEl });
		expect(s).toMatchObject({ mode: 'single', text: 'No tags', copy: null, items: [] });
	});

	it('tags with items stays multi with items', () => {
		const s = buildPopoverState({ colDef: { context: tags }, value: null, data: { tags: ['a', 'b'] }, cellEl });
		expect(s).toMatchObject({ mode: 'multi', items: ['a', 'b'] });
	});

	it('description empty gives No description with no copy', () => {
		const s = buildPopoverState({ colDef: { context: desc }, value: '', data: { description: '' }, cellEl });
		expect(s).toMatchObject({ mode: 'single', text: 'No description', copy: null, items: [] });
	});

	it('description present is unchanged', () => {
		const s = buildPopoverState({ colDef: { context: desc }, value: 'x', data: { description: 'hello' }, cellEl });
		expect(s).toMatchObject({ mode: 'single', text: 'hello', items: [] });
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
