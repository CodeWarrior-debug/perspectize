import { describe, it, expect } from 'vitest';
import { DescriptionTooltip } from '$lib/components/DescriptionTooltip';
import { TagsTooltip } from '$lib/components/TagsTooltip';

describe('DescriptionTooltip', () => {
	function createTooltip(data?: Record<string, any>) {
		const tooltip = new DescriptionTooltip();
		tooltip.init({ data } as any);
		return tooltip;
	}

	it('renders description text', () => {
		const tooltip = createTooltip({ description: 'A great video about testing' });
		const el = tooltip.getGui();
		expect(el.textContent).toBe('A great video about testing');
		expect(el.className).toBe('description-tooltip');
	});

	it('shows "No description" when description is empty string', () => {
		const tooltip = createTooltip({ description: '' });
		expect(tooltip.getGui().textContent).toBe('No description');
	});

	it('shows "No description" when description is missing', () => {
		const tooltip = createTooltip({});
		expect(tooltip.getGui().textContent).toBe('No description');
	});

	it('shows "No description" when data is undefined', () => {
		const tooltip = createTooltip(undefined);
		expect(tooltip.getGui().textContent).toBe('No description');
	});
});

describe('TagsTooltip', () => {
	function createTooltip(data?: Record<string, any>) {
		const tooltip = new TagsTooltip();
		tooltip.init({ data } as any);
		return tooltip;
	}

	it('renders tag chips', () => {
		const tooltip = createTooltip({ tags: ['svelte', 'testing'] });
		const el = tooltip.getGui();
		expect(el.className).toBe('tags-tooltip');
		const chips = el.querySelectorAll('.tags-tooltip-chip');
		expect(chips).toHaveLength(2);
		expect(chips[0].textContent).toBe('svelte');
		expect(chips[1].textContent).toBe('testing');
	});

	it('shows "No tags" when tags array is empty', () => {
		const tooltip = createTooltip({ tags: [] });
		expect(tooltip.getGui().textContent).toBe('No tags');
	});

	it('shows "No tags" when tags is missing', () => {
		const tooltip = createTooltip({});
		expect(tooltip.getGui().textContent).toBe('No tags');
	});

	it('shows the static header description when data is undefined (header hover, no row context)', () => {
		const tooltip = createTooltip(undefined);
		expect(tooltip.getGui().textContent).toBe('Tags from YouTube API');
	});

	it('renders single tag', () => {
		const tooltip = createTooltip({ tags: ['solo'] });
		const chips = tooltip.getGui().querySelectorAll('.tags-tooltip-chip');
		expect(chips).toHaveLength(1);
		expect(chips[0].textContent).toBe('solo');
	});
});
