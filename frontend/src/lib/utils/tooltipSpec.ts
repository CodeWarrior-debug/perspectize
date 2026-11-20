export interface CellCtx {
	value: unknown;
	valueFormatted?: string | null;
	data?: any;
}

export interface TooltipSpec {
	mode?: 'single' | 'multi';
	text?: (c: CellCtx) => string;
	copyValue?: (c: CellCtx) => string | number | null | undefined;
	items?: (c: CellCtx) => string[];
	/** Per-item text to copy, parallel to `items`; defaults to the item label itself. */
	itemCopyValues?: (c: CellCtx) => string[];
	/** Shown (no copy) when the cell has no content; if unset, no popover opens. */
	emptyText?: string;
}

export type ColTooltipSpec = TooltipSpec | false;

const DEFAULT_SPEC: TooltipSpec = {
	mode: 'single',
	text: (c) => String(c.valueFormatted ?? c.value ?? ''),
	copyValue: (c) => c.value as string | number | null | undefined,
};

export function resolveSpec(colSpec: ColTooltipSpec | undefined): TooltipSpec | null {
	if (colSpec === false) return null;
	return { ...DEFAULT_SPEC, ...(colSpec ?? {}) };
}

export function displayText(spec: TooltipSpec, c: CellCtx): string {
	return (spec.text ?? DEFAULT_SPEC.text!)(c);
}

export function copyText(spec: TooltipSpec, c: CellCtx): string | null {
	const v = (spec.copyValue ?? DEFAULT_SPEC.copyValue!)(c);
	if (v === null || v === undefined || v === '') return null;
	return String(v);
}

export function itemsCopyText(
	items: string[],
	selected: ReadonlySet<string> | null,
	copyValues?: readonly string[],
): string {
	const picked = items
		.map((label, i) => ({ label, value: copyValues?.[i] ?? label }))
		.filter((it) => selected === null || selected.has(it.label));
	return picked.map((it) => it.value).join(', ');
}
