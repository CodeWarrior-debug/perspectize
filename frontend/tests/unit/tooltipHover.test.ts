import { describe, it, expect } from 'vitest';
import { buildPopoverState } from '$lib/utils/tooltipHover';
import { formatCountExact } from '$lib/utils/formatting';

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
		expect(
			buildPopoverState({ colDef: { context: { tooltipSpec: false } }, value: 'x', data: {}, cellEl })
		).toBeNull();
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
