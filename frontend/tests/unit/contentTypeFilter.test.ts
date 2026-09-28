import { describe, it, expect, vi } from 'vitest';
import type { IFilterParams } from '@ag-grid-community/core';
import { ContentTypeFilter } from '$lib/utils/contentTypeFilter';
import { CONTENT_TYPE_OPTIONS, contentTypeLabel } from '$lib/utils/grid-config';

function setup() {
	const filterChangedCallback = vi.fn();
	const filter = new ContentTypeFilter();
	filter.init({ filterChangedCallback } as unknown as IFilterParams);
	// Mounted like AG Grid's popup would be — a detached checkbox fires no change event.
	document.body.replaceChildren(filter.getGui());
	const checkbox = (value: string) => filter.getGui().querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
	return { filter, filterChangedCallback, checkbox };
}

const pass = (filter: ContentTypeFilter, contentType: string) =>
	filter.doesFilterPass({ data: { contentType }, node: {} } as never);

describe('CONTENT_TYPE_OPTIONS', () => {
	it('lists every enabled content type with a display label (Claim is hidden until the UI is ready)', () => {
		expect(CONTENT_TYPE_OPTIONS).toEqual([
			{ value: 'youtube', label: 'YouTube' },
			{ value: 'bible_passage', label: 'Bible Passage' },
		]);
	});

	it('contentTypeLabel falls back to the raw value for an unknown type', () => {
		expect(contentTypeLabel('bible_passage')).toBe('Bible Passage');
		expect(contentTypeLabel('podcast')).toBe('podcast');
	});
});

describe('ContentTypeFilter', () => {
	it('renders one labelled checkbox per content type', () => {
		const { filter } = setup();
		const labels = [...filter.getGui().querySelectorAll('label')].map((l) => l.textContent);
		expect(labels).toEqual(['YouTube', 'Bible Passage']);
	});

	it('is inactive with nothing ticked', () => {
		const { filter } = setup();
		expect(filter.isFilterActive()).toBe(false);
		expect(filter.getModel()).toBeNull();
	});

	it('ticking boxes activates the filter, notifies the grid, and ORs the selected types', () => {
		const { filter, filterChangedCallback, checkbox } = setup();
		checkbox('bible_passage').click();
		checkbox('youtube').click();

		expect(filterChangedCallback).toHaveBeenCalledTimes(2);
		// Model values follow option order, not click order, so the URL stays stable.
		expect(filter.getModel()).toEqual({ filterType: 'set', values: ['youtube', 'bible_passage'] });
		expect(pass(filter, 'YOUTUBE')).toBe(true);
		expect(pass(filter, 'BIBLE_PASSAGE')).toBe(true);
		expect(pass(filter, 'CLAIM')).toBe(false);
	});

	it('setModel syncs the checkboxes; setModel(null) clears them', () => {
		const { filter, checkbox } = setup();
		filter.setModel({ filterType: 'set', values: ['bible_passage'] });
		expect(checkbox('bible_passage').checked).toBe(true);
		expect(checkbox('youtube').checked).toBe(false);

		filter.setModel(null);
		expect(checkbox('bible_passage').checked).toBe(false);
		expect(filter.isFilterActive()).toBe(false);
	});

	it('the Clear button unticks everything and notifies the grid', () => {
		const { filter, filterChangedCallback, checkbox } = setup();
		filter.setModel({ filterType: 'set', values: ['youtube', 'bible_passage'] });
		filter.getGui().querySelector('button')!.click();

		expect(checkbox('youtube').checked).toBe(false);
		expect(filter.getModel()).toBeNull();
		expect(filterChangedCallback).toHaveBeenCalledTimes(1);
	});
});
