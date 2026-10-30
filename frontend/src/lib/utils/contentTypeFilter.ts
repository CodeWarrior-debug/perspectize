import type { IDoesFilterPassParams, IFilterComp, IFilterParams } from '@ag-grid-community/core';
import type { ContentItem } from '$lib/queries/content';
import { AGE_RATING_OPTIONS, CONTENT_TYPE_OPTIONS } from './grid-config';
import { ratedValueGetter } from './formatting';

/** Model this filter reads and writes — same shape as AG Grid Enterprise's Set Filter. */
export interface ContentTypeFilterModel {
	filterType: 'set';
	values: string[];
}

export interface CheckboxOption {
	/** Lowercased value used in the filter model and the `f.*` URL param. */
	value: string;
	label: string;
}

/**
 * Checkbox-list filter base. AG Grid Community has no Set Filter, and a free-text
 * box gave no hint which values exist, so subclasses list a hardcoded option set.
 * Nothing ticked = filter inactive; ticked values are OR'd.
 */
export abstract class CheckboxSetFilter implements IFilterComp<ContentItem> {
	protected abstract readonly options: readonly CheckboxOption[];
	protected abstract readonly ariaLabel: string;
	/** Lowercased row value this filter matches against, or null when the row has none. */
	protected abstract rowValue(row: ContentItem | undefined): string | null;

	private params!: IFilterParams<ContentItem>;
	private gui!: HTMLElement;
	private selected = new Set<string>();
	private checkboxes = new Map<string, HTMLInputElement>();

	init(params: IFilterParams<ContentItem>): void {
		this.params = params;
		this.gui = document.createElement('div');
		this.gui.className = 'flex flex-col gap-1 p-2 min-w-40 text-sm';
		this.gui.setAttribute('role', 'group');
		this.gui.setAttribute('aria-label', this.ariaLabel);

		for (const option of this.options) {
			const label = document.createElement('label');
			label.className = 'flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-muted';

			const input = document.createElement('input');
			input.type = 'checkbox';
			input.value = option.value;
			input.className = 'accent-primary';
			input.addEventListener('change', () => {
				if (input.checked) this.selected.add(option.value);
				else this.selected.delete(option.value);
				this.params.filterChangedCallback();
			});
			this.checkboxes.set(option.value, input);

			const text = document.createElement('span');
			text.textContent = option.label;

			label.append(input, text);
			this.gui.appendChild(label);
		}

		const clear = document.createElement('button');
		clear.type = 'button';
		clear.textContent = 'Clear';
		clear.className = 'self-start mt-1 px-1 text-xs text-muted-foreground hover:text-foreground';
		clear.addEventListener('click', () => {
			this.setModel(null);
			this.params.filterChangedCallback();
		});
		this.gui.appendChild(clear);
	}

	getGui(): HTMLElement {
		return this.gui;
	}

	isFilterActive(): boolean {
		return this.selected.size > 0;
	}

	doesFilterPass(params: IDoesFilterPassParams<ContentItem>): boolean {
		const value = this.rowValue(params.data);
		return value != null && this.selected.has(value);
	}

	getModel(): ContentTypeFilterModel | null {
		if (!this.isFilterActive()) return null;
		// Emit in option order so the URL value is stable regardless of click order.
		const values = this.options.map((o) => o.value).filter((v) => this.selected.has(v));
		return { filterType: 'set', values };
	}

	setModel(model: ContentTypeFilterModel | null): void {
		this.selected = new Set(model?.values ?? []);
		for (const [value, input] of this.checkboxes) {
			input.checked = this.selected.has(value);
		}
	}

	afterGuiAttached(): void {
		this.checkboxes.values().next().value?.focus();
	}
}

/** Type column: every content type from CONTENT_TYPE_OPTIONS. */
export class ContentTypeFilter extends CheckboxSetFilter {
	protected readonly options = CONTENT_TYPE_OPTIONS;
	protected readonly ariaLabel = 'Filter by content type';
	protected rowValue(row: ContentItem | undefined): string | null {
		return row?.contentType?.toLowerCase() ?? null;
	}
}

/** Rated column (Movie): the standard US certifications from AGE_RATING_OPTIONS. */
export class AgeRatingFilter extends CheckboxSetFilter {
	protected readonly options = AGE_RATING_OPTIONS;
	protected readonly ariaLabel = 'Filter by age rating';
	protected rowValue(row: ContentItem | undefined): string | null {
		return ratedValueGetter({ data: row })?.toLowerCase() ?? null;
	}
}
