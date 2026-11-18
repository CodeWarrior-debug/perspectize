import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import AddContentPopover from '$lib/components/AddContentPopover.svelte';
import type { WebPageFetch, WebPagePreview } from '$lib/queries/content';
import { warmUp } from '../helpers/warmUp';

const mocks = vi.hoisted(() => ({
	webPage: {
		mutate: vi.fn(),
		reset: vi.fn(),
		isPending: false,
		isSuccess: false,
		isError: false,
		error: null as unknown,
	},
	preview: { data: null as unknown, isPending: false, isError: false },
	// The popover passes its debounced url getter here, so a test can read what the query would fetch.
	previewUrl: { get: (): string | null => null },
	video: { mutate: vi.fn(), isPending: false, isSuccess: false },
	passage: { mutate: vi.fn(), isPending: false, isSuccess: false },
	movie: {
		mutate: vi.fn(),
		reset: vi.fn(),
		isPending: false,
		isSuccess: false,
		isError: false,
		error: null as unknown,
	},
	book: { mutate: vi.fn(), reset: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null as unknown },
}));

vi.mock('$lib/queries/content/useCreateWebPage', () => ({ useCreateWebPage: () => mocks.webPage }));
vi.mock('$lib/queries/content/useWebPagePreview', () => ({
	useWebPagePreview: (getUrl: () => string | null) => {
		mocks.previewUrl.get = getUrl;
		return mocks.preview;
	},
}));
vi.mock('$lib/queries/content/useAddVideo', () => ({ useAddVideo: () => mocks.video }));
vi.mock('$lib/queries/content/useAddMovie', () => ({ useAddMovie: () => mocks.movie }));
vi.mock('$lib/queries/content/useAddBook', () => ({ useAddBook: () => mocks.book }));
vi.mock('$lib/queries/content/useAddPassage', () => ({ useAddPassage: () => mocks.passage }));

const ARXIV = 'https://arxiv.org/abs/1706.03762';
const DEBOUNCE_MS = 400;

const fetchOf = (status: WebPageFetch['status'], httpStatus: number | null = 200): WebPageFetch => ({
	status,
	httpStatus,
	at: '2026-11-11T12:00:00Z',
});

const okPreview = (overrides: Partial<WebPagePreview> = {}): WebPagePreview => ({
	finalUrl: ARXIV,
	domain: 'arxiv.org',
	siteName: 'arXiv.org',
	title: 'Attention Is All You Need',
	description: null,
	imageUrl: null,
	faviconUrl: null,
	publishedAt: '2017-06-12',
	lang: 'en',
	author: null,
	fetch: fetchOf('OK'),
	alreadyExistsContentId: null,
	...overrides,
});

async function openWith(text: string) {
	render(AddContentPopover);
	await fireEvent.click(screen.getByRole('button', { name: /add content/i }));
	await tick();
	await type(text);
}

async function type(text: string) {
	await fireEvent.input(screen.getByPlaceholderText(/paste a link or type a reference/i), { target: { value: text } });
	await tick();
}

/**
 * Lets the debounce fire, then re-renders. Real timers: bits-ui's popover mounts on timers, so
 * fake timers keep the dialog from ever rendering.
 */
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 50));
	await tick();
}

// Queried by DOM, not by role: bits-ui keeps the popover content `visibility: hidden` in jsdom while it
// positions, so role queries skip it and accessible names come out empty. The elements are rendered.
const submit = () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const pickerButton = () => document.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
const statusText = () => document.querySelector('[role="status"]');
const openPicker = async () => {
	await fireEvent.click(pickerButton()!);
	await tick();
};
const choose = async (label: string) => {
	await fireEvent.click(screen.getByText(label, { selector: 'button[role="option"]' }));
	await tick();
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.preview.data = okPreview();
	mocks.preview.isPending = false;
	mocks.preview.isError = false;
	mocks.webPage.isPending = false;
	mocks.webPage.isSuccess = false;
	mocks.webPage.isError = false;
});

// Pay the component's first-render cost before any test, not inside the first
// one: under full-suite load it alone can pass the 5 s testTimeout (#728).
warmUp(() => openWith(''));

describe('AddContentPopover: webpage add (roles sent with the create)', () => {
	it('nothing picked: submits the url alone, with no roles key at all', async () => {
		await openWith(ARXIV);
		await settle();
		await fireEvent.click(submit());
		expect(mocks.webPage.mutate).toHaveBeenCalledTimes(1);
		const args = mocks.webPage.mutate.mock.calls[0][0];
		expect(args).toEqual({ url: ARXIV });
		expect(args).not.toHaveProperty('webPageRoles');
	});

	it('one picked: sends just that role', async () => {
		await openWith(ARXIV);
		await settle();
		await openPicker();
		await choose('Blog post');
		await fireEvent.click(submit());
		expect(mocks.webPage.mutate).toHaveBeenCalledWith({ url: ARXIV, webPageRoles: ['BLOG_POST'] });
	});

	it('both picked: sends them in pick order, so the first pick is the primary role', async () => {
		await openWith(ARXIV);
		await settle();
		await openPicker();
		await choose('Session transcript');
		await choose('Blog post');
		await fireEvent.click(submit());
		expect(mocks.webPage.mutate).toHaveBeenCalledWith({
			url: ARXIV,
			webPageRoles: ['SESSION_TRANSCRIPT', 'BLOG_POST'],
		});
	});

	it('unpicking one removes only that one from what is sent', async () => {
		await openWith(ARXIV);
		await settle();
		await openPicker();
		await choose('Blog post');
		await choose('Session transcript');
		await choose('Blog post');
		await fireEvent.click(submit());
		expect(mocks.webPage.mutate).toHaveBeenCalledWith({ url: ARXIV, webPageRoles: ['SESSION_TRANSCRIPT'] });
	});
});

describe('AddContentPopover: webpage preview states', () => {
	it('BLOCKED: the roles dropdown stays enabled and Save stays open', async () => {
		mocks.preview.data = okPreview({ title: null, siteName: null, fetch: fetchOf('BLOCKED', 403) });
		await openWith(ARXIV);
		await settle();
		expect(statusText()).toHaveTextContent('(HTTP 403)');
		expect(pickerButton()).toBeEnabled();
		expect(submit()).toBeEnabled();
	});

	it('already saved: the roles dropdown is hidden and Save is disabled, labelled Already saved', async () => {
		mocks.preview.data = okPreview({ alreadyExistsContentId: '7' });
		await openWith(ARXIV);
		await settle();
		expect(pickerButton()).toBeNull();
		expect(document.querySelector('a[href="/content-library?open=7"]')).toHaveTextContent('open it');
		expect(submit()).toHaveTextContent('Already saved');
		expect(submit()).toBeDisabled();
	});

	it('preview request failed: Save still works', async () => {
		mocks.preview.data = undefined;
		mocks.preview.isError = true;
		await openWith(ARXIV);
		await settle();
		expect(statusText()).toHaveTextContent("Couldn't load a preview");
		expect(submit()).toBeEnabled();
	});

	it('loading: a settled url whose preview is still pending shows the reading state', async () => {
		mocks.preview.data = undefined;
		mocks.preview.isPending = true;
		await openWith(ARXIV);
		await settle();
		expect(screen.getByText(/reading the page/i)).toBeInTheDocument();
	});
});

describe('AddContentPopover: webpage preview debounce', () => {
	it('no preview is requested while the link is still being typed, only after the pause', async () => {
		await openWith('https://arxiv.org/abs/17');
		expect(mocks.previewUrl.get()).toBeNull();
		await type('https://arxiv.org/abs/1706');
		await type(ARXIV);
		expect(mocks.previewUrl.get()).toBeNull();
		await settle();
		expect(mocks.previewUrl.get()).toBe(ARXIV);
	});

	it('text that is not a web link never requests a preview', async () => {
		await openWith('John 3:16');
		await settle();
		expect(mocks.previewUrl.get()).toBeNull();
	});
});
