import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PassageLinks from '$lib/components/PassageLinks.svelte';
import { createBibleVersionStore } from '$lib/utils/bibleVersion.svelte';

const GEN_1_1_5 = { startVerseId: 1, endVerseId: 5 };
// Psalms 51:10 — find the ordinal from the book table rather than hard-coding.
import { rangeToVerseIds } from '$lib/utils/bible';
const psalm51 = rangeToVerseIds({ bookId: 19, startChapter: 51, startVerse: 10, endChapter: 51, endVerse: 10 })!;

describe('PassageLinks', () => {
	beforeEach(() => localStorage.clear());

	it('links to Bible Gateway in the default version (ESV) in a new tab', () => {
		render(PassageLinks, { props: { ...GEN_1_1_5, store: createBibleVersionStore() } });
		const link = screen.getByRole('link', { name: /read on bible gateway/i });
		expect(link.getAttribute('href')).toBe('https://www.biblegateway.com/passage/?search=Genesis+1%3A1-5&version=ESV');
		expect(link.getAttribute('target')).toBe('_blank');
		expect(link.getAttribute('rel')).toBe('noopener noreferrer');
	});

	it('updates the link when the reader picks another version', async () => {
		render(PassageLinks, { props: { ...GEN_1_1_5, store: createBibleVersionStore() } });
		await fireEvent.change(screen.getByLabelText(/bible gateway version/i), { target: { value: 'NIV' } });
		expect(screen.getByRole('link', { name: /read on bible gateway/i }).getAttribute('href')).toContain('version=NIV');
	});

	it('shows no versification note for a normal pair', () => {
		render(PassageLinks, { props: { ...GEN_1_1_5, store: createBibleVersionStore() } });
		expect(screen.queryByText(/numbering differs/i)).not.toBeInTheDocument();
	});

	it('degrades to a chapter link with a note for NABRE x Psalms', async () => {
		render(PassageLinks, {
			props: { startVerseId: psalm51.startId, endVerseId: psalm51.endId, store: createBibleVersionStore() },
		});
		await fireEvent.change(screen.getByLabelText(/bible gateway version/i), { target: { value: 'NABRE' } });
		expect(screen.getByText(/numbering differs in NABRE/i)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /read on bible gateway/i }).getAttribute('href')).toContain(
			'search=Psalms+51&',
		);
	});

	it('keeps commentaries collapsed by default and exposes the verified links when opened', async () => {
		render(PassageLinks, { props: { ...GEN_1_1_5, store: createBibleVersionStore() } });
		const details = screen.getByText(/commentaries/i).closest('details')!;
		expect(details.open).toBe(false);
		details.open = true;
		expect(screen.getByRole('link', { name: /matthew henry/i }).getAttribute('href')).toBe(
			'https://biblehub.com/commentaries/mhc/genesis/1.htm',
		);
		expect(screen.getByRole('link', { name: /multiple commentators/i }).getAttribute('href')).toBe(
			'https://biblehub.com/commentaries/genesis/1-1.htm',
		);
	});

	it('renders nothing for a range that spans books', () => {
		const { container } = render(PassageLinks, {
			props: { startVerseId: 1, endVerseId: 31102, store: createBibleVersionStore() },
		});
		expect(container.querySelector('a')).toBeNull();
	});
});
