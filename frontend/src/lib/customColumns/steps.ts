/**
 * The guided-steps model: a start column, then a chain of `add`/`sub`/`mul`/`div` steps, each
 * optionally scaled and optionally followed by the two plain-language transforms. Steps and the
 * formula tree are two views of one stored tree; `treeToSteps` returns null when the tree is not
 * a simple top-to-bottom chain, and the UI then stays on the formula bar.
 *
 * Transform order inside one step is fixed: the step's operation, then `compress` (log10), then
 * `compareToRest` (zscore). So a step with both is `zscore(log10(running))`.
 */
import { isConstNode, isOpNode, isOperandNode, type FormulaNode } from './types';

export type StepOp = 'add' | 'sub' | 'mul' | 'div';
export type StepScale = 'millions' | 'thousands' | 'none';
export type StepWith = { operand: string } | { const: number };

export type Step = {
	op: StepOp;
	with: StepWith;
	/** Divides the `with` value by 1,000,000 or 1,000 (e.g. Budget in $ millions). */
	scale?: StepScale;
	/** Log10 of the running value after this step ("Compress big gaps"). */
	compress?: boolean;
	/** Z-score of the running value after this step ("Compare to the rest"). */
	compareToRest?: boolean;
};

export type Steps = { start: string; steps: Step[] };

/** Plain-language labels for the UI. */
export const STEP_LABELS = {
	compress: 'Compress big gaps',
	compareToRest: 'Compare to the rest',
	millions: 'in $ millions',
	thousands: 'in $ thousands',
} as const;

const SCALE_DIVISOR: Record<Exclude<StepScale, 'none'>, number> = { millions: 1_000_000, thousands: 1_000 };

const STEP_OPS: readonly StepOp[] = ['add', 'sub', 'mul', 'div'];

function withNode(step: Step): FormulaNode {
	const base: FormulaNode = 'operand' in step.with ? { operand: step.with.operand } : { const: step.with.const };
	if (!step.scale || step.scale === 'none') return base;
	return { op: 'div', args: [base, { const: SCALE_DIVISOR[step.scale] }] };
}

/** Builds the formula tree for a steps model. */
export function stepsToTree(steps: Steps): FormulaNode {
	let acc: FormulaNode = { operand: steps.start };
	for (const step of steps.steps) {
		acc = { op: step.op, args: [acc, withNode(step)] };
		if (step.compress) acc = { op: 'log10', args: [acc] };
		if (step.compareToRest) acc = { op: 'zscore', args: [acc] };
	}
	return acc;
}

/** Splits a scale divisor off a with-value, if it is one. */
function splitScale(node: FormulaNode): { inner: FormulaNode; scale: StepScale } {
	if (isOpNode(node) && node.op === 'div' && node.args.length === 2 && isConstNode(node.args[1])) {
		const divisor = node.args[1].const;
		if (divisor === SCALE_DIVISOR.millions) return { inner: node.args[0], scale: 'millions' };
		if (divisor === SCALE_DIVISOR.thousands) return { inner: node.args[0], scale: 'thousands' };
	}
	return { inner: node, scale: 'none' };
}

/**
 * Reads one step off the top of a tree: an optional zscore, then an optional log10, then a
 * binary step operation. Returns the step and the running value beneath it, or null.
 */
function peelStep(node: FormulaNode): { step: Step; inner: FormulaNode } | null {
	let n = node;
	let compareToRest = false;
	let compress = false;
	if (isOpNode(n) && n.op === 'zscore') {
		compareToRest = true;
		n = n.args[0];
	}
	if (isOpNode(n) && n.op === 'log10') {
		compress = true;
		n = n.args[0];
	}
	if (!isOpNode(n) || n.args.length !== 2 || !STEP_OPS.includes(n.op as StepOp)) return null;

	const { inner, scale } = splitScale(n.args[1]);
	if (!isOperandNode(inner) && !isConstNode(inner)) return null;

	const step: Step = {
		op: n.op as StepOp,
		with: isOperandNode(inner) ? { operand: inner.operand } : { const: inner.const },
	};
	if (scale !== 'none') step.scale = scale;
	if (compress) step.compress = true;
	if (compareToRest) step.compareToRest = true;
	return { step, inner: n.args[0] };
}

/**
 * The steps model for a tree, or null when the tree is not a simple chain: a start operand with
 * binary steps whose right-hand side is a column or constant, optionally scaled and transformed.
 */
export function treeToSteps(tree: FormulaNode): Steps | null {
	const steps: Step[] = [];
	let node = tree;
	for (;;) {
		const peeled = peelStep(node);
		if (!peeled) break;
		steps.unshift(peeled.step);
		node = peeled.inner;
	}
	if (!isOperandNode(node)) return null;
	return { start: node.operand, steps };
}
