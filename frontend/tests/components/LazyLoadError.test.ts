import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import LazyLoadError from '$lib/components/LazyLoadError.svelte';

describe('LazyLoadError', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('names what failed and offers a reload', () => {
		render(LazyLoadError, { props: { what: 'the perspective editor' } });
		expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the perspective editor");
		expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
	});

	it('reloads the page when Reload is clicked', async () => {
		const reload = vi.fn();
		vi.stubGlobal('location', { ...window.location, reload });
		render(LazyLoadError, { props: { what: 'the activity table' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
		expect(reload).toHaveBeenCalledOnce();
	});

	it('renders inline by default and as a fixed banner when floating', () => {
		const { unmount } = render(LazyLoadError, { props: { what: 'x' } });
		expect(screen.getByRole('alert').className).not.toContain('fixed');
		unmount();
		render(LazyLoadError, { props: { what: 'x', floating: true } });
		expect(screen.getByRole('alert').className).toContain('fixed');
	});
});
