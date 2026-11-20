import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import WebPageTiles from '#lib/components/WebPageTiles.svelte';
import ActivityCardList from '#lib/components/ActivityCardList.svelte';

// The arXiv page declares its date as '2017-06-12' (no time). It must read Jun 12, 2017 in the details
// tile, and the card must show 2017. Run under TZ=America/New_York to see the off-by-one.

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

const webPage = { siteName: 'arXiv', domain: 'arxiv.org', author: null, webPageRoles: [], publishedAt: '2017-06-12' };

describe('date-only publish date in the details tile', () => {
	it('shows the stated calendar day', () => {
		render(WebPageTiles, {
			props: { row: { url: 'https://arxiv.org/abs/1706.03762', webPage, response: null } as never },
		});
		const tile = screen.getByText('Published', { selector: 'div' }).parentElement;
		expect(tile?.lastElementChild?.textContent?.trim()).toBe('Jun 12, 2017');
	});
});

describe('date-only publish date on the card', () => {
	it('shows the year of the stated day', () => {
		render(ActivityCardList, {
			props: {
				rowData: [
					{
						id: '5',
						name: 'Attention Is All You Need',
						url: 'https://arxiv.org/abs/1706.03762',
						channelTitle: null,
						length: null,
						lengthUnits: null,
						contentType: 'WEB_PAGE',
						webPage,
					} as never,
				],
				onOpenDetails: vi.fn(),
			},
		});
		expect(screen.getByTestId('card-webpage-facts-5').textContent).toContain('2017');
	});
});
