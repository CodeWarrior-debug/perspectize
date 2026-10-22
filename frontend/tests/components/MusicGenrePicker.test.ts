import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import MusicGenrePicker from '$lib/components/MusicGenrePicker.svelte';

const genres = [
	{ id: '21', name: 'Rock', parentId: null },
	{ id: '1152', name: 'Hard Rock', parentId: '21' },
	{ id: '19', name: 'Regional & Cultural', parentId: null },
	{ id: '1122', name: 'Brazilian', parentId: '19' },
	{ id: '1223', name: 'Forró', parentId: '1122' },
	{ id: '18', name: 'Hip-Hop/Rap', parentId: null },
	{ id: '1073', name: 'Hip-Hop', parentId: '18' },
	{ id: '5', name: 'Classical', parentId: null },
];

function setup(value: string | null = null) {
	const onSelect = vi.fn();
	render(MusicGenrePicker, { props: { genres, value, onSelect } });
	return { onSelect, trigger: screen.getByRole('button', { name: value ? /›|Rock|Classical/ : 'Choose a genre' }) };
}

const treeNames = () => screen.queryAllByRole('treeitem').map((li) => li.querySelector('.pick')!.textContent!.trim());

describe('MusicGenrePicker', () => {
	beforeEach(() => localStorage.clear());

	it('closed: shows the chosen path, or a prompt', () => {
		render(MusicGenrePicker, { props: { genres, value: '1152', onSelect: vi.fn() } });
		expect(screen.getByRole('button', { name: 'Rock › Hard Rock' })).toBeInTheDocument();
		expect(screen.queryByRole('tree')).not.toBeInTheDocument();
	});

	it('open: roots are alphabetical and collapsed', async () => {
		const { trigger } = setup();
		await fireEvent.click(trigger);
		expect(treeNames()).toEqual(['Classical', 'Hip-Hop/Rap', 'Regional & Cultural', 'Rock']);
	});

	it('clicking a parent name toggles it; clicking a leaf picks it and closes', async () => {
		const { trigger, onSelect } = setup();
		await fireEvent.click(trigger);
		await fireEvent.click(screen.getByRole('button', { name: 'Rock' }));
		expect(screen.getByRole('button', { name: 'Hard Rock' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Rock' }));
		expect(screen.queryByRole('button', { name: 'Hard Rock' })).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Expand Rock' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Hard Rock' }));
		expect(onSelect).toHaveBeenCalledWith('1152');
		expect(screen.queryByRole('tree')).not.toBeInTheDocument();
	});

	it('Select picks a parent', async () => {
		const { trigger, onSelect } = setup();
		await fireEvent.click(trigger);
		await fireEvent.click(screen.getByRole('button', { name: 'Select Rock' }));
		expect(onSelect).toHaveBeenCalledWith('21');
	});

	// Review Focus 3.
	it('search ignores accents and keeps matching parents', async () => {
		const { trigger } = setup();
		await fireEvent.click(trigger);
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search genres' }), { target: { value: 'forro' } });
		expect(treeNames()).toEqual(['Regional & Cultural', 'Brazilian', 'Forró']);
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search genres' }), { target: { value: 'hip hop' } });
		expect(treeNames()).toEqual(['Hip-Hop/Rap', 'Hip-Hop']);
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search genres' }), { target: { value: 'zzz' } });
		expect(screen.getByText(/No genre matches/)).toBeInTheDocument();
	});

	it('Expand all and Collapse all', async () => {
		const { trigger } = setup();
		await fireEvent.click(trigger);
		await fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
		expect(screen.getByRole('button', { name: 'Forró' })).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
		expect(screen.queryByRole('button', { name: 'Forró' })).not.toBeInTheDocument();
	});

	it('Escape closes', async () => {
		const { trigger } = setup();
		await fireEvent.click(trigger);
		await fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search genres' }), { key: 'Escape' });
		expect(screen.queryByRole('tree')).not.toBeInTheDocument();
	});

	it('Recent shows earlier picks and re-picks in one click', async () => {
		const { trigger, onSelect } = setup();
		expect(screen.queryByText('Recent')).not.toBeInTheDocument();
		await fireEvent.click(trigger);
		await fireEvent.click(screen.getByRole('button', { name: 'Select Rock' }));
		await fireEvent.click(trigger);
		const chip = screen.getAllByRole('button', { name: 'Rock' })[0]; // chip and tree row share the name
		expect(screen.getByText('Recent')).toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem('perspectize:recent-genres')!)).toEqual(['21']);
		await fireEvent.click(screen.getAllByTitle('Rock')[0]);
		expect(onSelect).toHaveBeenLastCalledWith('21');
		expect(chip).toBeTruthy();
	});
});
