import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ExportMenu from '#lib/components/ExportMenu.svelte';

function setup(props: Partial<{ disabled: boolean; onDownloadCsv: () => void; onCopy: () => void }> = {}) {
	const onPrintAsSeen = vi.fn();
	const onPrintAsList = vi.fn();
	render(ExportMenu, { props: { disabled: false, onPrintAsSeen, onPrintAsList, ...props } });
	return { onPrintAsSeen, onPrintAsList };
}

const trigger = () => screen.getByRole('button', { name: /export/i });

describe('ExportMenu', () => {
	it('shows only the trigger while closed', () => {
		setup();
		expect(trigger()).toBeTruthy();
		expect(screen.queryByText('Print as seen…')).toBeNull();
		expect(screen.queryByText('Print as list…')).toBeNull();
	});

	it('shows the print items once opened', async () => {
		setup();
		await fireEvent.click(trigger());
		expect(await screen.findByText('Print as seen…')).toBeTruthy();
		expect(screen.getByText('Print as list…')).toBeTruthy();
	});

	it('omits the CSV and copy items when their handlers are absent', async () => {
		setup();
		await fireEvent.click(trigger());
		await screen.findByText('Print as seen…');
		expect(screen.queryByText('Download CSV')).toBeNull();
		expect(screen.queryByText('Copy for spreadsheet')).toBeNull();
	});

	it('shows the CSV and copy items when their handlers are given', async () => {
		setup({ onDownloadCsv: vi.fn(), onCopy: vi.fn() });
		await fireEvent.click(trigger());
		expect(await screen.findByText('Download CSV')).toBeTruthy();
		expect(screen.getByText('Copy for spreadsheet')).toBeTruthy();
	});

	it('does not open while disabled', async () => {
		setup({ disabled: true });
		expect((trigger() as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(trigger());
		expect(screen.queryByText('Print as seen…')).toBeNull();
	});

	it.each([
		['Print as seen…', 'onPrintAsSeen'],
		['Print as list…', 'onPrintAsList'],
	] as const)('calls the handler for "%s" and closes the menu', async (label, key) => {
		const handlers = setup();
		await fireEvent.click(trigger());
		await fireEvent.click(await screen.findByText(label));
		expect(handlers[key]).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(screen.queryByText('Print as seen…')).toBeNull());
	});

	it('calls the CSV and copy handlers and closes the menu', async () => {
		const onDownloadCsv = vi.fn();
		const onCopy = vi.fn();
		setup({ onDownloadCsv, onCopy });
		await fireEvent.click(trigger());
		await fireEvent.click(await screen.findByText('Download CSV'));
		expect(onDownloadCsv).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(screen.queryByText('Download CSV')).toBeNull());
		await fireEvent.click(trigger());
		await fireEvent.click(await screen.findByText('Copy for spreadsheet'));
		expect(onCopy).toHaveBeenCalledTimes(1);
	});
});
