import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PassagePicker from '$lib/components/PassagePicker.svelte';
import { defaultRange } from '$lib/utils/passageRange';

function setup(initial = defaultRange(59)) {
	let range = initial;
	const onchange = (next: typeof range) => {
		range = next;
	};
	const view = render(PassagePicker, { props: { range, onchange } });
	return {
		getRange: () => range,
		rerenderWithLatest: () => view.rerender({ range, onchange }),
	};
}

describe('PassagePicker', () => {
	it('keeps end synced to start until the user touches an end field', async () => {
		const { getRange, rerenderWithLatest } = setup();

		await fireEvent.change(screen.getByLabelText('Start chapter'), { target: { value: '1' } });
		expect(getRange().endChapter).toBe(1);

		await fireEvent.change(screen.getByLabelText('Start verse'), { target: { value: '22' } });
		expect(getRange().startVerse).toBe(22);
		expect(getRange().endVerse).toBe(22);
		rerenderWithLatest();
	});

	it('stops auto-syncing the end once the user edits an end field', async () => {
		const { getRange, rerenderWithLatest } = setup();

		await fireEvent.change(screen.getByLabelText('End verse'), { target: { value: '5' } });
		expect(getRange().endVerse).toBe(5);
		rerenderWithLatest();

		await fireEvent.change(screen.getByLabelText('Start verse'), { target: { value: '1' } });
		expect(getRange().startVerse).toBe(1);
		expect(getRange().endVerse).toBe(5);
	});

	it('resets end-touched tracking when the book changes', async () => {
		const { getRange, rerenderWithLatest } = setup();

		await fireEvent.change(screen.getByLabelText('End verse'), { target: { value: '5' } });
		rerenderWithLatest();

		await fireEvent.change(screen.getByLabelText('Book'), { target: { value: '1' } });
		rerenderWithLatest();

		await fireEvent.change(screen.getByLabelText('Start verse'), { target: { value: '3' } });
		expect(getRange().startVerse).toBe(3);
		expect(getRange().endVerse).toBe(3);
	});
});
