import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import WordPopover from '$lib/components/interlinear/WordPopover.svelte';
import type { InterlinearWord } from '$lib/queries/bible';

const hebrew: InterlinearWord = {
	id: 1,
	language: 'heb',
	source: 'בָּרָא',
	translit: "ba.Ra'",
	parsing: 'Verb - Qal - Perfect - third person masculine singular',
	strongs: 'H1254A',
	gloss: 'to create',
	tagSource: 'tagged',
	sourceOrder: 1,
	segment: 2,
};
const greek: InterlinearWord = {
	...hebrew,
	id: 2,
	language: 'grc',
	source: 'μονογενῆ',
	translit: 'monogenē',
	strongs: 'G3439',
	gloss: 'unique',
};

describe('WordPopover', () => {
	it('shows the formatted number, language, source word, transliteration, gloss and parsing', () => {
		render(WordPopover, { props: { word: hebrew, english: 'created', left: 10, top: 20, id: 'pop' } });
		expect(screen.getByText('H1254')).toBeInTheDocument();
		expect(screen.getByText('Hebrew')).toBeInTheDocument();
		expect(screen.getByText('בָּרָא')).toBeInTheDocument();
		expect(screen.getByText("ba.Ra'")).toBeInTheDocument();
		expect(screen.getByText('to create')).toBeInTheDocument();
		expect(screen.getByText(/third person masculine singular/)).toBeInTheDocument();
		expect(screen.getByText(/Rendered here as “created”/)).toBeInTheDocument();
	});

	it('is a non-interactive tooltip positioned where it was told to be', () => {
		render(WordPopover, { props: { word: hebrew, english: null, left: 10, top: 20, id: 'pop' } });
		const tip = screen.getByRole('tooltip');
		expect(tip).toHaveAttribute('id', 'pop');
		expect(tip.style.left).toBe('10px');
		expect(tip.style.top).toBe('20px');
	});

	it('renders Hebrew right-to-left', () => {
		render(WordPopover, { props: { word: hebrew, english: null, left: 0, top: 0, id: 'p' } });
		expect(screen.getByText('Hebrew')).toBeInTheDocument();
		expect(screen.getByText(hebrew.source)).toHaveAttribute('dir', 'rtl');
	});

	it('renders Greek left-to-right', () => {
		render(WordPopover, { props: { word: greek, english: null, left: 0, top: 0, id: 'p' } });
		expect(screen.getByText('Greek')).toBeInTheDocument();
		expect(screen.getByText(greek.source)).toHaveAttribute('dir', 'ltr');
	});

	it('omits the parsing line when parsing is empty', () => {
		render(WordPopover, { props: { word: { ...hebrew, parsing: '' }, english: null, left: 0, top: 0, id: 'p' } });
		expect(screen.queryByText(/third person masculine singular/)).not.toBeInTheDocument();
		expect(screen.getByTestId('popover-gloss')).toBeInTheDocument();
	});

	it('shows the rendered-as line together with the gloss', () => {
		render(WordPopover, { props: { word: hebrew, english: 'created', left: 0, top: 0, id: 'p' } });
		expect(screen.getByTestId('popover-gloss')).toHaveTextContent('to create');
		expect(screen.getByText(/Rendered here as/)).toBeInTheDocument();
	});

	it('shows the rendered-as line even when the gloss is empty', () => {
		render(WordPopover, { props: { word: { ...hebrew, gloss: '' }, english: 'created', left: 0, top: 0, id: 'p' } });
		expect(screen.queryByTestId('popover-gloss')).not.toBeInTheDocument();
		expect(screen.getByText(/Rendered here as/)).toBeInTheDocument();
	});

	it('omits the rendered-as line and the meaning when there is none', () => {
		render(WordPopover, { props: { word: { ...hebrew, gloss: '' }, english: null, left: 0, top: 0, id: 'p' } });
		expect(screen.queryByText(/Rendered here as/)).not.toBeInTheDocument();
		expect(screen.queryByTestId('popover-gloss')).not.toBeInTheDocument();
	});

	it('keeps long parsing text inside the popover (wraps, never overflows)', () => {
		render(WordPopover, { props: { word: hebrew, english: null, left: 0, top: 0, id: 'p' } });
		const parsing = screen.getByText(/third person masculine singular/);
		expect(parsing.className).toMatch(/break-words|whitespace-normal/);
	});
});
