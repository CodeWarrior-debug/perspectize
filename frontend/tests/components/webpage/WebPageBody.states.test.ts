import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import WebPageBody from '$lib/components/WebPageBody.svelte';
import WebPageTiles from '$lib/components/WebPageTiles.svelte';

describe('WebPageBody states', () => {
	it('loading (no description yet): says it is loading, never "no description"', () => {
		render(WebPageBody, { props: { row: { description: null, response: null }, state: 'loading' } });
		expect(screen.getByRole('status').textContent).toMatch(/loading/i);
		expect(screen.queryByText('This page has no description.')).toBeNull();
	});

	it('failed (no description): says it could not load, never "no description"', () => {
		render(WebPageBody, { props: { row: { description: null, response: null }, state: 'failed' } });
		expect(screen.getByText(/couldn.t load/i)).toBeInTheDocument();
		expect(screen.queryByText('This page has no description.')).toBeNull();
	});

	it('loaded with no description anywhere: the no-description line', () => {
		render(WebPageBody, { props: { row: { description: null, response: { description: null } }, state: 'loaded' } });
		expect(screen.getByText('This page has no description.')).toBeInTheDocument();
	});

	it('falls back to the description in the loaded page metadata', () => {
		render(WebPageBody, {
			props: { row: { description: null, response: { description: 'From the page head.' } }, state: 'loaded' },
		});
		expect(screen.getByText('From the page head.')).toBeInTheDocument();
	});

	it('a description already on the row shows even while details load', () => {
		render(WebPageBody, { props: { row: { description: 'On the row.', response: null }, state: 'loading' } });
		expect(screen.getByText('On the row.')).toBeInTheDocument();
	});
});

describe('WebPageTiles loading state', () => {
	it('shows a placeholder in the Fetched tile while the details load, not a dash', () => {
		render(WebPageTiles, {
			props: { row: { url: null, webPage: null, response: null } as never, loading: true },
		});
		const tile = screen.getByText('Fetched', { selector: 'div' }).parentElement;
		expect(tile?.lastElementChild?.textContent?.trim()).toBe('…');
	});
});
