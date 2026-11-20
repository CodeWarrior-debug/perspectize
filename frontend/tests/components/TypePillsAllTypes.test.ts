import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';

// The real registry has too few types to reach the searchable list, so feed it a long one.
vi.mock('#lib/utils/gridUrlState.js', () => ({
	otherTypeOptionsWhenOne: () =>
		['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India'].map((label) => ({
			value: label.toLowerCase(),
			label,
		})),
}));

import TypePills from '#lib/components/TypePills.svelte';

const open = async () => {
	await fireEvent.click(screen.getByRole('button', { name: 'Search all types' }));
	return screen.findByRole('textbox', { name: 'Find a type' });
};

describe('TypePills All types list (long type registry)', () => {
	it('offers the searchable list once there are many types', () => {
		render(TypePills, { props: { filters: { type: 'zulu' }, onSelect: vi.fn() } });
		expect(screen.getByRole('button', { name: 'Search all types' })).toBeInTheDocument();
	});

	it('lists every type when opened', async () => {
		render(TypePills, { props: { filters: { type: 'zulu' }, onSelect: vi.fn() } });
		await open();
		expect(screen.getByRole('button', { name: 'India' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
	});

	it('narrows the list as the user types', async () => {
		render(TypePills, { props: { filters: { type: 'zulu' }, onSelect: vi.fn() } });
		const input = await open();
		await fireEvent.input(input, { target: { value: 'ech' } });
		expect(screen.getByRole('button', { name: 'Echo' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Alpha' })).not.toBeInTheDocument();
	});

	it('says so when nothing matches', async () => {
		render(TypePills, { props: { filters: { type: 'zulu' }, onSelect: vi.fn() } });
		const input = await open();
		await fireEvent.input(input, { target: { value: 'zzz' } });
		expect(screen.getByText('No types match.')).toBeInTheDocument();
	});

	it('picking a type selects it and closes the list', async () => {
		const onSelect = vi.fn();
		render(TypePills, { props: { filters: { type: 'zulu' }, onSelect } });
		await open();
		await fireEvent.click(screen.getByRole('button', { name: 'Golf' }));
		expect(onSelect).toHaveBeenCalledWith('golf');
		await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Find a type' })).not.toBeInTheDocument());
	});
});
