/**
 * Shape of a custom column's formula, mirrored from the backend's formula validator
 * (`ValidateSavedFormulaPayload`). A node is exactly one of an operation, a constant or an
 * operand read; the function name is the `op` key.
 */

export type FnName = 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max' | 'coalesce' | 'log10' | 'sqrt' | 'zscore';

export type FormulaNode = { op: FnName; args: FormulaNode[] } | { const: number } | { operand: string };

/** The saved payload: the expression plus the builder's text fields. */
export type FormulaPayload = {
	expression: FormulaNode;
	subtitle?: string;
	numberFormat?: string;
	contentTypes?: string[];
};

export type FnArity = { min: number; max: number | null };

/** Allowed argument counts. `max: null` means no upper bound. */
export const FN_ARITY: Readonly<Record<FnName, FnArity>> = {
	add: { min: 2, max: null },
	mul: { min: 2, max: null },
	min: { min: 2, max: null },
	max: { min: 2, max: null },
	coalesce: { min: 2, max: null },
	sub: { min: 2, max: 2 },
	div: { min: 2, max: 2 },
	log10: { min: 1, max: 1 },
	sqrt: { min: 1, max: 1 },
	zscore: { min: 1, max: 1 },
};

/** Caps shared with the backend. A lone operand is depth 1. */
export const FORMULA_MAX_NODES = 200;
export const FORMULA_MAX_DEPTH = 20;

export const isOpNode = (n: FormulaNode): n is { op: FnName; args: FormulaNode[] } => 'op' in n;
export const isConstNode = (n: FormulaNode): n is { const: number } => 'const' in n;
export const isOperandNode = (n: FormulaNode): n is { operand: string } => 'operand' in n;

/** Total number of nodes in the tree. */
export function countNodes(node: FormulaNode): number {
	if (!isOpNode(node)) return 1;
	return 1 + node.args.reduce((acc, arg) => acc + countNodes(arg), 0);
}

/** Levels in the tree; a lone operand or constant is 1. */
export function treeDepth(node: FormulaNode): number {
	if (!isOpNode(node)) return 1;
	return 1 + node.args.reduce((acc, arg) => Math.max(acc, treeDepth(arg)), 0);
}

function arityMessage(op: FnName, arity: FnArity): string {
	const noun = (n: number) => (n === 1 ? 'argument' : 'arguments');
	if (arity.max === null) return `${op} takes at least ${arity.min} ${noun(arity.min)}`;
	if (arity.min === arity.max) return `${op} takes exactly ${arity.min} ${noun(arity.min)}`;
	return `${op} takes ${arity.min} to ${arity.max} arguments`;
}

/**
 * The first plain-language reason a tree is not a valid formula, or null when it is valid.
 * Covers the node and depth caps, function arity, finite constants and non-empty operand keys.
 */
export function formulaShapeError(tree: FormulaNode): string | null {
	if (countNodes(tree) > FORMULA_MAX_NODES) {
		return `This formula has more than ${FORMULA_MAX_NODES} parts. Split it into smaller columns.`;
	}
	if (treeDepth(tree) > FORMULA_MAX_DEPTH) {
		return `This formula is nested more than ${FORMULA_MAX_DEPTH} levels deep. Split it into smaller columns.`;
	}
	return nodeError(tree);
}

function nodeError(node: FormulaNode): string | null {
	if (isConstNode(node)) {
		return Number.isFinite(node.const) ? null : 'Constants must be finite numbers.';
	}
	if (isOperandNode(node)) {
		return node.operand.trim() === '' ? 'An operand must name a column.' : null;
	}
	const arity = FN_ARITY[node.op];
	if (!arity) return `There's no function called ${node.op}.`;
	const count = node.args.length;
	if (count < arity.min || (arity.max !== null && count > arity.max)) return arityMessage(node.op, arity);
	for (const arg of node.args) {
		const err = nodeError(arg);
		if (err) return err;
	}
	return null;
}
