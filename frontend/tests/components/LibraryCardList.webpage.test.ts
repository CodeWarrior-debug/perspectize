import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import LibraryCardList from '#lib/components/library/LibraryCardList.svelte';
import { warmUpRender } from '../helpers/warmUp';

vi.mock('#lib/auth/useAuthState.js', () => ({
	useAuthState: () => ({
		get isLoaded() {
			return true;
		},
		get userId() {
			return null;
		},
	}),
}));

const webPage = (overrides: Record<string, unknown> = {}) => ({
	siteName: 'Example Blog',
	domain: 'example.com',
	imageUrl: null,
	faviconUrl: null,
	publishedAt: '2024-03-05T12:00:00Z',
	author: 'Jane Doe',
	webPageRoles: [] as string[],
	...overrides,
});

// The card row is typed loosely here: the test fixtures use plain strings for roles and type.
const pageRow = (id: string, webPageOverrides: Record<string, unknown> = {}) =>
	({
		id,
		name: 'A post title',
		url: 'https://www.example.com/post',
		channelTitle: null,
		length: null,
		lengthUnits: null,
		contentType: 'WEB_PAGE',
		webPage: webPage(webPageOverrides),
	}) as never;

// Pay the component's first-render cost before any test, not inside the first
// one: under full-suite load it alone can pass the 5 s testTimeout (#728).
warmUpRender(LibraryCardList, { rowData: [pageRow('1')], onOpenDetails: () => {} });

describe('LibraryCardList: webpage card', () => {
	it('shows the site, the published year and the author', () => {
		render(LibraryCardList, { props: { rowData: [pageRow('1')], onOpenDetails: vi.fn() } });
		expect(screen.getByTestId('card-webpage-facts-1').textContent).toContain('Example Blog');
		expect(screen.getByTestId('card-webpage-facts-1').textContent).toContain('2024');
		expect(screen.getByTestId('card-webpage-author-1').textContent).toContain('Jane Doe');
	});

	it('shows one role pill per role, labelled', () => {
		render(LibraryCardList, {
			props: {
				rowData: [pageRow('2', { webPageRoles: ['BLOG_POST', 'SESSION_TRANSCRIPT'] })],
				onOpenDetails: vi.fn(),
			},
		});
		const facts = screen.getByTestId('card-webpage-facts-2');
		expect(facts.textContent).toContain('Blog post');
		expect(facts.textContent).toContain('Session transcript');
	});

	it('shows no author line when none is declared (no dash, no Unknown)', () => {
		render(LibraryCardList, {
			props: { rowData: [pageRow('3', { author: null })], onOpenDetails: vi.fn() },
		});
		expect(screen.queryByTestId('card-webpage-author-3')).toBeNull();
	});

	it('has no play badge, because a page is not a video', () => {
		render(LibraryCardList, {
			props: {
				rowData: [pageRow('4', { imageUrl: 'https://img.example.com/cover.jpg' })],
				onOpenDetails: vi.fn(),
			},
		});
		expect(screen.queryByTestId('card-play-badge')).toBeNull();
	});
});
