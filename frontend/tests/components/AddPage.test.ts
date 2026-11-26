import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import AddPage from '../../src/routes/add/+page.svelte';

const mocks = vi.hoisted(() => ({
	page: { url: new URL('http://localhost/add') },
	goto: vi.fn(),
	session: { signedIn: true, pickerOpen: false },
	mutate: vi.fn(),
	mutation: {
		mutate: null as any,
		reset: vi.fn(),
		error: null as unknown,
		isError: false,
		isPending: false,
		isSuccess: false,
		data: undefined as any,
	},
	preview: { data: undefined as any, isPending: false, isError: false },
}));

vi.mock('$app/state', () => ({ page: mocks.page }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
// Demo mode has no ClerkProvider, so the auth wrappers render from this plain session.
vi.mock('#lib/auth/index.js', () => ({ DEMO_MODE: true, demoSession: mocks.session }));
// Demo mode never renders Clerk; a render would throw.
vi.mock('svelte-clerk', () => {
	const fail = () => {
		throw new Error('svelte-clerk rendered in demo mode');
	};
	return { Show: fail, SignInButton: fail };
});
vi.mock('svelte-sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('#lib/queries/client.js', () => ({ graphqlRequest: vi.fn() }));
vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn(() => {
		mocks.mutation.mutate = mocks.mutate;
		return mocks.mutation;
	}),
	useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn(), setQueriesData: vi.fn() })),
}));
vi.mock('#lib/queries/content/useWebPagePreview.js', () => ({ useWebPagePreview: () => mocks.preview }));

function open(search: string) {
	mocks.page.url = new URL(`http://localhost/add${search}`);
	return render(AddPage);
}

describe('/add page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.session.signedIn = true;
		Object.assign(mocks.mutation, { isPending: false, isSuccess: false, data: undefined });
		mocks.preview.data = undefined;
	});

	it('prefills the field from the url param and detects the type', async () => {
		open('?url=' + encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
		await tick();
		expect(screen.getByLabelText('Link or reference')).toHaveValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
		expect(screen.getByTestId('type-chip')).toHaveTextContent('Detected: YouTube');
	});

	it('prefills from a link inside text', async () => {
		open('?text=' + encodeURIComponent('Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ now'));
		await tick();
		expect(screen.getByLabelText('Link or reference')).toHaveValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
	});

	it('prefills a Bible reference shared as text', async () => {
		open('?text=' + encodeURIComponent('John 3:16'));
		await tick();
		expect(screen.getByTestId('type-chip')).toHaveTextContent('Detected: Bible passage');
	});

	it('shows the shared title as a hint only', async () => {
		open('?url=https%3A%2F%2Fexample.com%2Fa&title=A%20page');
		await tick();
		expect(screen.getByTestId('shared-title')).toHaveTextContent('A page');
	});

	it('signed out shows sign-in instead of the submit button', async () => {
		mocks.session.signedIn = false;
		open('?url=https%3A%2F%2Fexample.com%2Fa');
		await tick();
		expect(screen.getByRole('button', { name: 'Sign in to add' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
		// The shared link stays in the form so it survives the sign-in modal.
		expect(screen.getByLabelText('Link or reference')).toHaveValue('https://example.com/a');
	});

	it('submitting calls the mutation for the detected type', async () => {
		open('?url=' + encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		expect(mocks.mutate).toHaveBeenCalledWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
	});

	it('success shows Add your perspective linking to the content', async () => {
		Object.assign(mocks.mutation, {
			isSuccess: true,
			data: { createContentFromYouTube: { alreadyExisted: false, content: { id: '42' } } },
		});
		open('?url=' + encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
		await tick();
		expect(screen.getByRole('heading', { name: 'Added' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Add your perspective' })).toHaveAttribute(
			'href',
			expect.stringContaining('42'),
		);
	});

	it('already saved success reads Already saved', async () => {
		Object.assign(mocks.mutation, {
			isSuccess: true,
			data: { createContentFromYouTube: { alreadyExisted: true, content: { id: '42' } } },
		});
		open('?url=' + encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
		await tick();
		expect(screen.getByRole('heading', { name: 'Already saved' })).toBeInTheDocument();
	});

	it('links to the stored item when the web preview says the page is already saved', async () => {
		mocks.preview.data = { alreadyExistsContentId: '77' };
		open('?url=' + encodeURIComponent('https://example.com/article'));
		await vi.waitFor(() => expect(screen.getByRole('link', { name: 'Open it' })).toBeInTheDocument());
		expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', expect.stringContaining('77'));
	});

	describe('Done', () => {
		function succeeded() {
			Object.assign(mocks.mutation, {
				isSuccess: true,
				data: { createContentFromYouTube: { alreadyExisted: false, content: { id: '42' } } },
			});
			open('?url=' + encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
		}

		it('closes the window when opened as a popup', async () => {
			const close = vi.spyOn(window, 'close').mockImplementation(() => {});
			succeeded();
			await tick();
			await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
			expect(close).toHaveBeenCalled();
			expect(mocks.goto).not.toHaveBeenCalled();
			close.mockRestore();
		});

		it('goes to the library when the page has a history', async () => {
			const close = vi.spyOn(window, 'close').mockImplementation(() => {});
			vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
			succeeded();
			await tick();
			await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
			expect(mocks.goto).toHaveBeenCalledWith('/content-library');
			expect(close).not.toHaveBeenCalled();
			close.mockRestore();
		});
	});
});
