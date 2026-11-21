import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import CustomColumnBuilder from '#lib/components/customColumns/CustomColumnBuilder.svelte';
import type { SavedFormula } from '#lib/queries/savedFormulas/index.js';
import type { OperandRow } from '#lib/customColumns';
import { warmUpRender } from '../helpers/warmUp';

const mocks = vi.hoisted(() => ({
	createAsync: vi.fn(),
	updateAsync: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
}));

vi.mock('#lib/queries/savedFormulas/useCreateSavedFormula.js', () => ({
	useCreateSavedFormula: vi.fn(() => ({ mutateAsync: mocks.createAsync, isPending: false })),
}));

vi.mock('#lib/queries/savedFormulas/useUpdateSavedFormula.js', () => ({
	useUpdateSavedFormula: vi.fn(() => ({ mutateAsync: mocks.updateAsync, isPending: false })),
}));

vi.mock('svelte-sonner', () => ({
	toast: { success: mocks.success, error: mocks.error, info: vi.fn() },
}));

/**
 * Seven loaded movies. Gamma has no TMDB score (no votes), Beta has no budget (TMDB's 0 means
 * unknown) and a low vote count, and Eta sits past the six rows the table shows.
 */
const ROWS = [
	{ name: 'Alpha', contentType: 'MOVIE', movie: { voteAverage: 8, voteCount: 1000, budget: 2_000_000 } },
	{ name: 'Beta', contentType: 'MOVIE', movie: { voteAverage: 6, voteCount: 20, budget: 0 } },
	{ name: 'Gamma', contentType: 'MOVIE', movie: { voteCount: 0, budget: 5_000_000 } },
	{ name: 'Delta', contentType: 'MOVIE', movie: { voteAverage: 7.5, voteCount: 500, budget: 40_000 } },
	{ name: 'Epsilon', contentType: 'MOVIE', movie: { voteAverage: 5, voteCount: 300, budget: 300_000_000 } },
	{ name: 'Zeta', contentType: 'MOVIE', movie: { voteAverage: 9, voteCount: 2000, budget: 10_000_000 } },
	{ name: 'Eta', contentType: 'MOVIE', movie: { voteAverage: 4, voteCount: 80, budget: 1_000_000 } },
] as unknown as OperandRow[];

function savedFormula(overrides: Partial<SavedFormula> = {}): SavedFormula {
	return {
		id: '7',
		type: 'FORMULA',
		name: 'Bang for buck',
		privacy: 'PRIVATE',
		origin: 'OWN',
		sourceId: null,
		sourceAvailable: true,
		payloadVersion: 1,
		user: { id: '1', username: 'me' },
		createdAt: '2026-11-01T12:00:00Z',
		updatedAt: '2026-11-01T12:00:00Z',
		payload: {
			expression: { op: 'div', args: [{ operand: 'tmdbScore' }, { operand: 'budget' }] },
			numberFormat: 'percent',
			subtitle: 'Score per dollar',
		},
		...overrides,
	};
}

// Pay the first-render cost before any test, not inside the first one (see ColumnPickerDialog.test.ts).
warmUpRender(CustomColumnBuilder, { open: true, previewRows: ROWS, onSaved: () => {} });

function renderBuilder(props: Record<string, unknown> = {}) {
	const onSaved = vi.fn();
	render(CustomColumnBuilder, { props: { open: true, previewRows: ROWS, onSaved, ...props } });
	return { onSaved };
}

/** Types a name so the form is otherwise valid. */
async function typeName(name = 'Bang for buck') {
	await fireEvent.input(screen.getByLabelText('Name'), { target: { value: name } });
}

describe('CustomColumnBuilder', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// bits-ui's Dialog schedules a body scroll-lock cleanup after unmount; let it fire while `document` exists.
	afterEach(async () => {
		cleanup();
		await new Promise((r) => setTimeout(r, 50));
	});

	describe('mode', () => {
		it('create mode: titles a new column and starts from TMDB score with no steps', async () => {
			renderBuilder();
			expect(screen.getByRole('heading', { name: 'New custom column' })).toBeTruthy();
			expect((screen.getByLabelText('Start with') as HTMLSelectElement).value).toBe('tmdbScore');
			expect(screen.queryByLabelText('Step 1: operation')).toBeNull();
		});

		it('edit mode: titles the column, fills name, subtitle and format, and rebuilds the steps', async () => {
			renderBuilder({ formula: savedFormula() });
			expect(screen.getByRole('heading', { name: 'Edit custom column' })).toBeTruthy();
			expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Bang for buck');
			expect((screen.getByLabelText('Subtitle') as HTMLInputElement).value).toBe('Score per dollar');
			expect((screen.getByLabelText('Show values as') as HTMLSelectElement).value).toBe('percent');
			expect((screen.getByLabelText('Step 1: column or number') as HTMLSelectElement).value).toBe('budget');
			expect((screen.getByLabelText('Step 1: operation') as HTMLSelectElement).value).toBe('div');
		});

		it('edit mode: a formula that is not a simple chain opens on the formula bar', async () => {
			renderBuilder({
				formula: savedFormula({
					payload: {
						expression: {
							op: 'min',
							args: [{ operand: 'tmdbScore' }, { operand: 'votes' }],
						},
					},
				}),
			});
			expect((screen.getByLabelText('Formula') as HTMLTextAreaElement).value).toBe('min([TMDB score], [Votes])');
		});
	});

	describe('steps', () => {
		it('builds the formula preview from a step against a money column in millions', async () => {
			renderBuilder();
			await fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
			await fireEvent.change(screen.getByLabelText('Step 1: column or number'), { target: { value: 'budget' } });
			expect(screen.getByText(/As a formula:/).textContent).toContain('[TMDB score] / ([Budget] / 1000000)');
			expect((screen.getByLabelText('Step 1: scale') as HTMLSelectElement).value).toBe('millions');
		});

		it('offers no scale choice for a non-money column', async () => {
			renderBuilder();
			await fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
			await fireEvent.change(screen.getByLabelText('Step 1: column or number'), { target: { value: 'votes' } });
			expect(screen.queryByLabelText('Step 1: scale')).toBeNull();
		});

		it('a plain number step shows a number box, and removing a step drops it', async () => {
			renderBuilder();
			await fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
			expect(screen.getByLabelText('Step 1: number')).toBeTruthy();
			await fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
			expect(screen.queryByLabelText('Step 1: operation')).toBeNull();
		});

		it('Compress big gaps shows its explanation and a before/after, and unchecking hides both', async () => {
			renderBuilder();
			await fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
			await fireEvent.click(screen.getByLabelText('Compress big gaps'));
			expect(screen.getByText(/Each step up means 10x bigger/)).toBeTruthy();
			expect(screen.getByText(/Smallest:/).textContent).toMatch(/becomes/);
			expect(screen.getByText(/As a formula:/).textContent).toContain('log10(');
			await fireEvent.click(screen.getByLabelText('Compress big gaps'));
			expect(screen.queryByText(/Each step up means 10x bigger/)).toBeNull();
		});

		it('Compare to the rest shows its explanation against the loaded row count, and unchecking hides it', async () => {
			renderBuilder();
			await fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
			await fireEvent.click(screen.getByLabelText('Compare to the rest'));
			expect(screen.getByText(/against these 7 loaded rows/)).toBeTruthy();
			expect(screen.getByText(/As a formula:/).textContent).toContain('zscore(');
			await fireEvent.click(screen.getByLabelText('Compare to the rest'));
			expect(screen.queryByText(/against these 7 loaded rows/)).toBeNull();
		});
	});

	describe('Edit as formula', () => {
		it('switches to the formula bar carrying the steps as text, and back to steps when it is a chain', async () => {
			renderBuilder({ formula: savedFormula() });
			await fireEvent.click(screen.getByRole('button', { name: 'Edit as formula' }));
			expect((screen.getByLabelText('Formula') as HTMLTextAreaElement).value).toBe('[TMDB score] / [Budget]');
			await fireEvent.click(screen.getByRole('button', { name: 'Back to steps' }));
			expect(screen.getByLabelText('Step 1: column or number')).toBeTruthy();
			expect(screen.queryByLabelText('Formula')).toBeNull();
		});

		it('a formula that is not a simple chain stays a formula and says it needs the formula bar', async () => {
			renderBuilder({ formula: savedFormula() });
			await fireEvent.click(screen.getByRole('button', { name: 'Edit as formula' }));
			await fireEvent.input(screen.getByLabelText('Formula'), { target: { value: 'min([TMDB score], [Votes])' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Back to steps' }));
			expect(screen.getByText(/needs the formula bar/)).toBeTruthy();
			expect((screen.getByLabelText('Formula') as HTMLTextAreaElement).value).toBe('min([TMDB score], [Votes])');
		});

		it('a formula with a parse error stays a formula and shows the error, not the blocked message', async () => {
			renderBuilder({ formula: savedFormula() });
			await fireEvent.click(screen.getByRole('button', { name: 'Edit as formula' }));
			await fireEvent.input(screen.getByLabelText('Formula'), { target: { value: '[TMDB score] / (' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Back to steps' }));
			expect(screen.getByLabelText('Formula')).toBeTruthy();
			expect(screen.queryByText(/needs the formula bar/)).toBeNull();
			expect(screen.getByText(/The formula stops early/)).toBeTruthy();
		});

		it('a column-insert chip puts the column into the formula text', async () => {
			renderBuilder();
			await fireEvent.click(screen.getByRole('button', { name: 'Edit as formula' }));
			await fireEvent.click(screen.getByRole('button', { name: '[Budget]' }));
			expect((screen.getByLabelText('Formula') as HTMLTextAreaElement).value).toContain('[Budget]');
		});

		it('a function chip inserts the function call', async () => {
			renderBuilder();
			await fireEvent.click(screen.getByRole('button', { name: 'Edit as formula' }));
			await fireEvent.click(screen.getByRole('button', { name: 'log10()' }));
			expect((screen.getByLabelText('Formula') as HTMLTextAreaElement).value).toContain('log10()');
		});

		it('an unknown column shows the plain error with the closest columns', async () => {
			renderBuilder();
			await fireEvent.click(screen.getByRole('button', { name: 'Edit as formula' }));
			await fireEvent.input(screen.getByLabelText('Formula'), { target: { value: '[Rating] * 2' } });
			expect(
				screen.getByText(/There's no column called \[Rating\]\. Did you mean \[TMDB score\] or \[My overall\]\?/),
			).toBeTruthy();
			expect(screen.getByText(/Closest columns: TMDB score, My overall/)).toBeTruthy();
		});
	});

	describe('preview', () => {
		it('shows the operand columns and the new column, with a dash for a blank value and the missing count', async () => {
			renderBuilder({ formula: savedFormula() });
			expect(screen.getByRole('columnheader', { name: 'TMDB score' })).toBeTruthy();
			expect(screen.getByRole('columnheader', { name: 'Budget' })).toBeTruthy();
			// Gamma has no TMDB score, so the calculation is blank there (not zero).
			const gammaRow = screen.getByText('Gamma').closest('tr') as HTMLTableRowElement;
			expect(gammaRow.textContent).toContain('—');
			expect(screen.getByText(/Your calculation/)).toBeTruthy();
		});

		it('counts every loaded movie in the footer, not just the six shown', async () => {
			renderBuilder({ formula: savedFormula() });
			// Gamma (no TMDB score) and Beta (budget 0) lack a value; Eta is loaded but not shown.
			expect(screen.getByText('2 of 7 movies have no value (a missing input), so they sort last.')).toBeTruthy();
			expect(screen.queryByText('Eta')).toBeNull();
		});

		it('dims a TMDB score that rests on fewer than 50 votes', async () => {
			renderBuilder();
			await fireEvent.click(screen.getByRole('button', { name: 'Edit as formula' }));
			await fireEvent.input(screen.getByLabelText('Formula'), { target: { value: '[TMDB score]' } });
			const betaRow = screen.getByText('Beta').closest('tr') as HTMLTableRowElement;
			const scoreCell = betaRow.querySelectorAll('td')[1];
			expect(scoreCell.className).toContain('text-muted-foreground');
			const alphaRow = screen.getByText('Alpha').closest('tr') as HTMLTableRowElement;
			expect(alphaRow.querySelectorAll('td')[1].className).not.toContain('text-muted-foreground');
		});

		it('says to fix the formula instead of showing values when the formula is invalid', async () => {
			renderBuilder({ formula: savedFormula() });
			await fireEvent.click(screen.getByRole('button', { name: 'Edit as formula' }));
			await fireEvent.input(screen.getByLabelText('Formula'), { target: { value: '[Nope]' } });
			expect(screen.getByText('Fix the formula to see values here.')).toBeTruthy();
		});

		it('says there are no loaded movies yet when the grid has none', async () => {
			renderBuilder({ previewRows: [] });
			expect(screen.getByText(/No loaded movies to preview yet/)).toBeTruthy();
		});
	});

	describe('save and privacy', () => {
		it('privacy defaults to only me', async () => {
			renderBuilder();
			expect((screen.getByLabelText(/Only me/) as HTMLInputElement).checked).toBe(true);
			expect((screen.getByLabelText(/^Anyone/) as HTMLInputElement).checked).toBe(false);
		});

		it('Save is disabled while the name is empty', async () => {
			renderBuilder();
			expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
		});

		it('Save is disabled while the formula is invalid, even with a name', async () => {
			renderBuilder();
			await typeName();
			await fireEvent.click(screen.getByRole('button', { name: 'Edit as formula' }));
			await fireEvent.input(screen.getByLabelText('Formula'), { target: { value: '[Nope] / 2' } });
			expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
		});

		it('Save is disabled while a step has no number', async () => {
			renderBuilder();
			await typeName();
			await fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
			await fireEvent.input(screen.getByLabelText('Step 1: number'), { target: { value: '' } });
			expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
		});

		it('create saves the steps tree as a private column with the chosen format', async () => {
			mocks.createAsync.mockResolvedValue(savedFormula({ id: '9', name: 'Bang for buck' }));
			const { onSaved } = renderBuilder();
			await typeName('  Bang for buck  ');
			await fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
			await fireEvent.change(screen.getByLabelText('Step 1: column or number'), { target: { value: 'budget' } });
			await fireEvent.change(screen.getByLabelText('Show values as'), { target: { value: 'dollars' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
			await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
			expect(mocks.updateAsync).not.toHaveBeenCalled();
			expect(mocks.createAsync).toHaveBeenCalledWith({
				name: 'Bang for buck',
				privacy: 'PRIVATE',
				payload: {
					expression: {
						op: 'div',
						args: [{ operand: 'tmdbScore' }, { op: 'div', args: [{ operand: 'budget' }, { const: 1000000 }] }],
					},
					numberFormat: 'dollars',
				},
			});
			expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: '9' }));
		});

		it('choosing Anyone creates a public column', async () => {
			mocks.createAsync.mockResolvedValue(savedFormula());
			renderBuilder();
			await typeName();
			await fireEvent.click(screen.getByLabelText(/^Anyone/));
			await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
			await waitFor(() => expect(mocks.createAsync).toHaveBeenCalled());
			expect(mocks.createAsync.mock.calls[0][0].privacy).toBe('PUBLIC');
		});

		it('edit saves through the update hook with the column id and keeps the subtitle', async () => {
			mocks.updateAsync.mockResolvedValue(savedFormula({ name: 'Renamed' }));
			const { onSaved } = renderBuilder({ formula: savedFormula() });
			await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Renamed' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
			await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
			expect(mocks.createAsync).not.toHaveBeenCalled();
			expect(mocks.updateAsync).toHaveBeenCalledWith({
				id: 7,
				name: 'Renamed',
				payload: {
					expression: { op: 'div', args: [{ operand: 'tmdbScore' }, { operand: 'budget' }] },
					numberFormat: 'percent',
					subtitle: 'Score per dollar',
				},
			});
		});

		it('edit disables the privacy choice, since the update does not change it', async () => {
			renderBuilder({ formula: savedFormula({ privacy: 'PUBLIC' }) });
			expect((screen.getByLabelText(/^Anyone/) as HTMLInputElement).disabled).toBe(true);
			expect((screen.getByLabelText(/^Anyone/) as HTMLInputElement).checked).toBe(true);
		});

		it('a name already in use shows a plain inline message', async () => {
			mocks.createAsync.mockRejectedValue(new Error('GraphQL Error: a saved item with this name already exists'));
			const { onSaved } = renderBuilder();
			await typeName();
			await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
			expect(await screen.findByRole('alert')).toBeTruthy();
			expect(screen.getByRole('alert').textContent).toContain('You already have a custom column with this name');
			expect(onSaved).not.toHaveBeenCalled();
		});

		it('any other server failure shows the generic inline message', async () => {
			mocks.createAsync.mockRejectedValue(new Error('network down'));
			renderBuilder();
			await typeName();
			await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
			expect(await screen.findByRole('alert')).toBeTruthy();
			expect(screen.getByRole('alert').textContent).toContain('Could not save this column');
		});

		it('Cancel closes without saving', async () => {
			const { onSaved } = renderBuilder();
			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
			expect(onSaved).not.toHaveBeenCalled();
			expect(mocks.createAsync).not.toHaveBeenCalled();
		});
	});
});
