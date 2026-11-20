import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import WebPageImportPreview from '$lib/components/webpage/WebPageImportPreview.svelte';
import type { WebPageFetch, WebPagePreview } from '$lib/queries/content';

const URL = 'https://arxiv.org/abs/1706.03762';

const fetchOf = (status: WebPageFetch['status'], httpStatus: number | null = 200): WebPageFetch => ({
	status,
	httpStatus,
	at: '2026-11-11T12:00:00Z',
});

function previewOf(overrides: Partial<WebPagePreview> = {}): WebPagePreview {
	return {
		finalUrl: URL,
		domain: 'arxiv.org',
		siteName: 'arXiv.org',
		title: 'Attention Is All You Need',
		description: 'The dominant sequence transduction models are based on complex recurrent networks.',
		imageUrl: 'https://arxiv.org/static/og.png',
		faviconUrl: 'https://arxiv.org/favicon.ico',
		publishedAt: '2017-06-12',
		lang: 'en',
		author: null,
		fetch: fetchOf('OK'),
		alreadyExistsContentId: null,
		...overrides,
	};
}

function renderPanel(props: {
	preview: WebPagePreview | null;
	loading?: boolean;
	failed?: boolean;
	roles?: ('BLOG_POST' | 'SESSION_TRANSCRIPT')[];
	disabled?: boolean;
}) {
	const onRolesChange = vi.fn();
	render(WebPageImportPreview, {
		props: {
			url: URL,
			preview: props.preview,
			loading: props.loading ?? false,
			failed: props.failed ?? false,
			roles: props.roles ?? [],
			onRolesChange,
			disabled: props.disabled ?? false,
		},
	});
	return { onRolesChange };
}

const picker = () => screen.queryByRole('button', { name: 'Roles' });

describe('WebPageImportPreview', () => {
	it('loading: says the page is being read, and the roles picker is still usable', () => {
		renderPanel({ preview: null, loading: true });
		expect(screen.getByText(/reading the page/i)).toBeInTheDocument();
		expect(picker()).not.toBeNull();
		expect(picker()).toBeEnabled();
	});

	it('OK: shows the title, site, description, image and published date', () => {
		renderPanel({ preview: previewOf() });
		expect(screen.getByText('Attention Is All You Need')).toBeInTheDocument();
		expect(screen.getByText('arXiv.org')).toBeInTheDocument();
		expect(screen.getByText(/dominant sequence transduction/)).toBeInTheDocument();
		expect(screen.getByText(/2017-06-12/)).toBeInTheDocument();
		expect(document.querySelector('img')).toHaveAttribute('src', 'https://arxiv.org/static/og.png');
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('OK with an author: shows the author line', () => {
		renderPanel({ preview: previewOf({ author: 'Ashish Vaswani' }) });
		expect(screen.getByText('By Ashish Vaswani')).toBeInTheDocument();
	});

	it('OK without an author: no author line at all (missing is not a guess)', () => {
		renderPanel({ preview: previewOf({ author: null }) });
		expect(screen.queryByText(/^By /)).toBeNull();
	});

	it('the image is loaded without a referrer and lazily', () => {
		renderPanel({ preview: previewOf() });
		const img = document.querySelector('img');
		expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
		expect(img).toHaveAttribute('loading', 'lazy');
	});

	it('an image that fails to load falls back to the globe glyph', async () => {
		renderPanel({ preview: previewOf() });
		await fireEvent.error(document.querySelector('img')!);
		expect(document.querySelector('img')).toBeNull();
		expect(screen.getByTestId('webpage-glyph')).toBeInTheDocument();
	});

	it('no image at all shows the glyph straight away', () => {
		renderPanel({ preview: previewOf({ imageUrl: null }) });
		expect(document.querySelector('img')).toBeNull();
		expect(screen.getByTestId('webpage-glyph')).toBeInTheDocument();
	});

	it('BLOCKED: says the page could not be read, names the HTTP status, and keeps the roles picker enabled', () => {
		renderPanel({
			preview: previewOf({ title: null, siteName: null, description: null, fetch: fetchOf('BLOCKED', 403) }),
		});
		expect(screen.getByRole('status')).toHaveTextContent(
			"We couldn't read this page's details (HTTP 403). You can still save the link.",
		);
		expect(picker()).toBeEnabled();
	});

	it('TIMEOUT with no HTTP status never prints "HTTP null"', () => {
		renderPanel({ preview: previewOf({ fetch: fetchOf('TIMEOUT', null) }) });
		expect(screen.getByRole('status')).toHaveTextContent(
			"We couldn't read this page's details. You can still save the link.",
		);
		expect(screen.getByRole('status')).not.toHaveTextContent('null');
	});

	it('NOT_HTML: says there is no page to read, not that the read failed', () => {
		renderPanel({ preview: previewOf({ fetch: fetchOf('NOT_HTML', 200) }) });
		expect(screen.getByRole('status')).toHaveTextContent("This link isn't an HTML page");
	});

	it('already saved: says so with a link to the row, and hides the roles picker (the stored roles win)', () => {
		renderPanel({ preview: previewOf({ alreadyExistsContentId: '7' }) });
		expect(screen.getByText(/already saved/i)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'open it' })).toHaveAttribute('href', '/content-library?open=7');
		expect(picker()).toBeNull();
	});

	it('preview request failed (network): says so, and Save stays open with the roles picker', () => {
		renderPanel({ preview: null, failed: true });
		expect(screen.getByRole('status')).toHaveTextContent("Couldn't load a preview. You can still save the link.");
		expect(picker()).toBeEnabled();
	});

	it('disabled while the add is pending: the roles picker cannot be used', () => {
		renderPanel({ preview: previewOf(), disabled: true });
		expect(picker()).toBeDisabled();
	});
});
