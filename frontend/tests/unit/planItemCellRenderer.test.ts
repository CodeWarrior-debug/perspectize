import { describe, it, expect, vi, afterEach } from 'vitest';
import { planItemCellRenderer } from '$lib/utils/planItemCellRenderer';
import type { UserTodoItem } from '$lib/queries/userTodos';

function todo(overrides: Partial<UserTodoItem> = {}): UserTodoItem {
	return {
		id: '5',
		user: { id: '7', username: 'ada' },
		content: null,
		name: 'Read the paper',
		action: { id: '2', key: 'consume', label: 'Consume', description: '', typicalSequence: 2, isPreset: true },
		priority: null,
		status: 'NOT_STARTED',
		percentComplete: 0,
		startDate: null,
		endDate: null,
		dueDate: null,
		comments: null,
		privacy: 'PUBLIC',
		list: null,
		listPosition: null,
		createdAt: '2026-10-01T00:00:00Z',
		updatedAt: '2026-10-01T00:00:00Z',
		...overrides,
	};
}

const VIDEO = {
	id: '9',
	name: 'A great video',
	url: 'https://www.youtube.com/watch?v=abc123',
	contentType: 'YOUTUBE_VIDEO',
};

/** A cell is mounted inside the grid's own cell element, which is where AG Grid hears clicks. */
function mount(cell: HTMLElement | string) {
	const host = document.createElement('div');
	const onCellClick = vi.fn();
	host.addEventListener('click', onCellClick);
	if (typeof cell === 'string') host.textContent = cell;
	else host.append(cell);
	document.body.append(host);
	return { host, onCellClick };
}

describe('planItemCellRenderer', () => {
	afterEach(() => {
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	describe('a todo with no content', () => {
		it('is just its free-text name', () => {
			expect(planItemCellRenderer(todo({ name: 'Read the paper' }))).toBe('Read the paper');
		});

		it('says Untitled when it has neither', () => {
			expect(planItemCellRenderer(todo({ name: null }))).toBe('Untitled');
		});
	});

	describe('a todo with content, drawn as the Activity Item cell', () => {
		it('shows a YouTube video as its thumbnail and title', () => {
			const cell = planItemCellRenderer(todo({ content: VIDEO })) as HTMLElement;
			expect(cell.querySelector('img')?.getAttribute('src')).toBe('https://i.ytimg.com/vi/abc123/default.jpg');
			expect(cell.querySelector('[data-testid="item-title"]')?.textContent).toBe('A great video');
		});

		it('shows a movie as its TMDB poster', () => {
			const cell = planItemCellRenderer(
				todo({
					content: {
						id: '12',
						name: 'Heat',
						url: 'https://www.themoviedb.org/movie/949',
						contentType: 'MOVIE',
						movie: { posterPath: '/heat.jpg' },
					},
				}),
			) as HTMLElement;
			expect(cell.querySelector('img')?.getAttribute('src')).toBe('https://image.tmdb.org/t/p/w92/heat.jpg');
			expect(cell.textContent).toContain('Heat');
		});

		it('shows a Bible passage as an icon tile, not an image', () => {
			const cell = planItemCellRenderer(
				todo({
					content: {
						id: '30',
						name: 'John 3:16',
						url: null,
						contentType: 'BIBLE_PASSAGE',
						verseStartID: 43003016,
						verseEndID: 43003016,
					},
				}),
			) as HTMLElement;
			expect(cell.querySelector('[data-testid="item-thumb"] svg')).not.toBeNull();
			expect(cell.querySelector('img')).toBeNull();
			expect(cell.textContent).toContain('John 3:16');
		});

		it('still draws a plain cell when only the id and name are known', () => {
			const cell = planItemCellRenderer(todo({ content: { id: '9', name: 'A great video' } })) as HTMLElement;
			expect(cell.querySelector('[data-testid="item-title"]')?.textContent).toBe('A great video');
		});
	});

	describe('click zones', () => {
		it('lets a click on the title reach the cell, so the todo opens for editing', () => {
			const { host, onCellClick } = mount(planItemCellRenderer(todo({ content: VIDEO })));
			host.querySelector<HTMLElement>('[data-testid="item-title"]')?.click();
			expect(onCellClick).toHaveBeenCalledTimes(1);
		});

		it('opens the video in a new tab from the thumbnail, without also opening the todo', () => {
			const open = vi.spyOn(window, 'open').mockReturnValue(null);
			const { host, onCellClick } = mount(planItemCellRenderer(todo({ content: VIDEO })));
			host.querySelector<HTMLElement>('[data-testid="item-thumb"]')?.click();

			expect(open).toHaveBeenCalledWith(VIDEO.url, '_blank', 'noopener,noreferrer');
			expect(onCellClick).not.toHaveBeenCalled();
		});
	});
});
