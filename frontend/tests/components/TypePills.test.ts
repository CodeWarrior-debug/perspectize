import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TypePills from '$lib/components/TypePills.svelte';

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
});
