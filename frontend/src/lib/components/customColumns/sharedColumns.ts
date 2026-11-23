/**
 * Pure helpers for the shared-columns picker: what a formula uses, its top result on the
 * viewer's loaded rows, which content types it covers, and how a failed add reads in plain words.
 * No runes, no network.
 */
import { evaluateColumn, type OperandRow, OPERANDS_BY_KEY } from '#lib/customColumns/index.js';
import { isOpNode, type FormulaNode } from '#lib/customColumns/types.js';
import type { SavedFormula } from '#lib/queries/savedFormulas/index.js';

/** Operand keys in the order they first appear in the tree, each once. */
export function operandKeys(tree: FormulaNode, keys: string[] = []): string[] {
	if ('operand' in tree) {
		if (!keys.includes(tree.operand)) keys.push(tree.operand);
		return keys;
	}
	if (isOpNode(tree)) {
		for (const arg of tree.args) operandKeys(arg, keys);
	}
	return keys;
}

/** Column labels for the formula's operands. An unknown key is shown as-is. */
export function usesLabels(tree: FormulaNode): string[] {
	return operandKeys(tree).map((key) => OPERANDS_BY_KEY.get(key)?.label ?? key);
}

export type TopResult = { title: string; value: number };

/** The row with the highest value for the formula, or null when no row has one. */
export function topResult(tree: FormulaNode, rows: readonly OperandRow[]): TopResult | null {
	const values = evaluateColumn(tree, rows, OPERANDS_BY_KEY);
	let best: TopResult | null = null;
	values.forEach((value, index) => {
		if (value === null) return;
		if (best === null || value > best.value) {
			best = { title: rowTitle(rows[index]), value };
		}
	});
	return best;
}

/** A movie's title is the list row's name, not on OperandRow's type. Read it if present. */
function rowTitle(row: OperandRow): string {
	const title = (row as { name?: string | null }).name;
	return title && title.trim() !== '' ? title : '—';
}

const CONTENT_TYPE_LABELS: Readonly<Record<string, string>> = {
	MOVIE: 'Movies',
	YOUTUBE_VIDEO: 'YouTube',
	BIBLE_PASSAGE: 'Bible',
	WEB_PAGE: 'Web pages',
	BOOK: 'Books',
};

/** The scope pills for a formula: one per content type, or a single "Any type" when unscoped. */
export function scopeLabels(contentTypes: readonly string[] | undefined): string[] {
	if (!contentTypes || contentTypes.length === 0) return ['Any type'];
	return contentTypes.map((type) => CONTENT_TYPE_LABELS[type] ?? type);
}

/** A failed copy or link in plain words. Never shows raw server text. */
export function sharedErrorMessage(err: unknown): string {
	const text = err instanceof Error ? err.message : '';
	if (/already exists|already in use|ErrAlreadyExists/i.test(text)) {
		return 'You already have a column with that name. Rename yours, then try again.';
	}
	if (/not found|no longer|not available|forbidden|not public/i.test(text)) {
		return 'This column is no longer available.';
	}
	return 'Could not add this column. Try again.';
}

/**
 * The item a copy or link acts on. A link cannot point at another link (the server forbids
 * chains), so a link row acts on its source.
 */
export function actionTargetId(row: SavedFormula): string {
	return row.origin === 'LINK' && row.sourceId ? row.sourceId : row.id;
}

/** A row can be used when its payload reads, which is false for a link whose source is gone. */
export function isAvailable(row: SavedFormula): boolean {
	return row.sourceAvailable && row.payload !== null;
}
