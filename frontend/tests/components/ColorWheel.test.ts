import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ColorWheel from '$lib/components/theme/ColorWheel.svelte';

// Only the load-failure state is tested: the happy path is the third-party
// canvas widget, which jsdom can't render.
vi.mock('@jaames/iro', () => {
	throw new Error('Failed to fetch dynamically imported module');
});

describe('ColorWheel', () => {
	it('shows a reload prompt instead of an empty picker when the widget fails to load', async () => {
		render(ColorWheel, { props: { value: '#336699', onChange: vi.fn() } });
		expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the colour picker");
	});
});
