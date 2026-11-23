import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import SharedColumnsDialog from '#lib/components/customColumns/SharedColumnsDialog.svelte';
import type { SavedFormula } from '#lib/queries/savedFormulas/index.js';
import type { OperandRow } from '#lib/customColumns/operands.js';
import type { FormulaNode } from '#lib/customColumns/types.js';
import { warmUpRender } from '../helpers/warmUp';

const mocks = vi.hoisted(() => ({
	shared: { data: undefined as unknown, isPending: false, isError: false },
	copyMutate: vi.fn(),
	linkMutate: vi.fn(),
	deleteMutate: vi.fn(),
	toastWithAction: vi.fn(),
}));

vi.mock('#lib/queries/savedFormulas/useSharedFormulas.js', () => ({
	useSharedFormulas: () => mocks.shared,
}));
vi.mock('#lib/queries/savedFormulas/useCopySavedItem.js', () => ({
	useCopySavedItem: () => ({ mutate: mocks.copyMutate }),
}));
vi.mock('#lib/queries/savedFormulas/useLinkSavedItem.js', () => ({
	useLinkSavedItem: () => ({ mutate: mocks.linkMutate }),
}));
vi.mock('#lib/queries/savedFormulas/useDeleteSavedItem.js', () => ({
	useDeleteSavedItem: () => ({ mutate: mocks.deleteMutate }),
}));
vi.mock('#lib/utils/toast.js', () => ({
	toastWithAction: mocks.toastWithAction,
	isInsideToast: () => false,
}));

const noop = () => {};

// Pay the dialog's first-render cost before any test (same pattern as ColumnPickerDialog.test.ts).
warmUpRender(SharedColumnsDialog, { open: true, onAdded: noop });

// Score 8 on a $2M budget: [TMDB score] / ([Budget] / 1000000) = 8 / 2 = 4.
const BANG_FOR_BUCK: FormulaNode = {
	op: 'div',
	args: [{ operand: 'tmdbScore' }, { op: 'div', args: [{ operand: 'budget' }, { const: 1000000 }] }],
};

function sharedRow(over: Partial<SavedFormula> = {}): SavedFormula {
	return {
		id: 'f1',
		type: 'FORMULA',
		name: 'Bang for Buck',
		privacy: 'PUBLIC',
		origin: 'OWN',
		sourceId: null,
		sourceAvailable: true,
		payloadVersion: 1,
		user: { id: 'u2', username: 'alice' },
		createdAt: '2026-11-01T12:00:00Z',
		updatedAt: '2026-11-02T12:00:00Z',
		payload: {
			expression: BANG_FOR_BUCK,
			subtitle: 'TMDB score per $1M of budget',
			contentTypes: ['MOVIE'],
		},
		...over,
	};
}

function movie(title: string, voteAverage: number | null, budget: number | null): OperandRow {
	return {
		contentType: 'MOVIE',
		name: title,
		movie: { voteAverage: voteAverage ?? undefined, voteCount: voteAverage ? 100 : undefined, budget },
	} as OperandRow;
}

function setShared(items: SavedFormula[], flags: { isPending?: boolean; isError?: boolean } = {}) {
	mocks.shared = {
		data: {
			sharedFormulas: {
				items,
				pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
				totalCount: null,
			},
		},
		isPending: flags.isPending ?? false,
		isError: flags.isError ?? false,
	};
}

function cardFor(name: string): HTMLElement {
	const article = screen.getByRole('heading', { name }).closest('article');
	if (!article) throw new Error(`no card for ${name}`);
	return article as HTMLElement;
}

describe('SharedColumnsDialog', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setShared([sharedRow()]);
	});

	// bits-ui's Dialog schedules a body scroll-lock cleanup after unmount; let it fire while `document` exists.
	afterEach(async () => {
		cleanup();
		await new Promise((r) => setTimeout(r, 50));
	});

	describe('card content', () => {
		it('shows the name, author, description, uses, scope, date, formula and top result', () => {
			render(SharedColumnsDialog, {
				props: {
					open: true,
					previewRows: [movie('Heat', 8, 2000000), movie('Up', 6, 4000000)],
					ownedIds: new Set<string>(),
					onAdded: noop,
				},
			});
			const card = cardFor('Bang for Buck');
			expect(card.textContent).toContain('by @alice');
			expect(card.textContent).toContain('TMDB score per $1M of budget');
			expect(card.textContent).toContain('Uses: TMDB score, Budget');
			expect(card.textContent).toContain('Movies');
			expect(card.textContent).toContain('Updated:');
			expect(card.textContent).toContain('[TMDB score] / ([Budget] / 1000000)');
			expect(card.textContent).toContain('Top result on your loaded movies: Heat (4)');
		});

		it('shows an em dash for a formula with no columns and "No value" when no loaded row evaluates', () => {
			setShared([sharedRow({ payload: { expression: { const: 5 }, contentTypes: [] } })]);
			render(SharedColumnsDialog, { props: { open: true, previewRows: [], onAdded: noop } });
			const card = cardFor('Bang for Buck');
			expect(card.textContent).toContain('Uses: —');
			expect(card.textContent).toContain('Any type');
			expect(card.textContent).toContain('No value on your loaded movies yet');
			expect(card.textContent).not.toContain('Top result');
		});

		it('shows an operand key it does not know as-is', () => {
			setShared([sharedRow({ payload: { expression: { operand: 'mystery' }, contentTypes: ['MOVIE'] } })]);
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			expect(cardFor('Bang for Buck').textContent).toContain('Uses: mystery');
		});

		it('never shows a "Used by" count', () => {
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			expect(screen.queryByText(/used by/i)).toBeNull();
		});
	});

	describe('actions', () => {
		it('offers "Use a copy" and "Link instead" on an available card', () => {
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			const card = cardFor('Bang for Buck');
			expect(card.querySelector('button')?.textContent).toContain('Use a copy');
			expect(card.textContent).toContain('Link instead');
		});

		it('copies by id, toasts with Undo, and calls onAdded with the new row', () => {
			const savedItem = sharedRow({
				id: 'new1',
				name: 'Bang for Buck',
				privacy: 'PRIVATE',
				origin: 'COPY',
				sourceId: 'f1',
				payload: undefined,
			});
			mocks.copyMutate.mockImplementation((_id: string, opts: { onSuccess: (s: unknown) => void }) =>
				opts.onSuccess(savedItem),
			);
			const onAdded = vi.fn();
			render(SharedColumnsDialog, { props: { open: true, onAdded } });
			fireEvent.click(cardFor('Bang for Buck').querySelector('button') as HTMLButtonElement);

			expect(mocks.copyMutate).toHaveBeenCalledWith('f1', expect.any(Object));
			expect(mocks.linkMutate).not.toHaveBeenCalled();
			expect(mocks.toastWithAction).toHaveBeenCalledWith(
				"Copied “Bang for Buck” into your columns. It's yours now, and private.",
				expect.objectContaining({ label: 'Undo' }),
				expect.any(Object),
			);
			expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ id: 'new1', payload: sharedRow().payload }));
			expect(cardFor('Bang for Buck').textContent).toContain('In your columns');
		});

		it('links by id with the link success toast', () => {
			const savedItem = sharedRow({ id: 'new2', origin: 'LINK', privacy: 'PRIVATE', sourceId: 'f1' });
			mocks.linkMutate.mockImplementation((_id: string, opts: { onSuccess: (s: unknown) => void }) =>
				opts.onSuccess(savedItem),
			);
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			fireEvent.click(screen.getByRole('button', { name: 'Link instead' }));

			expect(mocks.linkMutate).toHaveBeenCalledWith('f1', expect.any(Object));
			expect(mocks.copyMutate).not.toHaveBeenCalled();
			expect(mocks.toastWithAction).toHaveBeenCalledWith(
				"Linked “Bang for Buck”. It follows the author's edits.",
				expect.objectContaining({ label: 'Undo' }),
				expect.any(Object),
			);
		});

		it('acts on the source of a link row, not the link itself', () => {
			setShared([sharedRow({ id: 'l1', origin: 'LINK', sourceId: 'src9' })]);
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			fireEvent.click(screen.getByRole('button', { name: 'Link instead' }));
			expect(mocks.linkMutate).toHaveBeenCalledWith('src9', expect.any(Object));
		});

		it('Undo calls the delete hook with the new row id and its privacy', () => {
			const savedItem = sharedRow({ id: 'new1', privacy: 'PRIVATE', origin: 'COPY', sourceId: 'f1' });
			mocks.copyMutate.mockImplementation((_id: string, opts: { onSuccess: (s: unknown) => void }) =>
				opts.onSuccess(savedItem),
			);
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			fireEvent.click(cardFor('Bang for Buck').querySelector('button') as HTMLButtonElement);

			const onClick = (mocks.toastWithAction.mock.calls[0][1] as { onClick: () => void }).onClick;
			onClick();
			expect(mocks.deleteMutate).toHaveBeenCalledWith({ id: 'new1', privacy: 'PRIVATE' }, expect.any(Object));
		});

		it('shows a plain-words error on the card when the copy fails', () => {
			mocks.copyMutate.mockImplementation((_id: string, opts: { onError: (e: Error) => void }) =>
				opts.onError(new Error('name already exists for this user')),
			);
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			fireEvent.click(cardFor('Bang for Buck').querySelector('button') as HTMLButtonElement);
			expect(screen.getByRole('alert').textContent).toContain('You already have a column with that name');
			expect(mocks.toastWithAction).not.toHaveBeenCalled();
		});
	});

	describe('ownership and availability', () => {
		it('shows "In your columns" and no copy button when the row is already the viewer\'s copy source', () => {
			// The viewer's own copy of f1 is in the list (hidden), and its sourceId points at f1.
			setShared([
				sharedRow(),
				sharedRow({ id: 'mine1', origin: 'COPY', sourceId: 'f1', user: { id: 'me', username: 'me' } }),
			]);
			render(SharedColumnsDialog, { props: { open: true, ownedIds: new Set(['mine1']), onAdded: noop } });
			const card = cardFor('Bang for Buck');
			expect(card.textContent).toContain('In your columns');
			expect(card.querySelector('button')?.textContent).not.toContain('Use a copy');
		});

		it('shows "In your columns" when the row sourceId is in ownedIds', () => {
			setShared([sharedRow({ id: 'x1', origin: 'LINK', sourceId: 'src9' })]);
			render(SharedColumnsDialog, { props: { open: true, ownedIds: new Set(['src9']), onAdded: noop } });
			expect(cardFor('Bang for Buck').textContent).toContain('In your columns');
			expect(screen.getByRole('button', { name: 'Link instead' }).hasAttribute('disabled')).toBe(true);
		});

		it("hides the viewer's own rows from the list", () => {
			setShared([
				sharedRow({ id: 'mine1', name: 'My Own Column', origin: 'OWN' }),
				sharedRow({ id: 'f2', name: 'Theirs' }),
			]);
			render(SharedColumnsDialog, { props: { open: true, ownedIds: new Set(['mine1']), onAdded: noop } });
			expect(screen.queryByRole('heading', { name: 'My Own Column' })).toBeNull();
			expect(screen.getByRole('heading', { name: 'Theirs' })).toBeTruthy();
		});

		it('shows "No longer available" and no actions for a link whose source is unavailable', () => {
			setShared([sharedRow({ origin: 'LINK', sourceAvailable: false, payload: null })]);
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			const card = cardFor('Bang for Buck');
			expect(card.textContent).toContain('No longer available');
			expect(card.querySelectorAll('button')).toHaveLength(0);
		});
	});

	describe('search', () => {
		beforeEach(() => {
			setShared([
				sharedRow({ id: 'a', name: 'Bang for Buck', user: { id: 'u2', username: 'alice' } }),
				sharedRow({
					id: 'b',
					name: 'Sequel Score',
					payload: { expression: { operand: 'tmdbScore' }, subtitle: 'Just the score', contentTypes: [] },
					user: { id: 'u3', username: 'bob' },
				}),
			]);
		});

		it('filters by name', () => {
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			fireEvent.input(screen.getByLabelText('Search shared columns'), { target: { value: 'sequel' } });
			expect(screen.queryByRole('heading', { name: 'Bang for Buck' })).toBeNull();
			expect(screen.getByRole('heading', { name: 'Sequel Score' })).toBeTruthy();
		});

		it('filters by description', () => {
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			fireEvent.input(screen.getByLabelText('Search shared columns'), { target: { value: '$1M' } });
			expect(screen.getByRole('heading', { name: 'Bang for Buck' })).toBeTruthy();
			expect(screen.queryByRole('heading', { name: 'Sequel Score' })).toBeNull();
		});

		it('filters by author', () => {
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			fireEvent.input(screen.getByLabelText('Search shared columns'), { target: { value: 'BOB' } });
			expect(screen.queryByRole('heading', { name: 'Bang for Buck' })).toBeNull();
			expect(screen.getByRole('heading', { name: 'Sequel Score' })).toBeTruthy();
		});

		it('says so when nothing matches', () => {
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			fireEvent.input(screen.getByLabelText('Search shared columns'), { target: { value: 'zzz' } });
			expect(screen.getByText(/No shared columns match/)).toBeTruthy();
		});
	});

	describe('query states', () => {
		it('shows the empty state when nobody has shared a column', () => {
			setShared([]);
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			expect(screen.getByText('Nobody has shared a column yet')).toBeTruthy();
		});

		it("shows the empty state when the only rows are the viewer's own", () => {
			setShared([sharedRow({ id: 'mine1' })]);
			render(SharedColumnsDialog, { props: { open: true, ownedIds: new Set(['mine1']), onAdded: noop } });
			expect(screen.getByText('Nobody has shared a column yet')).toBeTruthy();
		});

		it('shows a loading message while the first page is pending', () => {
			setShared([], { isPending: true });
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			expect(screen.getByRole('status').textContent).toContain('Loading shared columns');
			expect(screen.queryByText('Nobody has shared a column yet')).toBeNull();
		});

		it('shows an error message when the list fails', () => {
			setShared([], { isError: true });
			render(SharedColumnsDialog, { props: { open: true, onAdded: noop } });
			expect(screen.getByRole('alert').textContent).toContain('Could not load shared columns');
		});
	});
});
