import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TypePills from '#lib/components/TypePills.svelte';

/** jsdom does no layout, so scroll geometry is faked on the scroller element. */
async function setScroll(scroller: HTMLElement, m: { scrollLeft: number; scrollWidth: number; clientWidth: number }) {
	for (const [key, value] of Object.entries(m)) {
		Object.defineProperty(scroller, key, { value, configurable: true });
	}
	await fireEvent.scroll(scroller);
}

const leftArrow = () => screen.queryByRole('button', { name: 'Scroll types left' });
const rightArrow = () => screen.queryByRole('button', { name: 'Scroll types right' });

describe('TypePills', () => {
	it('renders nothing when no type filter is set', () => {
		const { container } = render(TypePills, { props: { filters: {}, onSelect: vi.fn() } });
		expect(container.querySelectorAll('button')).toHaveLength(0);
	});

	it('renders nothing when two types are selected', () => {
		const { container } = render(TypePills, {
			props: { filters: { type: 'youtube_video,movie' }, onSelect: vi.fn() },
		});
		expect(container.querySelectorAll('button')).toHaveLength(0);
	});

	it('renders a pill for every other type when exactly one is selected', () => {
		render(TypePills, { props: { filters: { type: 'youtube_video' }, onSelect: vi.fn() } });
		expect(screen.getByRole('button', { name: 'Show only Movie' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Show only Bible Passage' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Show only YouTube Video' })).not.toBeInTheDocument();
	});

	it('calls onSelect with the pill type value when clicked', async () => {
		const onSelect = vi.fn();
		render(TypePills, { props: { filters: { type: 'youtube_video' }, onSelect } });
		await fireEvent.click(screen.getByRole('button', { name: 'Show only Movie' }));
		expect(onSelect).toHaveBeenCalledWith('movie');
	});

	it('shows no scroll arrows and no All types list while every pill fits', () => {
		render(TypePills, { props: { filters: { type: 'youtube_video' }, onSelect: vi.fn() } });
		expect(leftArrow()).not.toBeInTheDocument();
		expect(rightArrow()).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Search all types' })).not.toBeInTheDocument();
	});

	describe('when the pills overflow the row', () => {
		const geometry = { scrollWidth: 1000, clientWidth: 400 };

		it('at the start shows only the right arrow', async () => {
			render(TypePills, { props: { filters: { type: 'youtube_video' }, onSelect: vi.fn() } });
			await setScroll(screen.getByTestId('type-pills-scroller'), { scrollLeft: 0, ...geometry });
			expect(rightArrow()).toBeInTheDocument();
			expect(leftArrow()).not.toBeInTheDocument();
		});

		it('in the middle shows both arrows', async () => {
			render(TypePills, { props: { filters: { type: 'youtube_video' }, onSelect: vi.fn() } });
			await setScroll(screen.getByTestId('type-pills-scroller'), { scrollLeft: 300, ...geometry });
			expect(leftArrow()).toBeInTheDocument();
			expect(rightArrow()).toBeInTheDocument();
		});

		it('at the end shows only the left arrow', async () => {
			render(TypePills, { props: { filters: { type: 'youtube_video' }, onSelect: vi.fn() } });
			await setScroll(screen.getByTestId('type-pills-scroller'), { scrollLeft: 600, ...geometry });
			expect(leftArrow()).toBeInTheDocument();
			expect(rightArrow()).not.toBeInTheDocument();
		});

		it('an arrow scrolls the row by most of its visible width, in its own direction', async () => {
			render(TypePills, { props: { filters: { type: 'youtube_video' }, onSelect: vi.fn() } });
			const scroller = screen.getByTestId('type-pills-scroller');
			const scrollBy = vi.fn();
			scroller.scrollBy = scrollBy;
			await setScroll(scroller, { scrollLeft: 300, ...geometry });

			await fireEvent.click(rightArrow()!);
			expect(scrollBy).toHaveBeenLastCalledWith({ left: 320, behavior: 'smooth' });
			await fireEvent.click(leftArrow()!);
			expect(scrollBy).toHaveBeenLastCalledWith({ left: -320, behavior: 'smooth' });
		});
	});
});
