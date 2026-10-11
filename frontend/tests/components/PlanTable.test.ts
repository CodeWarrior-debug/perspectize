import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import PlanTable from '$lib/components/plan/PlanTable.svelte';
import { PLAN_COL_IDS, planColumnsForTier } from '$lib/utils/plan-grid-config';
import type { UserTodoItem } from '$lib/queries/userTodos';

/**
 * AG Grid does not render in jsdom, so the grid component is replaced by one that records
 * its props. The tests then call the grid's own callbacks (onGridReady, onRowDragEnd,
 * onSortChanged) the way AG Grid would, with a fake api.
 */
const grid = vi.hoisted(() => ({ props: null as null | { gridOptions: Record<string, (...a: unknown[]) => void> } }));

vi.mock('ag-grid-svelte5', () => ({
	default: vi.fn((_anchor: unknown, props: typeof grid.props) => {
		grid.props = props;
	}),
}));

function setViewport(width: number) {
	window.matchMedia = vi.fn((query: string) => {
		const min = /min-width: (\d+)px/.exec(query);
		const max = /max-width: (\d+)px/.exec(query);
		const matches = min ? width >= Number(min[1]) : max ? width <= Number(max[1]) : false;
		return {
			matches,
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		} as unknown as MediaQueryList;
	});
}

function fakeApi(overrides: Record<string, unknown> = {}) {
	return {
		setColumnsVisible: vi.fn(),
		applyColumnState: vi.fn(),
		isDestroyed: vi.fn(() => false),
		...overrides,
	};
}

function renderTable(props: { listMode?: boolean; rows?: UserTodoItem[] } = {}) {
	const onReorder = vi.fn();
	const onSortChange = vi.fn();
	render(PlanTable, {
		props: { rows: [], onOpen: vi.fn(), onAddPerspective: vi.fn(), onSortChange, onReorder, ...props },
	});
	return { onReorder, onSortChange };
}

function gridOption(name: string): (arg: unknown) => void {
	const fn = grid.props?.gridOptions[name];
	if (!fn) throw new Error(`grid option ${name} was not provided`);
	return fn as (arg: unknown) => void;
}

describe('PlanTable', () => {
	beforeEach(() => {
		grid.props = null;
		vi.useFakeTimers();
		setViewport(1200);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('column visibility follows the tier, a frame after the grid is ready', () => {
		it('does not call the column API from gridReady itself (AG Grid throws until its body is up)', async () => {
			renderTable();
			const api = fakeApi();
			gridOption('onGridReady')({ api });
			await tick();

			expect(api.setColumnsVisible).not.toHaveBeenCalled();
		});

		it('then shows the columns of the current tier and hides the rest', async () => {
			setViewport(880); // md (the grid shows from 860px; below that is card mode)
			renderTable();
			const api = fakeApi();
			gridOption('onGridReady')({ api });
			await tick();
			await vi.advanceTimersByTimeAsync(50);

			const shown = planColumnsForTier('md');
			expect(api.setColumnsVisible).toHaveBeenCalledWith(
				PLAN_COL_IDS.filter((id) => shown.includes(id)),
				true,
			);
			expect(api.setColumnsVisible).toHaveBeenCalledWith(
				PLAN_COL_IDS.filter((id) => !shown.includes(id)),
				false,
			);
		});

		it('leaves a grid that was destroyed in the meantime alone', async () => {
			renderTable();
			const api = fakeApi({ isDestroyed: vi.fn(() => true) });
			gridOption('onGridReady')({ api });
			await tick();
			await vi.advanceTimersByTimeAsync(50);

			expect(api.setColumnsVisible).not.toHaveBeenCalled();
		});
	});

	describe('card list (below 860px)', () => {
		const todo = (overrides: Partial<UserTodoItem>): UserTodoItem => ({
			id: '5',
			user: { id: '7', username: 'ada' },
			content: null,
			name: 'Read the paper',
			action: { id: '2', key: 'consume', label: 'Consume', description: '', typicalSequence: 2, isPreset: true },
			priority: null,
			status: 'NOT_STARTED',
			percentComplete: 0,
			startDate: null,
			endDate: null,
			dueDate: null,
			comments: null,
			privacy: 'PUBLIC',
			list: null,
			listPosition: null,
			createdAt: '2026-10-01T00:00:00Z',
			updatedAt: '2026-10-01T00:00:00Z',
			...overrides,
		});

		it('shows the content type under the title of a todo that has content', () => {
			setViewport(400);
			renderTable({ rows: [todo({ content: { id: '12', name: 'Heat', contentType: 'MOVIE' }, name: null })] });
			const card = within(screen.getByTestId('plan-card-list')).getByText('Heat').closest('li') as HTMLElement;
			expect(within(card).getByText('Movie')).toBeInTheDocument();
		});

		it('says "No Todos here yet" with no rows, pointing at Add Todo', () => {
			setViewport(400);
			renderTable({ rows: [] });
			expect(
				within(screen.getByTestId('plan-card-list')).getByText('No Todos here yet. Use Add Todo to start a plan.'),
			).toBeInTheDocument();
		});

		it('shows no type line for a free-text todo', () => {
			setViewport(400);
			renderTable({ rows: [todo({})] });
			const card = within(screen.getByTestId('plan-card-list'))
				.getByText('Read the paper')
				.closest('li') as HTMLElement;
			expect(within(card).queryByText('Movie')).toBeNull();
			expect(within(card).queryByTestId('plan-card-type')).toBeNull();
		});
	});

	describe('reordering', () => {
		it('reports the todo ids in their order after the drop, top to bottom', () => {
			const { onReorder } = renderTable({ listMode: true });
			const api = {
				forEachNodeAfterFilterAndSort: (cb: (node: { data?: { id: string } }) => void) =>
					[{ data: { id: '3' } }, { data: { id: '4' } }, { data: { id: '2' } }, {}].forEach(cb),
			};
			gridOption('onRowDragEnd')({ api });

			expect(onReorder).toHaveBeenCalledWith([3, 4, 2]);
		});
	});

	describe('sorting', () => {
		const sortedState = (state: { colId: string; sort: 'asc' | 'desc' | null; sortIndex?: number }[]) => ({
			api: { getColumnState: () => state },
		});

		it('sends the server sort for the first sorted column', () => {
			const { onSortChange } = renderTable();
			gridOption('onSortChanged')(
				sortedState([
					{ colId: 'dueDate', sort: 'asc', sortIndex: 1 },
					{ colId: 'priority', sort: 'desc', sortIndex: 0 },
				]),
			);

			expect(onSortChange).toHaveBeenCalledWith({ sortBy: 'PRIORITY', sortOrder: 'DESC' });
		});

		it('sends null when no column is sorted', () => {
			const { onSortChange } = renderTable();
			gridOption('onSortChanged')(sortedState([{ colId: 'priority', sort: null }]));

			expect(onSortChange).toHaveBeenCalledWith(null);
		});

		it('sends null for a sorted column the server cannot sort by', () => {
			const { onSortChange } = renderTable();
			gridOption('onSortChanged')(sortedState([{ colId: 'status', sort: 'asc', sortIndex: 0 }]));

			expect(onSortChange).toHaveBeenCalledWith(null);
		});
	});
});
