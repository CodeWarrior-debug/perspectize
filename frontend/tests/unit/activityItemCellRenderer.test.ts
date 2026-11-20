import { describe, it, expect, vi, afterEach } from 'vitest';
import { activityItemCellRenderer } from '$lib/utils/activityItemCellRenderer';

describe('activityItemCellRenderer', () => {
	it('returns empty string when data is missing', () => {
		expect(activityItemCellRenderer({})).toBe('');
	});

	it('renders a thumbnail and a 2-line-clamp title', () => {
		const result = activityItemCellRenderer({
			data: { id: '1', name: 'My Video', url: 'https://youtube.com/watch?v=abc123' },
		}) as HTMLElement;

		expect(result).toBeInstanceOf(HTMLDivElement);

		const img = result.querySelector('img');
		expect(img).toBeTruthy();
		expect(img?.src).toBe('https://i.ytimg.com/vi/abc123/default.jpg');

		const title = result.querySelector('[data-testid="item-title"]');
		expect(title?.textContent).toBe('My Video');
		expect(title?.className).toContain('line-clamp-2');
	});

	it('lays the thumbnail and title out side-by-side (not stacked)', () => {
		const result = activityItemCellRenderer({
			data: { id: '1', name: 'My Video', url: 'https://youtube.com/watch?v=abc123' },
		}) as HTMLElement;

		expect(result.className).toContain('items-center');
		expect(result.className).not.toContain('flex-col');

		const thumbWrap = result.querySelector('[data-testid="item-thumb"]');
		expect(thumbWrap?.className).toContain('h-8');
		expect(thumbWrap?.className).toContain('w-10');

		const title = result.querySelector('[data-testid="item-title"]');
		expect(title?.className).toContain('text-left');
		expect(title?.className).not.toContain('text-center');
	});

	it('omits the thumbnail image when the URL has no extractable video id', () => {
		const result = activityItemCellRenderer({
			data: { id: '1', name: 'No Thumb', url: 'https://example.com/not-youtube' },
		}) as HTMLElement;

		expect(result.querySelector('img')).toBeNull();
		expect(result.querySelector('[data-testid="item-title"]')?.textContent).toBe('No Thumb');
	});

	it('clicking the thumbnail opens the video in a new tab and does not open the modal', () => {
		const onOpenDetails = vi.fn();
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

		const result = activityItemCellRenderer({
			data: { id: '42', name: 'My Video', url: 'https://youtube.com/watch?v=abc123' },
			context: { onOpenDetails },
		}) as HTMLElement;

		const thumbWrap = result.querySelector('[data-testid="item-thumb"]') as HTMLElement;
		thumbWrap.click();

		expect(openSpy).toHaveBeenCalledWith('https://youtube.com/watch?v=abc123', '_blank', 'noopener,noreferrer');
		expect(onOpenDetails).not.toHaveBeenCalled();

		openSpy.mockRestore();
	});

	it('clicking anywhere else in the cell opens the details modal with the row id', () => {
		const onOpenDetails = vi.fn();

		const result = activityItemCellRenderer({
			data: { id: '42', name: 'My Video', url: 'https://youtube.com/watch?v=abc123' },
			context: { onOpenDetails },
		}) as HTMLElement;

		result.click();

		expect(onOpenDetails).toHaveBeenCalledWith('42');
	});

	it('removes the thumbnail image if it fails to load (falls back to the plain bg-muted block)', () => {
		const result = activityItemCellRenderer({
			data: { id: '1', name: 'My Video', url: 'https://youtube.com/watch?v=abc123' },
		}) as HTMLElement;

		const img = result.querySelector('img') as HTMLImageElement;
		expect(img).toBeTruthy();
		img.dispatchEvent(new Event('error'));

		expect(result.querySelector('img')).toBeNull();
	});

	it('clicking the thumbnail with no url does not attempt to open a new tab', () => {
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

		const result = activityItemCellRenderer({
			data: { id: '1', name: 'No URL', url: null },
		}) as HTMLElement;

		const thumbWrap = result.querySelector('[data-testid="item-thumb"]') as HTMLElement;
		thumbWrap.click();

		expect(openSpy).not.toHaveBeenCalled();
		openSpy.mockRestore();
	});

	it('does not set a native title attribute (avoids doubling up with the AG Grid cell tooltip)', () => {
		const result = activityItemCellRenderer({
			data: { id: '1', name: 'My Video', url: 'https://youtube.com/watch?v=abc123' },
		}) as HTMLElement;

		expect(result.hasAttribute('title')).toBe(false);
		expect(result.querySelector('[data-testid="item-thumb"]')?.hasAttribute('title')).toBe(false);
	});

	describe('BIBLE_PASSAGE rows', () => {
		const passage = {
			id: '7',
			name: 'Genesis 1:1-3',
			url: 'https://www.biblegateway.com/passage/?search=Genesis+1%3A1-3',
			contentType: 'BIBLE_PASSAGE',
		};

		it('renders an icon and the reference as title with no thumbnail image when untitled', () => {
			const result = activityItemCellRenderer({ data: { ...passage, displayTitle: null } }) as HTMLElement;

			expect(result.querySelector('img')).toBeNull();
			expect(result.querySelector('svg[data-icon="bible-passage"]')).toBeTruthy();
			expect(result.querySelector('[data-testid="item-title"]')?.textContent).toBe('Genesis 1:1-3');
			expect(result.querySelector('[data-testid="item-subtitle"]')).toBeNull();
		});

		it('shows the display title as primary text with the reference as subtitle when set', () => {
			const result = activityItemCellRenderer({ data: { ...passage, displayTitle: 'Creation' } }) as HTMLElement;

			expect(result.querySelector('[data-testid="item-title"]')?.textContent).toBe('Creation');
			expect(result.querySelector('[data-testid="item-subtitle"]')?.textContent).toBe('Genesis 1:1-3');
			expect(result.querySelector('img')).toBeNull();
		});

		it('clicking the row opens details; clicking the icon opens the passage link only', () => {
			const onOpenDetails = vi.fn();
			const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
			const result = activityItemCellRenderer({
				data: { ...passage, displayTitle: null },
				context: { onOpenDetails },
			}) as HTMLElement;

			(result.querySelector('[data-testid="item-thumb"]') as HTMLElement).click();
			expect(openSpy).toHaveBeenCalledWith(passage.url, '_blank', 'noopener,noreferrer');
			expect(onOpenDetails).not.toHaveBeenCalled();

			(result.querySelector('[data-testid="item-title"]') as HTMLElement).click();
			expect(onOpenDetails).toHaveBeenCalledWith('7');
			openSpy.mockRestore();
		});
	});
});

describe('activityItemCellRenderer: one thumbnail slot for every type (titles line up)', () => {
	const variants = {
		video: { id: '1', name: 'A video', url: 'https://youtube.com/watch?v=abc123' },
		passage: {
			id: '2',
			name: 'John 1:1-5',
			url: null,
			contentType: 'BIBLE_PASSAGE',
			verseStartID: 43001001,
			verseEndID: 43001005,
		},
		movie: { id: '3', name: 'A film', url: null, contentType: 'MOVIE', movie: { posterPath: '/p.jpg', year: 2001 } },
		'movie without poster': { id: '4', name: 'No poster', url: null, contentType: 'MOVIE', movie: {} },
	};

	for (const [label, data] of Object.entries(variants)) {
		it(`${label}: the image sits in the shared 40px-wide, 42px-tall centered slot`, () => {
			const cell = activityItemCellRenderer({ data }) as HTMLElement;
			const slot = cell.querySelector('[data-testid="item-thumb"]')?.parentElement;
			expect(slot?.parentElement).toBe(cell);
			for (const cls of ['w-10', 'h-[42px]', 'flex-none', 'items-center', 'justify-center']) {
				expect(slot?.className).toContain(cls);
			}
		});
	}

	it('the passage book sits on the row colour, with no grey tile', () => {
		const cell = activityItemCellRenderer({ data: variants.passage }) as HTMLElement;
		expect(cell.querySelector('[data-testid="item-thumb"]')?.className).not.toContain('bg-muted');
	});

	it('a movie poster is the 2:3 image centered in the slot', () => {
		const cell = activityItemCellRenderer({ data: variants.movie }) as HTMLElement;
		const thumb = cell.querySelector('[data-testid="item-thumb"]');
		expect(thumb?.className).toContain('w-7');
		expect(thumb?.querySelector('img')?.getAttribute('src')).toBe('https://image.tmdb.org/t/p/w92/p.jpg');
	});
});

describe('activityItemCellRenderer: BOOK rows', () => {
	const WORK_URL = 'https://openlibrary.org/works/OL23166W';
	const bookRow = (book: unknown) => ({
		id: '40',
		name: 'East of Eden',
		url: WORK_URL,
		contentType: 'BOOK',
		book,
	});
	const eastOfEden = {
		workKey: 'OL23166W',
		title: 'East of Eden',
		authors: [{ name: 'John Steinbeck' }],
		coverId: 11386937,
	};

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('cover and author: the small cover fitted (not cropped), the title, and the author as subtitle', () => {
		const cell = activityItemCellRenderer({ data: bookRow(eastOfEden) }) as HTMLElement;
		const img = cell.querySelector('[data-testid="item-thumb"] img');
		expect(img?.getAttribute('src')).toBe('https://covers.openlibrary.org/b/id/11386937-S.jpg');
		expect(img?.className).toContain('object-contain');
		expect(cell.querySelector('[data-testid="item-title"]')?.textContent).toBe('East of Eden');
		expect(cell.querySelector('[data-testid="item-subtitle"]')?.textContent).toBe('John Steinbeck');
	});

	it('no cover: no image and a grey empty slot, so no broken image', () => {
		const cell = activityItemCellRenderer({
			data: bookRow({ ...eastOfEden, coverId: null, authors: [{ name: 'Zine Author' }] }),
		}) as HTMLElement;
		const thumb = cell.querySelector('[data-testid="item-thumb"]');
		expect(thumb?.querySelector('img')).toBeNull();
		expect(thumb?.className).toContain('bg-muted');
	});

	it('no author: no subtitle element at all', () => {
		const cell = activityItemCellRenderer({ data: bookRow({ ...eastOfEden, authors: [] }) }) as HTMLElement;
		expect(cell.querySelector('[data-testid="item-subtitle"]')).toBeNull();
		expect(cell.querySelector('[data-testid="item-title"]')?.textContent).toBe('East of Eden');
	});

	it('neither book nor response: a plain tile with just the title', () => {
		const cell = activityItemCellRenderer({ data: bookRow(undefined) }) as HTMLElement;
		expect(cell.querySelector('img')).toBeNull();
		expect(cell.querySelector('[data-testid="item-subtitle"]')).toBeNull();
		expect(cell.querySelector('[data-testid="item-title"]')?.textContent).toBe('East of Eden');
	});

	it('removes the cover image if it fails to load', () => {
		const cell = activityItemCellRenderer({ data: bookRow(eastOfEden) }) as HTMLElement;
		const img = cell.querySelector('img') as HTMLImageElement;
		img.dispatchEvent(new Event('error'));
		expect(cell.querySelector('img')).toBeNull();
	});

	it('clicking the cover opens the Open Library work in a new tab, without opening details', () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		const onOpenDetails = vi.fn();
		const cell = activityItemCellRenderer({
			data: bookRow(eastOfEden),
			context: { onOpenDetails },
		}) as HTMLElement;
		(cell.querySelector('[data-testid="item-thumb"]') as HTMLElement).click();
		expect(open).toHaveBeenCalledWith(WORK_URL, '_blank', 'noopener,noreferrer');
		expect(onOpenDetails).not.toHaveBeenCalled();
	});

	it('clicking anywhere else in the cell opens the details modal with the row id', () => {
		const onOpenDetails = vi.fn();
		const cell = activityItemCellRenderer({
			data: bookRow(eastOfEden),
			context: { onOpenDetails },
		}) as HTMLElement;
		(cell.querySelector('[data-testid="item-title"]') as HTMLElement).click();
		expect(onOpenDetails).toHaveBeenCalledWith('40');
	});
});
