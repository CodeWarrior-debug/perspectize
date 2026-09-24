import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import InterlinearPassage from '$lib/components/interlinear/InterlinearPassage.svelte';
import type { InterlinearVerse } from '$lib/queries/bible';

const word = (id: number, strongs: string, gloss: string, segment: number | null, source = `s${id}`) => ({
	id,
	language: 'heb' as const,
	source,
	translit: `t${id}`,
	parsing: '',
	strongs,
	gloss,
	tagSource: 'tagged' as const,
	sourceOrder: id,
	segment,
});

// Genesis 1:1: English "In the beginning | God | created | the heavens…"; Hebrew order beginning, created, God, marker.
const gen11: InterlinearVerse = {
	verseId: 1,
	chapter: 1,
	verse: 1,
	segments: [
		{ text: 'In the beginning', spaceBefore: false },
		{ text: 'God', spaceBefore: true },
		{ text: 'created', spaceBefore: true },
		{ text: 'the heavens and the earth.', spaceBefore: true },
	],
	words: [
		word(0, 'H7225G', 'first: beginning', 0),
		word(1, 'H1254A', 'to create', 2),
		word(2, 'H0430G', 'God', 1),
		word(3, 'H0853', '[Obj.]', null),
	],
};

const plain = (verseId: number, verse: number, text: string) => ({ verseId, chapter: 1, verse, text });

afterEach(() => vi.restoreAllMocks());

describe('InterlinearPassage', () => {
	it('renders the phrases of a verse with data, in English order, and one chip per source word in original order', () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const phrases = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-segment'));
		expect(phrases.map((p) => p.textContent?.trim())).toEqual(['In the beginning', 'God', 'created']);
		const chips = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-chip'));
		// original order: beginning, created, God, marker  (the Genesis 1:1 swap)
		expect(chips.map((c) => c.getAttribute('data-chip'))).toEqual(['1:0', '1:1', '1:2', '1:3']);
		// the trailing English-only text is plain, not a button
		expect(screen.getByText('the heavens and the earth.')).toBeInTheDocument();
	});

	it('a verse without alignment data renders as plain text next to a verse that has it', () => {
		render(InterlinearPassage, {
			props: { verses: [plain(1, 1, 'ignored'), plain(2, 2, 'Now the earth was formless.')], interlinear: [gen11] },
		});
		expect(screen.getByText('Now the earth was formless.')).toBeInTheDocument();
		expect(screen.queryByText('ignored')).not.toBeInTheDocument();
	});

	it('hovering a phrase shows the popover for its first source word; leaving hides it', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const created = screen.getByRole('button', { name: 'created' });
		await fireEvent.mouseOver(created);
		const tip = await screen.findByRole('tooltip');
		expect(tip).toHaveTextContent('H1254');
		expect(tip).toHaveTextContent('to create');
		await fireEvent.mouseOut(created);
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
	});

	it('click pins the popover so it survives leaving; Escape clears it', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const god = screen.getByRole('button', { name: 'God' });
		await fireEvent.click(god);
		await fireEvent.mouseOut(god);
		expect(await screen.findByRole('tooltip')).toHaveTextContent('H430');
		await fireEvent.keyDown(document, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
	});

	it('Escape with a popover showing does not reach a bubble-phase document listener (the dialog); a second Escape does', async () => {
		const spy = vi.fn();
		document.addEventListener('keydown', spy);
		try {
			render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
			await fireEvent.click(screen.getByRole('button', { name: 'God' }));
			expect(await screen.findByRole('tooltip')).toBeInTheDocument();
			await fireEvent.keyDown(document.body, { key: 'Escape' });
			expect(spy).not.toHaveBeenCalled();
			await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
			await fireEvent.keyDown(document.body, { key: 'Escape' });
			expect(spy).toHaveBeenCalledTimes(1);
		} finally {
			document.removeEventListener('keydown', spy);
		}
	});

	it('double-click clears a pinned popover', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const god = screen.getByRole('button', { name: 'God' });
		await fireEvent.click(god);
		await fireEvent.dblClick(god);
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
	});

	it('the phrase whose primary word is active is described by the popover; others are not', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const god = screen.getByRole('button', { name: 'God' });
		const created = screen.getByRole('button', { name: 'created' });
		expect(god).not.toHaveAttribute('aria-describedby');
		await fireEvent.mouseOver(god);
		await screen.findByRole('tooltip');
		expect(god).toHaveAttribute('aria-describedby', 'interlinear-popover');
		expect(created).not.toHaveAttribute('aria-describedby');
	});

	it('a pointerdown outside the component clears a pinned popover (tap-away)', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		await fireEvent.click(screen.getByRole('button', { name: 'God' }));
		expect(await screen.findByRole('tooltip')).toBeInTheDocument();
		await fireEvent.pointerDown(document.body);
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
	});

	it('focus leaving a phrase clears the hover popover', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const god = screen.getByRole('button', { name: 'God' });
		await fireEvent.focusIn(god);
		expect(await screen.findByRole('tooltip')).toBeInTheDocument();
		await fireEvent.focusOut(god);
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
	});

	it('clicking a chip pins it, and the pin survives mouseout', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const chip = screen.getAllByRole('button').find((b) => b.getAttribute('data-chip') === '1:2')!;
		await fireEvent.click(chip);
		await fireEvent.mouseOut(chip);
		expect(await screen.findByRole('tooltip')).toHaveTextContent('H430');
	});

	it('clicking the pinned word a second time unpins it: the popover goes once the pointer leaves', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const god = screen.getByRole('button', { name: 'God' });
		await fireEvent.click(god);
		await fireEvent.click(god);
		await fireEvent.mouseOut(god);
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
	});

	it('hovering a chip shows its word, and a word with no phrase still gets a popover but no connector', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const marker = screen.getAllByRole('button').find((b) => b.getAttribute('data-chip') === '1:3')!;
		await fireEvent.mouseOver(marker);
		expect((await screen.findByRole('tooltip')).textContent).toContain('[Obj.]');
		expect(screen.queryByTestId('connector')).not.toBeInTheDocument();
	});

	it('draws the connector from the phrase to the right chip (God -> the 3rd chip)', async () => {
		// jsdom has no layout: give elements deterministic boxes based on their data attributes
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
			const seg = this.getAttribute('data-segment');
			const chip = this.getAttribute('data-chip');
			if (seg !== null) {
				const i = Number(seg.split(':')[1]);
				return rect(100 + i * 100, 100, 160 + i * 100, 120);
			}
			if (chip !== null) {
				const i = Number(chip.split(':')[1]);
				return rect(100 + i * 50, 300, 140 + i * 50, 340);
			}
			return rect(0, 0, 800, 600);
		});
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		await fireEvent.mouseOver(screen.getByRole('button', { name: 'God' }));
		const line = await screen.findByTestId('connector');
		const l = line.querySelector('line')!;
		// God is segment 1: bottom-centre (100+100+30=230, 120); its chip is word 2: top-centre (100+100+20=220, 300)
		expect(Number(l.getAttribute('x1'))).toBe(230);
		expect(Number(l.getAttribute('y1'))).toBe(120);
		expect(Number(l.getAttribute('x2'))).toBe(220);
		expect(Number(l.getAttribute('y2'))).toBe(300);
	});

	it('phrases and chips are focusable; focus opens the popover like hover', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const god = screen.getByRole('button', { name: 'God' });
		god.focus();
		await fireEvent.focusIn(god);
		expect(await screen.findByRole('tooltip')).toHaveTextContent('H430');
	});

	it('Hebrew chips render right-to-left', () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const chip = screen.getAllByRole('button').find((b) => b.getAttribute('data-chip') === '1:0')!;
		expect(chip.querySelector('[dir="rtl"]')).not.toBeNull();
	});

	it('renders nothing extra when the interlinear list is empty (all verses plain)', () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'In the beginning.')], interlinear: [] } });
		expect(screen.getByText('In the beginning.')).toBeInTheDocument();
		expect(screen.queryAllByRole('button')).toHaveLength(0);
	});

	it('a pinned word whose verse is collapsed away (interlinear unchanged) loses its popover and connector for good', async () => {
		const gen12: InterlinearVerse = {
			verseId: 2,
			chapter: 1,
			verse: 2,
			segments: [{ text: 'Now the earth', spaceBefore: false }],
			words: [word(0, 'H0776G', 'earth', 0)],
		};
		const interlinear = [gen11, gen12];
		const { rerender } = render(InterlinearPassage, {
			props: { verses: [plain(1, 1, 'x'), plain(2, 2, 'y')], interlinear },
		});
		await fireEvent.click(screen.getByRole('button', { name: 'God' }));
		expect(await screen.findByRole('tooltip')).toBeInTheDocument();
		// collapse: only the verses prop changes; interlinear still contains the pinned verse
		await rerender({ verses: [plain(2, 2, 'y')], interlinear });
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
		expect(screen.queryByTestId('connector')).not.toBeInTheDocument();
		// re-expand: the old pin must not come back
		await rerender({ verses: [plain(1, 1, 'x'), plain(2, 2, 'y')], interlinear });
		expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
		expect(screen.queryByTestId('connector')).not.toBeInTheDocument();
	});
});

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
	return {
		left,
		top,
		right,
		bottom,
		width: right - left,
		height: bottom - top,
		x: left,
		y: top,
		toJSON() {},
	} as DOMRect;
}
