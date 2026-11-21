import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import ColumnPickerDialog from '#lib/components/ColumnPickerDialog.svelte';
import { customPickerRows, type CustomPickerRow } from '#lib/utils/customColumnDefs.js';
import type { SavedFormula } from '#lib/queries/savedFormulas/index.js';
import type { FormulaNode } from '#lib/customColumns/index.js';
import { warmUpRender } from '../helpers/warmUp';

const noop = () => {};
const expression: FormulaNode = { operand: 'myOverall' };

// Pay the first-render cost before any test, as the sibling ColumnPickerDialog test does (#728).
warmUpRender(ColumnPickerDialog, { open: true, onToggle: noop });

function formula(overrides: Partial<SavedFormula> = {}): SavedFormula {
	return {
		id: '7',
		type: 'FORMULA',
		name: 'Blend',
		privacy: 'PRIVATE',
		origin: 'OWN',
		sourceId: null,
		sourceAvailable: true,
		payloadVersion: 1,
		user: { id: 'u1', username: 'alice' },
		createdAt: '2026-11-01T12:00:00Z',
		updatedAt: '2026-11-01T12:00:00Z',
		payload: { expression },
		...overrides,
	};
}

const own = formula();
const linked = formula({ id: '9', name: 'Shared score', origin: 'LINK', user: { id: 'u2', username: 'bob' } });
const gone = formula({ id: '10', name: 'Gone score', origin: 'LINK', payload: null });

function pickerRows(): { available: CustomPickerRow[]; unavailable: CustomPickerRow[] } {
	return customPickerRows([own, linked], [gone], 'u1');
}

describe('ColumnPickerDialog custom columns group', () => {
	afterEach(async () => {
		cleanup();
		await new Promise((r) => setTimeout(r, 50));
	});

	it('lists each available formula with its ƒ mark, name and owner', () => {
		render(ColumnPickerDialog, {
			props: { open: true, onToggle: noop, customColumns: pickerRows(), customEnabled: true, signedIn: true },
		});
		const group = screen.getByTestId('custom-columns-group');
		expect(group.textContent).toContain('Custom columns');
		expect(group.textContent).toContain('Blend');
		expect(group.textContent).toContain('Yours');
		expect(group.textContent).toContain('Shared score');
		expect(group.textContent).toContain('linked from @bob');
	});

	it('reflects the visibility map for a custom column and toggles it by its custom colId', async () => {
		const onToggle = vi.fn();
		render(ColumnPickerDialog, {
			props: {
				open: true,
				onToggle,
				visibility: { 'custom:7': true },
				customColumns: pickerRows(),
				customEnabled: true,
				signedIn: true,
			},
		});
		const checkbox = screen.getByLabelText(/Blend/) as HTMLInputElement;
		expect(checkbox.checked).toBe(true);
		await fireEvent.click(checkbox);
		expect(onToggle).toHaveBeenCalledWith('custom:7', false);
	});

	it('disables the custom checkboxes and says why outside the Movie type', () => {
		render(ColumnPickerDialog, {
			props: { open: true, onToggle: noop, customColumns: pickerRows(), customEnabled: false, signedIn: true },
		});
		expect((screen.getByLabelText(/Blend/) as HTMLInputElement).disabled).toBe(true);
		expect(screen.getByText('Choose the Movie type to use custom columns.')).toBeTruthy();
	});

	it('offers Edit and Delete for an own formula, and Remove for a link', async () => {
		const onEdit = vi.fn();
		const onDelete = vi.fn();
		render(ColumnPickerDialog, {
			props: {
				open: true,
				onToggle: noop,
				customColumns: pickerRows(),
				customEnabled: true,
				signedIn: true,
				onEditCustomColumn: onEdit,
				onDeleteCustomColumn: onDelete,
			},
		});
		expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
		expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
		// Two Removes: the linked formula, then the unavailable link (listed last).
		expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		expect(onEdit).toHaveBeenCalledWith(own);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		expect(onDelete).toHaveBeenCalledWith(own);

		await fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
		expect(onDelete).toHaveBeenLastCalledWith(linked);
	});

	it('lists an unavailable link greyed under "No longer available", with a Remove action', async () => {
		const onDelete = vi.fn();
		render(ColumnPickerDialog, {
			props: {
				open: true,
				onToggle: noop,
				customColumns: pickerRows(),
				customEnabled: true,
				signedIn: true,
				onDeleteCustomColumn: onDelete,
			},
		});
		expect(screen.getByText('No longer available')).toBeTruthy();
		expect(screen.getByText('ƒ Gone score')).toBeTruthy();
		await fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
		expect(onDelete).toHaveBeenCalledWith(gone);
	});

	it('calls the new and browse callbacks from the two buttons', async () => {
		const onNew = vi.fn();
		const onBrowse = vi.fn();
		render(ColumnPickerDialog, {
			props: {
				open: true,
				onToggle: noop,
				customColumns: pickerRows(),
				customEnabled: true,
				signedIn: true,
				onNewCustomColumn: onNew,
				onBrowseSharedColumns: onBrowse,
			},
		});
		await fireEvent.click(screen.getByRole('button', { name: 'New custom column' }));
		expect(onNew).toHaveBeenCalledTimes(1);
		await fireEvent.click(screen.getByRole('button', { name: 'Browse shared columns' }));
		expect(onBrowse).toHaveBeenCalledTimes(1);
	});

	it('hides the create, browse and per-item actions when signed out', () => {
		render(ColumnPickerDialog, {
			props: { open: true, onToggle: noop, customColumns: pickerRows(), customEnabled: true, signedIn: false },
		});
		expect(screen.queryByRole('button', { name: 'New custom column' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Browse shared columns' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
	});
});
