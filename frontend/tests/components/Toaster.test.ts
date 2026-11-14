import { describe, it, expect, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/svelte';
import { Toaster, toast } from 'svelte-sonner';
import { TOASTER_PROPS } from '$lib/utils/toast';

// Renders the real svelte-sonner Toaster with the app's props, so a change to
// how simultaneous toasts are laid out fails here instead of drifting unnoticed.
describe('app Toaster', () => {
	afterEach(() => {
		toast.dismiss();
		cleanup();
	});

	it('keeps simultaneous toasts expanded (separated), not collapsed into an overlapping stack', async () => {
		render(Toaster, { props: TOASTER_PROPS });

		toast.success('Perspective saved');
		toast('Mark this Todo done?');

		await waitFor(() => {
			const toasts = document.querySelectorAll('[data-sonner-toast]');
			expect(toasts).toHaveLength(2);
			for (const t of toasts) expect(t).toHaveAttribute('data-expanded', 'true');
		});
	});

	it('keeps a single toast expanded too', async () => {
		render(Toaster, { props: TOASTER_PROPS });

		toast('Saved');

		await waitFor(() => {
			expect(document.querySelector('[data-sonner-toast]')).toHaveAttribute('data-expanded', 'true');
		});
	});

	it('keeps the existing placement and default duration', () => {
		expect(TOASTER_PROPS).toMatchObject({ position: 'top-right', duration: 2000, richColors: true });
	});
});
