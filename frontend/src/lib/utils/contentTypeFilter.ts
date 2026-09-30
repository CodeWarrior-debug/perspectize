import type { IDoesFilterPassParams, IFilterComp, IFilterParams } from '@ag-grid-community/core';
import type { ContentItem } from '$lib/queries/content';
import { CONTENT_TYPE_OPTIONS } from './grid-config';

/** Model this filter reads and writes — same shape as AG Grid Enterprise's Set Filter. */
export interface ContentTypeFilterModel {
	filterType: 'set';
	values: string[];
}

/**
 * Checkbox-list filter for the Type column. AG Grid Community has no Set Filter,
 * and a free-text box gave no hint which types exist (and only matched the full
 * enum value server-side), so this lists every content type from the hardcoded
 * CONTENT_TYPE_OPTIONS. Nothing ticked = filter inactive; ticked types are OR'd.
 */
export class ContentTypeFilter implements IFilterComp<ContentItem> {
	private params!: IFilterParams<ContentItem>;
	private gui!: HTMLElement;
	private selected = new Set<string>();
	private checkboxes = new Map<string, HTMLInputElement>();

	init(params: IFilterParams<ContentItem>): void {
		this.params = params;
		this.gui = document.createElement('div');
		this.gui.className = 'flex flex-col gap-1 p-2 min-w-40 text-sm';
		this.gui.setAttribute('role', 'group');
		this.gui.setAttribute('aria-label', 'Filter by content type');

		for (const option of CONTENT_TYPE_OPTIONS) {
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
		const type = params.data?.contentType?.toLowerCase();
		return type != null && this.selected.has(type);
	}

	getModel(): ContentTypeFilterModel | null {
		if (!this.isFilterActive()) return null;
		// Emit in option order so the URL value is stable regardless of click order.
		const values = CONTENT_TYPE_OPTIONS.map((o) => o.value).filter((v) => this.selected.has(v));
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
