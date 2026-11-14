import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ColumnPickerDialog from '$lib/components/ColumnPickerDialog.svelte';
import { DATA_COLUMNS, INTERNAL_COLUMNS } from '$lib/utils/grid-config';

const noop = () => {};

describe('ColumnPickerDialog', () => {
	beforeEach(() => vi.clearAllMocks());

	// bits-ui's Dialog schedules a body scroll-lock cleanup ~24ms after unmount.
	// Unmount here and let that timer fire while `document` still exists, so it
	// doesn't leak into a later test file's teardown as `document is not defined`.
	afterEach(async () => {
		cleanup();
		await new Promise((r) => setTimeout(r, 50));
	});

	it('renders a checkbox row for every data column when open', () => {
		render(ColumnPickerDialog, { props: { open: true, onToggle: noop } });
		for (const col of DATA_COLUMNS) {
			expect(screen.getByLabelText(col.label)).toBeTruthy();
		}
	});

	it('hides the Internal group for non-admins', () => {
		render(ColumnPickerDialog, { props: { open: true, isAdmin: false, onToggle: noop } });
		expect(screen.queryByText('Internal')).toBeNull();
		expect(screen.queryByLabelText('Content ID')).toBeNull();
	});

	it('shows the Internal group for admins', () => {
		render(ColumnPickerDialog, { props: { open: true, isAdmin: true, onToggle: noop } });
		expect(screen.getByText('Internal')).toBeTruthy();
		for (const col of INTERNAL_COLUMNS) {
			expect(screen.getByLabelText(col.label)).toBeTruthy();
		}
	});

	it('reflects the visibility map in checkbox checked state', () => {
		render(ColumnPickerDialog, {
			props: { open: true, visibility: { tags: true, views: false }, onToggle: noop },
		});
		expect((screen.getByLabelText('Tags') as HTMLInputElement).checked).toBe(true);
		expect((screen.getByLabelText('Views') as HTMLInputElement).checked).toBe(false);
	});

	it('calls onToggle with (colId, next) when a checkbox changes', async () => {
		const onToggle = vi.fn();
		render(ColumnPickerDialog, { props: { open: true, visibility: { tags: true }, onToggle } });
		(screen.getByLabelText('Tags') as HTMLInputElement).click();
		expect(onToggle).toHaveBeenCalledWith('tags', false);
	});

	it('default view: says changes are saved and offers no reset', () => {
		render(ColumnPickerDialog, { props: { open: true, customLayout: false, onToggle: noop, onReset: noop } });
		expect(screen.getByTestId('layout-hint').textContent).toMatch(/default columns.*saved for next time/i);
		expect(screen.queryByRole('button', { name: /reset to default columns/i })).toBeNull();
	});

	it('custom view: says the setup is saved and offers a reset', () => {
		render(ColumnPickerDialog, { props: { open: true, customLayout: true, onToggle: noop, onReset: noop } });
		expect(screen.getByTestId('layout-hint').textContent).toMatch(/custom columns.*saved/i);
		expect(screen.getByRole('button', { name: /reset to default columns/i })).toBeTruthy();
	});

	it('switches between the two states when customLayout changes', async () => {
		const { rerender } = render(ColumnPickerDialog, {
			props: { open: true, customLayout: false, onToggle: noop, onReset: noop },
		});
		expect(screen.queryByRole('button', { name: /reset to default columns/i })).toBeNull();
		await rerender({ open: true, customLayout: true, onToggle: noop, onReset: noop });
		expect(screen.getByRole('button', { name: /reset to default columns/i })).toBeTruthy();
	});

	it('calls onReset when Reset to default columns is clicked', () => {
		const onReset = vi.fn();
		render(ColumnPickerDialog, { props: { open: true, customLayout: true, onToggle: noop, onReset } });
		screen.getByRole('button', { name: /reset to default columns/i }).click();
		expect(onReset).toHaveBeenCalledOnce();
	});
});
