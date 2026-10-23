import type { IHeaderComp, IHeaderParams } from '@ag-grid-community/core';

/** Extra colDef `headerComponentParams` the activity grid passes in. */
export interface ChartHeaderParams extends IHeaderParams {
	/** True when this column's chart icon should show right now (re-read on every header refresh). */
	chartIconVisible?: () => boolean;
	/** Opens the chart popover; `anchor` is the header element it should point at. */
	onChartClick?: (anchor: HTMLElement, colId: string) => void;
}

const CHART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="5"/><line x1="18" y1="20" x2="18" y2="9"/></svg>`;

/**
 * Header for numeric columns that can show a distribution chart. A custom
 * headerComponent replaces the grid's own header content, so this renders the
 * title, the sort indicator and the filter button itself (delegating to the
 * grid's progressSort / showFilter), plus the chart icon.
 */
export class ChartHeaderRenderer implements IHeaderComp {
	private eGui!: HTMLElement;
	private params!: ChartHeaderParams;
	private sortEl!: HTMLElement;
	private onSortChanged = () => this.syncSort();

	init(params: ChartHeaderParams): void {
		this.params = params;
		const colId = params.column.getColId();

		const root = document.createElement('div');
		root.className = 'flex h-full w-full items-center gap-1 overflow-hidden';
		root.setAttribute('role', 'presentation');

		const title = document.createElement('span');
		title.className = 'min-w-0 flex-1 truncate font-semibold';
		title.textContent = params.displayName;
		root.appendChild(title);

		this.sortEl = document.createElement('span');
		this.sortEl.className = 'shrink-0';
		root.appendChild(this.sortEl);

		if (params.enableSorting) {
			root.style.cursor = 'pointer';
			root.addEventListener('click', (e) => params.progressSort(e.shiftKey));
			params.column.addEventListener('sortChanged', this.onSortChanged);
		}

		if (params.enableFilterButton) {
			const filterBtn = document.createElement('button');
			filterBtn.type = 'button';
			filterBtn.className = 'ag-icon ag-icon-filter shrink-0';
			filterBtn.setAttribute('aria-label', `Filter ${params.displayName}`);
			filterBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				params.showFilter(filterBtn);
			});
			root.appendChild(filterBtn);
		}

		if (params.chartIconVisible?.()) {
			const chartBtn = document.createElement('button');
			chartBtn.type = 'button';
			chartBtn.className = 'shrink-0 text-muted-foreground hover:text-foreground';
			chartBtn.innerHTML = CHART_SVG;
			chartBtn.title = `Chart ${params.displayName}`;
			chartBtn.setAttribute('aria-label', `${params.displayName} chart`);
			chartBtn.setAttribute('data-testid', `column-chart-button-${colId}`);
			chartBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				params.onChartClick?.(root.closest<HTMLElement>('.ag-header-cell') ?? root, colId);
			});
			root.appendChild(chartBtn);
		}

		this.eGui = root;
		this.syncSort();
	}

	private syncSort(): void {
		const sort = this.params.column.getSort();
		this.sortEl.className = `shrink-0 ${sort ? `ag-icon ag-icon-${sort}` : ''}`;
	}

	getGui(): HTMLElement {
		return this.eGui;
	}

	refresh(): boolean {
		// Returning false makes the grid rebuild the header, which re-reads chartIconVisible.
		return false;
	}

	destroy(): void {
		this.params.column.removeEventListener('sortChanged', this.onSortChanged);
	}
}
