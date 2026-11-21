import { describe, it, expect } from 'vitest';
import {
	FN_ARITY,
	FORMULA_MAX_DEPTH,
	FORMULA_MAX_NODES,
	countNodes,
	formulaShapeError,
	treeDepth,
	type FormulaNode,
} from '#lib/customColumns/types';

const leaf = (key: string): FormulaNode => ({ operand: key });

/** A chain of log10 wrapped around one operand: depth = wraps + 1. */
const logChain = (wraps: number): FormulaNode => {
	let node: FormulaNode = leaf('votes');
	for (let i = 0; i < wraps; i++) node = { op: 'log10', args: [node] };
	return node;
};

describe('FN_ARITY mirrors the backend validator', () => {
	it('lists exactly the ten whitelisted functions with their arity', () => {
		expect(FN_ARITY).toEqual({
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
		});
	});

	it('uses the backend caps', () => {
		expect(FORMULA_MAX_NODES).toBe(200);
		expect(FORMULA_MAX_DEPTH).toBe(20);
	});
});

describe('formulaShapeError', () => {
	it('accepts a well-formed tree', () => {
		const tree: FormulaNode = {
			op: 'div',
			args: [leaf('tmdbScore'), { op: 'div', args: [leaf('budget'), { const: 1000000 }] }],
		};
		expect(formulaShapeError(tree)).toBeNull();
	});

	it('rejects sub with three arguments', () => {
		const tree: FormulaNode = { op: 'sub', args: [leaf('votes'), leaf('votes'), leaf('votes')] };
		expect(formulaShapeError(tree)).toMatch(/sub takes exactly 2 arguments/);
	});

	it('rejects coalesce with one argument', () => {
		expect(formulaShapeError({ op: 'coalesce', args: [leaf('votes')] })).toMatch(/coalesce takes at least 2 arguments/);
	});

	it('rejects zscore with two arguments', () => {
		expect(formulaShapeError({ op: 'zscore', args: [leaf('votes'), leaf('votes')] })).toMatch(
			/zscore takes exactly 1 argument/,
		);
	});

	it('rejects non-finite constants and empty operand keys', () => {
		expect(formulaShapeError({ const: Number.NaN })).toMatch(/finite/);
		expect(formulaShapeError({ const: Number.POSITIVE_INFINITY })).toMatch(/finite/);
		expect(formulaShapeError({ operand: '  ' })).toMatch(/operand/);
	});

	it('allows exactly 200 nodes and rejects 201', () => {
		const flat = (leaves: number): FormulaNode => ({
			op: 'add',
			args: Array.from({ length: leaves }, () => leaf('votes')),
		});
		// One add node plus 199 leaves is 200 nodes.
		expect(countNodes(flat(199))).toBe(200);
		expect(formulaShapeError(flat(199))).toBeNull();
		expect(countNodes(flat(200))).toBe(201);
		expect(formulaShapeError(flat(200))).toMatch(/more than 200 parts/);
	});

	it('allows depth 20 and rejects depth 21 (a lone operand is depth 1)', () => {
		expect(treeDepth(leaf('votes'))).toBe(1);
		expect(treeDepth(logChain(19))).toBe(20);
		expect(formulaShapeError(logChain(19))).toBeNull();
		expect(treeDepth(logChain(20))).toBe(21);
		expect(formulaShapeError(logChain(20))).toMatch(/more than 20 levels deep/);
	});
});
