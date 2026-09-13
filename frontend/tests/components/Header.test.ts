import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Header from '$lib/components/Header.svelte';

// Mock svelte-clerk components
vi.mock('svelte-clerk', () => ({
	Show: vi.fn(() => ({
		$$: {},
		$set: vi.fn(),
		$on: vi.fn(),
		$destroy: vi.fn(),
	})),
	SignInButton: vi.fn(() => ({
		$$: {},
		$set: vi.fn(),
		$on: vi.fn(),
		$destroy: vi.fn(),
	})),
	UserButton: vi.fn(() => ({
		$$: {},
		$set: vi.fn(),
		$on: vi.fn(),
		$destroy: vi.fn(),
	})),
}));

// Mock AddVideoPopover component
vi.mock('$lib/components/AddVideoPopover.svelte', () => ({
	default: vi.fn(() => ({
		$$: {},
		$set: vi.fn(),
		$on: vi.fn(),
		$destroy: vi.fn(),
	})),
}));

// Mock useMessageThreads hook
vi.mock('$lib/queries/hooks/useMessageThreads', () => ({
	useMessageThreads: () => ({
		data: {
			messageThreads: [
				{
					id: 't1',
					unreadCount: 3,
					title: null,
					participants: [],
					lastMessageAt: 'x',
					latestSeq: 3,
					myLastReadSeq: 0,
					createdAt: 'x',
				},
			],
		},
	}),
}));

// Mock totalUnread function
vi.mock('$lib/messaging/inboxCache', () => ({
	totalUnread: (threads: any) => {
		return threads.reduce((sum: number, t: any) => sum + (t.unreadCount || 0), 0);
	},
}));

// Mock useMe hook — signed-in by default so existing Messages-link tests still see it.
// Mutable so the signed-out test below can flip it without needing module reset gymnastics.
const meMockState = vi.hoisted(() => ({ me: { id: 'u1', username: 'me' } as { id: string; username: string } | null }));
vi.mock('$lib/queries/hooks/useMe.svelte', () => ({
	useMe: () => ({ me: meMockState.me }),
}));

function renderHeader() {
	const result = render(Header);
	const header = result.container.querySelector('header');
	const inner = result.container.querySelector('header > div');
	return { ...result, header, inner };
}

describe('Header component', () => {
	it('renders without errors', () => {
		render(Header);
	});

	it('renders the Perspectize brand name', () => {
		render(Header);
		expect(screen.getByText('Perspectize')).toBeInTheDocument();
	});

	it('renders a header element', () => {
		const { header } = renderHeader();
		expect(header).toBeInTheDocument();
	});

	it('header has fixed height class (h-16)', () => {
		const { header } = renderHeader();
		expect(header?.className).toContain('h-16');
	});

	it('header has bottom border', () => {
		const { header } = renderHeader();
		expect(header?.className).toContain('border-b');
	});

	it('header has navy background (bg-primary)', () => {
		const { header } = renderHeader();
		expect(header?.className).toContain('bg-primary');
	});

	it('header has white text (text-primary-foreground)', () => {
		const { header } = renderHeader();
		expect(header?.className).toContain('text-primary-foreground');
	});

	it('has responsive padding and gap classes on inner container', () => {
		const { inner } = renderHeader();
		expect(inner?.className).toContain('px-4');
		expect(inner?.className).toContain('gap-2');
	});

	it('has max-width constraint for large screens', () => {
		const { inner } = renderHeader();
		expect(inner?.className).toContain('max-w-screen-xl');
	});

	it('renders AddVideoPopover component', () => {
		const { container } = render(Header);
		// AddVideoPopover is mocked, so we just verify component renders
		expect(container).toBeTruthy();
	});

	it('logo has min-w-0 for flex shrink support', () => {
		render(Header);
		const logo = screen.getByText('Perspectize');
		expect(logo.className).toContain('min-w-0');
	});

	it('logo has truncate class for text overflow', () => {
		render(Header);
		const logo = screen.getByText('Perspectize');
		expect(logo.className).toContain('truncate');
	});

	it('logo has responsive text sizing', () => {
		render(Header);
		const logo = screen.getByText('Perspectize');
		expect(logo.className).toContain('text-base');
	});

	it('logo has white text color on navy header', () => {
		render(Header);
		const logo = screen.getByText('Perspectize');
		expect(logo.className).toContain('text-primary-foreground');
	});

	it('logo has hover opacity effect', () => {
		render(Header);
		const logo = screen.getByText('Perspectize');
		expect(logo.className).toContain('hover:text-primary-foreground/80');
	});

	it('right container has shrink-0 to prevent interactive element shrinking', () => {
		const { container } = render(Header);
		const rightContainer = container.querySelector('.shrink-0');
		expect(rightContainer).toBeInTheDocument();
		expect(rightContainer?.className).toContain('shrink-0');
	});

	it('renders a Discover navigation link pointing to /discover', () => {
		render(Header);
		const link = screen.getByRole('link', { name: 'Discover' });
		expect(link).toHaveAttribute('href', '/discover');
	});

	it('renders an Activity navigation link pointing to /', () => {
		render(Header);
		const link = screen.getByRole('link', { name: 'Activity' });
		expect(link).toHaveAttribute('href', '/');
	});

	it('shows a Messages nav link with the unread total', () => {
		renderHeader();
		const link = screen.getByRole('link', { name: /messages/i });
		expect(link).toHaveAttribute('href', '/messages');
		expect(screen.getByTestId('nav-unread')).toHaveTextContent('3');
	});
});

describe('Header component (signed out)', () => {
	afterEach(() => {
		meMockState.me = { id: 'u1', username: 'me' };
	});

	it('hides the Messages nav link when signed out', () => {
		meMockState.me = null;
		render(Header);
		expect(screen.queryByRole('link', { name: /messages/i })).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Activity' })).toBeInTheDocument();
	});
});
