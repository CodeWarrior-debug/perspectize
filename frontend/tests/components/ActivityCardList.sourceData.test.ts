import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ActivityCardList from '#lib/components/ActivityCardList.svelte';

const authState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('#lib/auth/useAuthState.js', () => ({
	useAuthState: () => ({
		get isLoaded() {
			return true;
		},
		get userId() {
			return authState.userId;
		},
	}),
}));

const base = {
	id: '1',
	name: 'A video',
	url: 'https://youtube.com/watch?v=abc123',
	channelTitle: 'Chan',
	length: 59,
	lengthUnits: 'seconds',
};

describe('ActivityCardList source numbers', () => {
	it('fresh: shows the views and likes line', () => {
		render(ActivityCardList, {
			props: { rowData: [{ ...base, viewCount: 1300000, likeCount: 26500 }], onOpenDetails: vi.fn() },
		});
		expect(screen.getByText('1.3 M views')).toBeInTheDocument();
		expect(screen.queryByTestId('source-data-expired')).not.toBeInTheDocument();
	});

	it('expired: shows the placeholder instead of any number or a zero', () => {
		render(ActivityCardList, {
			props: {
				rowData: [{ ...base, viewCount: null, likeCount: null, sourceDataExpired: true }],
				onOpenDetails: vi.fn(),
			},
		});
		expect(screen.getByTestId('source-data-expired')).toHaveTextContent('Refresh to view');
		expect(screen.queryByText(/views/)).not.toBeInTheDocument();
	});
});
