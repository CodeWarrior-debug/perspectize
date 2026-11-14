import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Header from '$lib/components/Header.svelte';
import { mockPageState } from '../setup';

// Mock svelte-clerk components
vi.mock('svelte-clerk', () => ({
	// SettingsDialog (rendered by Header) calls useMe(), which reads this context.
	// Signed-out keeps the underlying `me` query disabled.
	useClerkContext: () => ({ isLoaded: false, auth: { userId: null } }),
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

// SettingsDialog (rendered by Header, closed by default) uses useMe()/
// useSetOnboardingDisplayNextSession(), both of which need a QueryClientContext
// that this test file doesn't otherwise provide — mock the primitives instead of
// wrapping every render() call site in a QueryClientProvider.
vi.mock('@tanstack/svelte-query', () => ({
	// $lib/queries/client builds the shared app QueryClient at import time.
	QueryClient: class {},
	createQuery: vi.fn(() => ({ data: undefined, isSuccess: false, isError: false })),
	createMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useQueryClient: vi.fn(() => ({
		setQueriesData: vi.fn(),
		invalidateQueries: vi.fn(),
		cancelQueries: vi.fn(),
		getQueriesData: vi.fn(() => []),
		setQueryData: vi.fn(),
	})),
}));

// Mock AddContentPopover component
vi.mock('$lib/components/AddContentPopover.svelte', () => ({
	default: vi.fn(() => ({
		$$: {},
		$set: vi.fn(),
		$on: vi.fn(),
		$destroy: vi.fn(),
	})),
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

	it('renders AddContentPopover component', () => {
		const { container } = render(Header);
		// AddContentPopover is mocked, so we just verify component renders
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

	it('renders a Plan navigation link pointing to /plan, after Compare', () => {
		render(Header);
		const link = screen.getByRole('link', { name: 'Plan' });
		expect(link).toHaveAttribute('href', '/plan');
	});

	it('renders a Declare navigation link pointing to /declare, after Plan', () => {
		render(Header);
		const link = screen.getByRole('link', { name: 'Declare' });
		expect(link).toHaveAttribute('href', '/declare');
		const labels = screen
			.getAllByRole('link')
			.map((a) => a.textContent?.trim())
			.filter((t) => ['Library', 'Discover', 'Compare', 'Plan', 'Declare', 'Import'].includes(t ?? ''));
		expect(labels).toEqual(['Library', 'Discover', 'Compare', 'Plan', 'Declare', 'Import']);
	});

	describe('Import nav link', () => {
		afterEach(() => {
			mockPageState.url = new URL('http://localhost/');
		});

		it('renders an Import navigation link pointing to /import, last in the nav', () => {
			render(Header);
			const link = screen.getByRole('link', { name: 'Import' });
			expect(link).toHaveAttribute('href', '/import');
			const navLinks = screen.getByRole('navigation').querySelectorAll('a');
			expect(navLinks[navLinks.length - 1]).toBe(link);
		});

		it('marks Import as the current page on /import', () => {
			mockPageState.url = new URL('http://localhost/import');
			render(Header);
			expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute('aria-current', 'page');
		});

		it('keeps Import highlighted on an import detail page (/import/12)', () => {
			mockPageState.url = new URL('http://localhost/import/12');
			render(Header);
			expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute('aria-current', 'page');
		});

		it('does not mark Import as current on the Library page (/content-library)', () => {
			mockPageState.url = new URL('http://localhost/content-library');
			render(Header);
			expect(screen.getByRole('link', { name: 'Import' })).not.toHaveAttribute('aria-current');
			expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
		});
	});

	it('renders a Library navigation link pointing to /content-library', () => {
		render(Header);
		const link = screen.getByRole('link', { name: 'Library' });
		expect(link).toHaveAttribute('href', '/content-library');
	});

	it('marks Library as the current page on /content-library, and nothing on /', () => {
		const original = mockPageState.url;
		try {
			mockPageState.url = new URL('http://localhost/content-library?f.type=movie');
			const { unmount } = render(Header);
			expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
			unmount();

			mockPageState.url = new URL('http://localhost/');
			render(Header);
			expect(screen.getByRole('link', { name: 'Library' })).not.toHaveAttribute('aria-current');
		} finally {
			mockPageState.url = original;
		}
	});

	it('does not render a Messages nav link (messaging entry point is the floating widget)', () => {
		renderHeader();
		expect(screen.queryByRole('link', { name: /messages/i })).not.toBeInTheDocument();
	});
});
