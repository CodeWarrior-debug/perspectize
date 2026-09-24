import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PassagePositionBar from '$lib/components/PassagePositionBar.svelte';

describe('PassagePositionBar', () => {
	it('shows the ordinal label', () => {
		render(PassagePositionBar, { props: { startVerseId: 1, endVerseId: 5 } });
		expect(screen.getByText(/Verses 1–5 of 31,102 · Genesis \(book 1 of 66\)/)).toBeInTheDocument();
	});

	it('keeps percentages out of the label and in the tooltip only', () => {
		render(PassagePositionBar, { props: { startVerseId: 1, endVerseId: 5 } });
		expect(screen.getByText(/Verses 1–5/).textContent).not.toMatch(/%/);
		expect(screen.getByTestId('position-bar').getAttribute('title')).toMatch(/0\.02% through Scripture/);
	});

	it('enforces a minimum visible width on a tiny passage segment', () => {
		render(PassagePositionBar, { props: { startVerseId: 1, endVerseId: 1 } });
		const segment = screen.getByTestId('position-segment');
		expect(segment.style.minWidth).toBe('4px');
		expect(parseFloat(segment.style.width)).toBeLessThan(0.01);
	});

	it('marks the Old/New Testament boundary', () => {
		render(PassagePositionBar, { props: { startVerseId: 1, endVerseId: 5 } });
		expect(screen.getByTestId('nt-boundary')).toBeInTheDocument();
	});

	it('renders nothing for a range that spans books or is out of range', () => {
		const { container } = render(PassagePositionBar, { props: { startVerseId: 1, endVerseId: 31102 } });
		expect(container.querySelector('[data-testid="position-bar"]')).toBeNull();
	});
});
