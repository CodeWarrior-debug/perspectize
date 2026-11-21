import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import AddFieldSearch from '#lib/components/AddFieldSearch.svelte';

function setup(addedKeys: string[] = ['quality', 'agreement', 'importance', 'confidence']) {
	const onAdd = vi.fn();
	render(AddFieldSearch, { props: { addedKeys, onAdd } });
	const input = screen.getByRole('textbox') as HTMLInputElement;
	return { onAdd, input };
}

describe('AddFieldSearch Enter key', () => {
	// The search box lives inside the perspective <form>; an unhandled Enter submits and closes it.
	it('adds the top match and prevents form submission', async () => {
		const { onAdd, input } = setup();
		await fireEvent.input(input, { target: { value: 'clar' } });
		const notPrevented = await fireEvent.keyDown(input, { key: 'Enter' });
		expect(notPrevented).toBe(false);
		expect(onAdd).toHaveBeenCalledTimes(1);
		expect(onAdd.mock.calls[0][0]).toMatchObject({ key: 'clarity' });
	});

	it('creates a custom field when nothing matches', async () => {
		const { onAdd, input } = setup();
		await fireEvent.input(input, { target: { value: 'moral weight' } });
		const notPrevented = await fireEvent.keyDown(input, { key: 'Enter' });
		expect(notPrevented).toBe(false);
		expect(onAdd).toHaveBeenCalledTimes(1);
		expect(onAdd.mock.calls[0][0]).toMatchObject({ key: 'custom:moral-weight', label: 'moral weight', custom: true });
	});

	it('does nothing but still prevents submission when the box is empty', async () => {
		const { onAdd, input } = setup();
		const notPrevented = await fireEvent.keyDown(input, { key: 'Enter' });
		expect(notPrevented).toBe(false);
		expect(onAdd).not.toHaveBeenCalled();
	});

	it('ignores other keys', async () => {
		const { onAdd, input } = setup();
		await fireEvent.input(input, { target: { value: 'clar' } });
		const notPrevented = await fireEvent.keyDown(input, { key: 'a' });
		expect(notPrevented).toBe(true);
		expect(onAdd).not.toHaveBeenCalled();
	});
});
