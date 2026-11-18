import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { activityItemCellRenderer } from '$lib/utils/activityItemCellRenderer';

// Regression guard (plan Task 12): on a Webpage row the title opens the details view only, the
// thumbnail opens the page in a new tab only, and the ◎ and Category cells keep their own handlers.

const data = {
	id: 42,
	name: 'A post title',
	url: 'https://www.example.com/post',
	contentType: 'WEB_PAGE',
	webPage: { faviconUrl: 'https://www.example.com/favicon.ico' },
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Webpage Item cell click targets', () => {
	it('clicking the title opens the details view for that row', () => {
		const onOpenDetails = vi.fn();
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		const cell = activityItemCellRenderer({ data: data as never, context: { onOpenDetails } }) as HTMLElement;
		(cell.querySelector('[data-testid="item-title"]') as HTMLElement).click();
		expect(onOpenDetails).toHaveBeenCalledWith('42');
		expect(open).not.toHaveBeenCalled();
	});

	it('clicking the thumbnail opens the page in a new tab, and not the details view', () => {
		const onOpenDetails = vi.fn();
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		const cell = activityItemCellRenderer({ data: data as never, context: { onOpenDetails } }) as HTMLElement;
		(cell.querySelector('[data-testid="item-thumb"]') as HTMLElement).click();
		expect(open).toHaveBeenCalledWith('https://www.example.com/post', '_blank', 'noopener,noreferrer');
		expect(onOpenDetails).not.toHaveBeenCalled();
	});

	it('a Webpage row has no play overlay on its thumbnail', () => {
		const cell = activityItemCellRenderer({ data: data as never, context: {} }) as HTMLElement;
		expect(cell.querySelector('svg polygon')).toBeNull();
	});
});

describe('◎ and Category click handlers are not gated on content type', () => {
	const source = readFileSync(resolve(process.cwd(), 'src/lib/components/ActivityTable.svelte'), 'utf8');
	const clickHandler = source.slice(source.indexOf('onCellClicked:'), source.indexOf('onGridReady:'));

	it('◎ still opens the perspective editor for every row', () => {
		expect(clickHandler).toMatch(/colId === 'perspectize'\) \{\s*openPerspective\(/);
		expect(clickHandler).not.toMatch(/contentType/);
	});

	it('Category still opens the Wikidata popover for every row', () => {
		expect(clickHandler).toMatch(/colId === 'category'\) \{/);
		expect(clickHandler).toMatch(/categoryPopoverOpen = true/);
	});
});
