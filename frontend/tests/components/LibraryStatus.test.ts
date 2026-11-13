import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import LibraryStatus from '$lib/components/discover/LibraryStatus.svelte';

// The real PerspectivePopover needs a QueryClientProvider/Clerk context; swap in a stub so we can
// assert the dynamic-import wiring (contentId/contentName/userId).
vi.mock('$lib/components/PerspectivePopover.svelte', async () => {
	const mod = await import('../helpers/FakePerspectivePopover.svelte');
	return { default: mod.default };
});

const mocks = vi.hoisted(() => ({ me: { id: '7' } as { id: string } | null }));
vi.mock('$lib/queries/users/useMe.svelte', () => ({
	useMe: () => ({
		get me() {
			return mocks.me;
		},
	}),
}));

describe('LibraryStatus', () => {
	it('shows the In Library badge with Add perspective, Compare and Go to item actions', () => {
		render(LibraryStatus, { props: { contentId: '42', contentName: 'Dune' } });

		expect(screen.getByText('In Library')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Add perspective' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Compare' })).toHaveAttribute('href', '/compare?contentId=42');
		expect(screen.getByRole('link', { name: 'Go to item' })).toHaveAttribute('href', '/?open=42');
	});

	it('does not mount the perspective editor until Add perspective is clicked', () => {
		render(LibraryStatus, { props: { contentId: '42', contentName: 'Dune' } });
		expect(screen.queryByTestId('fake-perspective-popover')).not.toBeInTheDocument();
	});

	it('opens the perspective popover for this item and the signed-in user', async () => {
		mocks.me = { id: '7' };
		render(LibraryStatus, { props: { contentId: '42', contentName: 'Dune' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Add perspective' }));

		await waitFor(() => {
			const popover = screen.getByTestId('fake-perspective-popover');
			expect(popover).toHaveAttribute('data-content-id', '42');
			expect(popover).toHaveAttribute('data-user-id', '7');
		});
	});
});
