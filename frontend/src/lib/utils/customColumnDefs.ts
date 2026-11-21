/**
 * Pure helpers that turn saved custom-column formulas into AG Grid column definitions and
 * per-row values. No Svelte, no data fetching: ActivityTable feeds them the query results.
 *
 * A custom column's value is computed in the browser (see lib/customColumns). Its colDef reads
 * the value from `context.customValues`, a map keyed by colId then row id, which ActivityTable
 * keeps current. z-scores need the whole loaded population, so that map is built once per
 * (formulas, loaded rows) by `customColumnValues`, not per cell.
 */
import type { ColDef, ValueFormatterParams, ValueGetterParams } from '@ag-grid-community/core';
import {
	OPERANDS,
	OPERANDS_BY_KEY,
	evaluateColumn,
	isOpNode,
	printFormula,
	type FormulaNode,
	type MyRatingField,
	type OperandRow,
} from '#lib/customColumns/index.js';
import type { SavedFormula } from '#lib/queries/savedFormulas';
import type { ContentItem } from '#lib/queries/content/index.js';
import { EMPTY_VALUE } from '#lib/utils/formatting.js';
import { headerMinWidth } from '#lib/utils/grid-header-width.js';
import { unknownLastComparator } from '#lib/utils/grid-config.js';

// ---------------------------------------------------------------------------
// Column ids
// ---------------------------------------------------------------------------

const CUSTOM_PREFIX = 'custom:';

/** The grid colId for a saved formula. Built-in colIds never start with `custom:`. */
export function customColId(id: string): string {
	return `${CUSTOM_PREFIX}${id}`;
}

export function isCustomColId(colId: string | null | undefined): colId is string {
	return typeof colId === 'string' && colId.startsWith(CUSTOM_PREFIX);
}

/** The saved-item id behind a custom colId (the input is assumed to be a custom colId). */
export function formulaIdFromColId(colId: string): string {
	return colId.slice(CUSTOM_PREFIX.length);
}

// ---------------------------------------------------------------------------
// Row shaping
// ---------------------------------------------------------------------------

/** The viewer's own ratings for a row, in storage units (0-10000). Missing ratings are null. */
export type ViewerRatings = Partial<Record<MyRatingField, number | null>>;

/** An operand row that still carries its content id, so values can be keyed by row. */
export type ShapedRow = OperandRow & { id: string | number };

/**
 * A content row as the formula operands read it: the row plus the viewer's ratings for it.
 * `ratings` is the viewer's perspective on the row (storage scale), or undefined when unrated.
 */
export function toOperandRow(item: ContentItem, ratings: ViewerRatings | null | undefined): ShapedRow {
	return {
		...item,
		myRatings: {
			quality: ratings?.quality ?? null,
			importance: ratings?.importance ?? null,
			agreement: ratings?.agreement ?? null,
		},
	};
}

// ---------------------------------------------------------------------------
// Number formats (payload.numberFormat)
// ---------------------------------------------------------------------------

/**
 * The keys a formula's `numberFormat` may name. Anything else (or none) is the default,
 * `sig3`: three significant figures. Values are used as the operand returns them: `percent`
 * expects a fraction (0.25 shows as 25%).
 */
export const CUSTOM_NUMBER_FORMATS = ['sig3', 'rating', 'dollars', 'percent'] as const;
export type CustomNumberFormat = (typeof CUSTOM_NUMBER_FORMATS)[number];

const sig3 = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });
const rating = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

/** A custom column's value as shown in a cell. A null value is the em dash, never 0. */
export function formatCustomValue(value: number | null | undefined, numberFormat?: string | null): string {
	if (value == null || !Number.isFinite(value)) return EMPTY_VALUE;
	switch (numberFormat) {
		case 'rating':
			return rating.format(value);
		case 'dollars':
			return dollars.format(value);
		case 'percent':
			return percent.format(value);
		default:
			return sig3.format(value);
	}
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/** True when the formula contains a z-score anywhere (it then depends on the loaded rows). */
export function hasZscore(node: FormulaNode): boolean {
	if (!isOpNode(node)) return false;
	return node.op === 'zscore' || node.args.some(hasZscore);
}

/** colId -> (row id -> value). Built by `customColumnValues`; read from the grid context. */
export type CustomValues = ReadonlyMap<string, ReadonlyMap<string, number | null>>;

/**
 * Every available custom column's value for each row. A z-score needs the whole loaded
 * population, so in "All Items" mode (only the current page is loaded) a z-score column has
 * no values at all, rather than a z-score over one page.
 */
export function customColumnValues(
	formulas: readonly SavedFormula[],
	rows: readonly ShapedRow[],
	mode: 'all' | 'loaded',
): Map<string, Map<string, number | null>> {
	const out = new Map<string, Map<string, number | null>>();
	for (const formula of formulas) {
		const tree = formula.payload?.expression;
		if (!tree) continue;
		const byRow = new Map<string, number | null>();
		const zscoreUnavailable = mode === 'all' && hasZscore(tree);
		const values = zscoreUnavailable ? rows.map(() => null) : evaluateColumn(tree, rows, OPERANDS_BY_KEY);
		rows.forEach((row, i) => byRow.set(String(row.id), values[i] ?? null));
		out.set(customColId(formula.id), byRow);
	}
	return out;
}

// ---------------------------------------------------------------------------
// Owner and tooltip copy
// ---------------------------------------------------------------------------

/** Who a saved formula belongs to, from the viewer's side: 'Yours', 'by @user' or 'linked from @user'. */
export function customOwnerLabel(formula: Pick<SavedFormula, 'origin' | 'user'>, viewerId: string | null): string {
	if (formula.origin === 'LINK') return `linked from @${formula.user.username}`;
	if (viewerId !== null && formula.user.id === viewerId) return 'Yours';
	return `by @${formula.user.username}`;
}

/** The operand labels a formula reads, in first-use order, for "Your calculation from …". */
export function formulaOperandLabels(node: FormulaNode): string[] {
	const keys: string[] = [];
	const walk = (n: FormulaNode) => {
		if ('operand' in n) {
			if (!keys.includes(n.operand)) keys.push(n.operand);
		} else if (isOpNode(n)) {
			n.args.forEach(walk);
		}
	};
	walk(node);
	return keys.flatMap((k) => {
		const label = OPERANDS_BY_KEY.get(k)?.label;
		return label ? [label] : [];
	});
}

export type CustomHeaderOptions = {
	mode: 'all' | 'loaded';
	viewerId: string | null;
	/** Loaded rows the column was computed over (only used for z-scores). */
	rowCount: number;
};

/**
 * The header tooltip, one fact per line: name, subtitle, formula, owner, privacy, the operands
 * (always as the user's own calculation), then the z-score and mode notes where they apply.
 */
export function customHeaderTooltip(formula: SavedFormula, opts: CustomHeaderOptions): string {
	const payload = formula.payload;
	const lines: string[] = [formula.name];
	if (payload?.subtitle) lines.push(payload.subtitle);
	if (payload) {
		lines.push(`Formula: ${printFormula(payload.expression, OPERANDS)}`);
		const labels = formulaOperandLabels(payload.expression);
		if (labels.length > 0) lines.push(`Your calculation from ${labels.join(', ')}`);
	}
	lines.push(customOwnerLabel(formula, opts.viewerId));
	lines.push(formula.privacy === 'PRIVATE' ? 'Private' : 'Public');
	if (payload && hasZscore(payload.expression)) {
		lines.push(
			opts.mode === 'all'
				? 'Compare to the rest needs every loaded row, so it has no value in All Items'
				: `vs these ${opts.rowCount} loaded rows`,
		);
	}
	if (opts.mode === 'all') lines.push('Sorting and filtering by custom columns works in Loaded mode');
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

export type CustomColumnSet = {
	/** One colDef per available formula, hidden by default (the picker turns them on). */
	colDefs: ColDef<ContentItem>[];
	/** Links whose source is gone (payload null). They get no column; the picker lists them. */
	unavailable: SavedFormula[];
};

/**
 * AG Grid colDefs for the saved formulas. Values come from `context.customValues`, so a colDef
 * depends only on the formula, the mode and the viewer, not on the row data. The one exception is
 * the z-score header note, which quotes the loaded row count.
 */
export function buildCustomColDefs(formulas: readonly SavedFormula[], opts: CustomHeaderOptions): CustomColumnSet {
	const colDefs: ColDef<ContentItem>[] = [];
	const unavailable: SavedFormula[] = [];
	for (const formula of formulas) {
		const payload = formula.payload;
		if (!payload) {
			unavailable.push(formula);
			continue;
		}
		const colId = customColId(formula.id);
		const headerName = `ƒ ${formula.name}`;
		const loadedMode = opts.mode === 'loaded';
		colDefs.push({
			colId,
			headerName,
			headerTooltip: customHeaderTooltip(formula, opts),
			width: 130,
			hide: true,
			type: 'rightAligned',
			sortable: loadedMode,
			filter: loadedMode ? 'agNumberColumnFilter' : false,
			comparator: unknownLastComparator,
			valueGetter: (params: ValueGetterParams<ContentItem>) =>
				(params.context?.customValues as CustomValues | undefined)?.get(colId)?.get(String(params.data?.id)) ?? null,
			valueFormatter: (params: ValueFormatterParams<ContentItem>) =>
				formatCustomValue(params.value as number | null, payload.numberFormat),
			minWidth: headerMinWidth(headerName, { filter: loadedMode, sortable: loadedMode }),
		});
	}
	return { colDefs, unavailable };
}

// ---------------------------------------------------------------------------
// Picker rows
// ---------------------------------------------------------------------------

/** One line of the picker's "Custom columns" group. */
export type CustomPickerRow = {
	id: string;
	colId: string;
	name: string;
	ownerLabel: string;
	/** True for the viewer's own formulas (Edit is offered). */
	own: boolean;
	privacy: SavedFormula['privacy'];
	formula: SavedFormula;
};

/** Picker rows for the available formulas, and the unavailable links listed greyed out. */
export function customPickerRows(
	formulas: readonly SavedFormula[],
	unavailable: readonly SavedFormula[],
	viewerId: string | null,
): { available: CustomPickerRow[]; unavailable: CustomPickerRow[] } {
	const shape = (formula: SavedFormula): CustomPickerRow => ({
		id: formula.id,
		colId: customColId(formula.id),
		name: formula.name,
		ownerLabel: customOwnerLabel(formula, viewerId),
		own: formula.origin !== 'LINK' && viewerId !== null && formula.user.id === viewerId,
		privacy: formula.privacy,
		formula,
	});
	return { available: formulas.map(shape), unavailable: unavailable.map(shape) };
}
