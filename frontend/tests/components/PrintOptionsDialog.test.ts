import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import PrintOptionsDialog from '$lib/components/PrintOptionsDialog.svelte';
import PrintOptionsDialogHarness from '../helpers/PrintOptionsDialogHarness.svelte';
import { warmUpRender } from '../helpers/warmUp';

warmUpRender(PrintOptionsDialog, { open: true, onPrint: () => {} });

describe('PrintOptionsDialog', () => {
	// bits-ui's Dialog schedules a body scroll-lock cleanup after unmount; let it fire.
	afterEach(async () => {
		cleanup();
		await new Promise((r) => setTimeout(r, 50));
	});

	it('renders nothing when closed', () => {
		render(PrintOptionsDialog, { props: { open: false, onPrint: vi.fn() } });
		expect(screen.queryByText('Print as list')).toBeNull();
		expect(screen.queryByLabelText('Title')).toBeNull();
	});

	it('opens with the title "Library" and Standard spacing selected', () => {
		render(PrintOptionsDialog, { props: { open: true, onPrint: vi.fn() } });
		expect(screen.getByText('Print as list')).toBeTruthy();
		expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Library');
		expect((screen.getByLabelText('Standard') as HTMLInputElement).checked).toBe(true);
		expect((screen.getByLabelText('Compact') as HTMLInputElement).checked).toBe(false);
		expect((screen.getByLabelText('Roomy') as HTMLInputElement).checked).toBe(false);
	});

	it('sends the edited title with standard spacing', async () => {
		const onPrint = vi.fn();
		render(PrintOptionsDialog, { props: { open: true, onPrint } });
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: "Mom's favourites" } });
		await fireEvent.click(screen.getByRole('button', { name: 'Print' }));
		expect(onPrint).toHaveBeenCalledWith({ title: "Mom's favourites", spacing: 'standard' });
	});

	it.each([
		['Compact', 'compact'],
		['Roomy', 'roomy'],
	])('sends %s spacing', async (label, value) => {
		const onPrint = vi.fn();
		render(PrintOptionsDialog, { props: { open: true, onPrint } });
		await fireEvent.click(screen.getByLabelText(label));
		await fireEvent.click(screen.getByRole('button', { name: 'Print' }));
		expect(onPrint).toHaveBeenCalledWith({ title: 'Library', spacing: value });
	});

	it('sends an empty title as an empty string', async () => {
		const onPrint = vi.fn();
		render(PrintOptionsDialog, { props: { open: true, onPrint } });
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: '' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Print' }));
		expect(onPrint).toHaveBeenCalledWith({ title: '', spacing: 'standard' });
	});

	it('tells the parent open is false after Print (bound value)', async () => {
		render(PrintOptionsDialogHarness, { props: { onPrint: vi.fn() } });
		expect(screen.getByTestId('open-state').textContent).toBe('open');
		await fireEvent.click(screen.getByRole('button', { name: 'Print' }));
		await waitFor(() => expect(screen.getByTestId('open-state').textContent).toBe('closed'));
	});

	it('resets title and spacing to the defaults each time it reopens', async () => {
		render(PrintOptionsDialogHarness, { props: { onPrint: vi.fn() } });
		await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Edited' } });
		await fireEvent.click(screen.getByLabelText('Roomy'));
		await fireEvent.click(screen.getByRole('button', { name: 'Print' }));
		await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull());

		await fireEvent.click(screen.getByTestId('open-state'));
		expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Library');
		expect((screen.getByLabelText('Standard') as HTMLInputElement).checked).toBe(true);
		expect((screen.getByLabelText('Roomy') as HTMLInputElement).checked).toBe(false);
	});

	it('closes the dialog when Print is clicked', async () => {
		render(PrintOptionsDialog, { props: { open: true, onPrint: vi.fn() } });
		await fireEvent.click(screen.getByRole('button', { name: 'Print' }));
		await waitFor(() => expect(screen.queryByText('Print as list')).toBeNull());
	});
});
