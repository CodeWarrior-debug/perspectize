import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CommentFullscreen from '$lib/components/CommentFullscreen.svelte';

vi.mock('$lib/components/PerspectiveEditor.svelte', async () => {
	const mod = await import('../helpers/FakePerspectiveEditor.svelte');
	return { default: mod.default };
});

describe('CommentFullscreen', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('forwards edits to the parent as they happen', async () => {
		const onChange = vi.fn();
		render(CommentFullscreen, { props: { value: '<p>a</p>', onChange, onClose: vi.fn() } });

		await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: '<p>ab</p>' } });
		expect(onChange).toHaveBeenCalledWith('<p>ab</p>');
	});

	it('closes without a confirm prompt even after editing (nothing is discarded on close)', async () => {
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		const onClose = vi.fn();
		render(CommentFullscreen, { props: { value: '<p>a</p>', onChange: vi.fn(), onClose } });

		await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: '<p>ab</p>' } });
		await fireEvent.click(screen.getByLabelText('Close'));

		expect(confirm).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
