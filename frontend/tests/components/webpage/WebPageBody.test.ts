import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import WebPageBody from '$lib/components/WebPageBody.svelte';

describe('WebPageBody', () => {
	it('shows the page description when it has one', () => {
		render(WebPageBody, { props: { row: { description: 'A short summary of the post.' } } });
		expect(screen.getByText('Description')).toBeTruthy();
		expect(screen.getByText('A short summary of the post.')).toBeTruthy();
		expect(screen.queryByText('This page has no description.')).toBeNull();
	});

	it('shows the no-description line when the description is null', () => {
		render(WebPageBody, { props: { row: { description: null } } });
		expect(screen.getByText('This page has no description.')).toBeTruthy();
	});

	it('treats a whitespace-only description as no description', () => {
		render(WebPageBody, { props: { row: { description: '   ' } } });
		expect(screen.getByText('This page has no description.')).toBeTruthy();
	});

	it('has no related-content section', () => {
		render(WebPageBody, { props: { row: { description: 'x' } } });
		expect(screen.queryByText(/related/i)).toBeNull();
	});
});
