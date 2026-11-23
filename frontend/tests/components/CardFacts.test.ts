import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CardFacts from '#lib/components/CardFacts.svelte';

const facts = [{ text: '5:19' }, { text: '60.5 K views' }, { text: '1.0 K likes' }];
const items = () => screen.getAllByTestId('card-fact');

describe('CardFacts', () => {
	it('renders every fact, in order', () => {
		render(CardFacts, { props: { facts, testid: 'facts' } });
		expect(items().map((item) => item.textContent?.replace('·', '').trim())).toEqual([
			'5:19',
			'60.5 K views',
			'1.0 K likes',
		]);
	});

	it('puts a separator before every fact except the first', () => {
		render(CardFacts, { props: { facts, testid: 'facts' } });
		const [first, ...rest] = items();
		expect(first.querySelector('[aria-hidden="true"]')).toBeNull();
		for (const item of rest) {
			expect(item.querySelector('[aria-hidden="true"]')?.textContent).toBe('·');
		}
	});

	it('keeps each separator inside the fact it leads, so a wrap can never strand it at the end of a line', () => {
		render(CardFacts, { props: { facts, testid: 'facts' } });
		const row = screen.getByTestId('facts');
		expect(row.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
		for (const dot of row.querySelectorAll('[aria-hidden="true"]')) {
			expect(dot.parentElement?.getAttribute('data-testid')).toBe('card-fact');
		}
	});

	it('clips the separator of whichever fact starts a line: the row is pulled left by the separator width inside a clipping wrapper', () => {
		render(CardFacts, { props: { facts, testid: 'facts' } });
		const wrapper = screen.getByTestId('facts');
		expect(wrapper.className).toContain('overflow-hidden');
		expect(wrapper.firstElementChild?.className).toContain('-ml-4');
		for (const item of items()) expect(item.className).toContain('pl-4');
	});

	it('wraps a fact as a unit, never inside itself ("60.5 K / views")', () => {
		render(CardFacts, { props: { facts, testid: 'facts' } });
		for (const item of items()) expect(item.className).toContain('whitespace-nowrap');
	});

	it('renders a pill fact as a pill, so a long label truncates instead of breaking into two lines', () => {
		render(CardFacts, {
			props: { facts: [{ text: '2010' }, { text: 'Epic Fantasy Adventure', pill: 'category' }], testid: 'facts' },
		});
		const pill = screen.getByText('Epic Fantasy Adventure');
		expect(pill).toHaveAttribute('data-pill', 'category');
		expect(pill.className).toContain('truncate');
	});

	it('renders a role pill with its own pill style', () => {
		render(CardFacts, { props: { facts: [{ text: 'Blog post', pill: 'role' }], testid: 'facts' } });
		expect(screen.getByText('Blog post')).toHaveAttribute('data-pill', 'role');
	});

	it('renders an empty row (no stray separator) when there are no facts', () => {
		render(CardFacts, { props: { facts: [], testid: 'facts' } });
		expect(screen.getByTestId('facts').textContent?.trim()).toBe('');
		expect(screen.queryAllByTestId('card-fact')).toHaveLength(0);
	});

	it('shows a single fact with no separator at all', () => {
		render(CardFacts, { props: { facts: [{ text: '1999' }], testid: 'facts' } });
		expect(screen.getByTestId('facts').textContent?.trim()).toBe('1999');
	});
});
