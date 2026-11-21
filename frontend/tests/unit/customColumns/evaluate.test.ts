import { describe, it, expect } from 'vitest';
import { evaluate, evaluateColumn, zscoreOf, MIN_ZSCORE_POPULATION } from '#lib/customColumns/evaluate';
import type { Operand, OperandRow } from '#lib/customColumns/operands';
import type { FormulaNode } from '#lib/customColumns/types';

// Test-only rows: a flat record of numbers read by each operand. Keeps the evaluator tests
// independent of the movie catalogue.
type Vals = Record<string, number | null | undefined>;
const row = (vals: Vals): OperandRow => ({ vals }) as unknown as OperandRow;
const valsOf = (r: OperandRow) => (r as unknown as { vals: Vals }).vals;

const operand = (key: string): Operand => ({
	key,
	label: key,
	group: 'TMDB',
	unit: 'number',
	aliases: [],
	get: (r) => valsOf(r)[key] ?? null,
});
const registry = new Map(['a', 'b', 'c'].map((k) => [k, operand(k)]));
const ctx = { operands: registry };

const a: FormulaNode = { operand: 'a' };
const b: FormulaNode = { operand: 'b' };
const c = (n: number): FormulaNode => ({ const: n });

describe('evaluate: missing is null, never zero', () => {
	it('returns null for a missing operand, not 0', () => {
		expect(evaluate(a, row({}), ctx)).toBeNull();
		expect(evaluate(a, row({ a: null }), ctx)).toBeNull();
	});

	it('returns the operand value when present, including 0', () => {
		expect(evaluate(a, row({ a: 0 }), ctx)).toBe(0);
		expect(evaluate(a, row({ a: 7.5 }), ctx)).toBe(7.5);
	});

	it('returns null for an operand key that is not in the catalogue', () => {
		expect(evaluate({ operand: 'nope' }, row({ a: 1 }), ctx)).toBeNull();
	});
});

describe('evaluate: arithmetic', () => {
	it('computes add, sub, mul and div', () => {
		const r = row({ a: 6, b: 3 });
		expect(evaluate({ op: 'add', args: [a, b] }, r, ctx)).toBe(9);
		expect(evaluate({ op: 'sub', args: [a, b] }, r, ctx)).toBe(3);
		expect(evaluate({ op: 'mul', args: [a, b] }, r, ctx)).toBe(18);
		expect(evaluate({ op: 'div', args: [a, b] }, r, ctx)).toBe(2);
	});

	it('propagates a null operand through any arithmetic', () => {
		const r = row({ a: 6 });
		expect(evaluate({ op: 'add', args: [a, b] }, r, ctx)).toBeNull();
		expect(evaluate({ op: 'mul', args: [b, a] }, r, ctx)).toBeNull();
		expect(evaluate({ op: 'div', args: [a, b] }, r, ctx)).toBeNull();
	});

	it('returns null for division by zero', () => {
		expect(evaluate({ op: 'div', args: [a, c(0)] }, row({ a: 6 }), ctx)).toBeNull();
	});

	it('returns null when the result is not finite', () => {
		expect(evaluate({ op: 'mul', args: [c(1e308), c(10)] }, row({}), ctx)).toBeNull();
	});

	it('treats a zero constant as a value', () => {
		expect(evaluate({ op: 'add', args: [a, c(0)] }, row({ a: 4 }), ctx)).toBe(4);
	});
});

describe('evaluate: min, max and coalesce', () => {
	it('min and max return null when any argument is null', () => {
		const r = row({ a: 2 });
		expect(evaluate({ op: 'min', args: [a, b] }, r, ctx)).toBeNull();
		expect(evaluate({ op: 'max', args: [a, b] }, r, ctx)).toBeNull();
	});

	it('min and max pick the extreme of present values', () => {
		const r = row({ a: 2, b: 5 });
		expect(evaluate({ op: 'min', args: [a, b] }, r, ctx)).toBe(2);
		expect(evaluate({ op: 'max', args: [a, b] }, r, ctx)).toBe(5);
	});

	it('coalesce returns the first non-null argument', () => {
		expect(evaluate({ op: 'coalesce', args: [a, b] }, row({ b: 9 }), ctx)).toBe(9);
		expect(evaluate({ op: 'coalesce', args: [a, b] }, row({ a: 1, b: 9 }), ctx)).toBe(1);
		expect(evaluate({ op: 'coalesce', args: [a, c(0)] }, row({}), ctx)).toBe(0);
	});

	it('coalesce returns null when every argument is null', () => {
		expect(evaluate({ op: 'coalesce', args: [a, b] }, row({}), ctx)).toBeNull();
	});
});

describe('evaluate: log10 and sqrt domains', () => {
	it('log10 is defined for positive values only', () => {
		expect(evaluate({ op: 'log10', args: [c(100)] }, row({}), ctx)).toBe(2);
		expect(evaluate({ op: 'log10', args: [c(0)] }, row({}), ctx)).toBeNull();
		expect(evaluate({ op: 'log10', args: [c(-3)] }, row({}), ctx)).toBeNull();
		expect(evaluate({ op: 'log10', args: [a] }, row({}), ctx)).toBeNull();
	});

	it('sqrt is defined for non-negative values', () => {
		expect(evaluate({ op: 'sqrt', args: [c(9)] }, row({}), ctx)).toBe(3);
		expect(evaluate({ op: 'sqrt', args: [c(0)] }, row({}), ctx)).toBe(0);
		expect(evaluate({ op: 'sqrt', args: [c(-1)] }, row({}), ctx)).toBeNull();
	});
});

describe('zscoreOf: population z-score', () => {
	it('uses the population standard deviation (divide by N, not N-1)', () => {
		// mean 3, population sd sqrt(2): z(5) = 2 / sqrt(2). Sample sd would give 1.2649.
		expect(zscoreOf(5, [1, 2, 3, 4, 5])).toBeCloseTo(Math.SQRT2, 10);
	});

	it('is 0 for the typical value and negative below the mean', () => {
		expect(zscoreOf(3, [1, 2, 3, 4, 5])).toBeCloseTo(0, 12);
		expect(zscoreOf(1, [1, 2, 3, 4, 5])).toBeCloseTo(-Math.SQRT2, 10);
	});

	it('needs at least five population values', () => {
		expect(MIN_ZSCORE_POPULATION).toBe(5);
		expect(zscoreOf(5, [1, 2, 3, 4])).toBeNull();
		expect(zscoreOf(5, [1, 2, 3, 4, 5])).not.toBeNull();
	});

	it('gives 0 for zero spread, not an error', () => {
		expect(zscoreOf(4, [4, 4, 4, 4, 4])).toBe(0);
	});

	it('returns null for a null value', () => {
		expect(zscoreOf(null, [1, 2, 3, 4, 5])).toBeNull();
	});
});

describe('evaluate: zscore nodes read their population from the context', () => {
	const zA: FormulaNode = { op: 'zscore', args: [a] };
	const popCtx = (values: number[]) => ({
		operands: registry,
		population: new Map([[JSON.stringify(a), values]]),
	});

	it('scores the row against the supplied population', () => {
		expect(evaluate(zA, row({ a: 5 }), popCtx([1, 2, 3, 4, 5]))).toBeCloseTo(Math.SQRT2, 10);
	});

	it('returns null when no population was supplied for that sub-expression', () => {
		expect(evaluate(zA, row({ a: 5 }), ctx)).toBeNull();
	});

	it('returns null for a row with no value, even when the population is complete', () => {
		expect(evaluate(zA, row({}), popCtx([1, 2, 3, 4, 5]))).toBeNull();
	});
});

describe('evaluateColumn', () => {
	it('computes every row, skipping rows with no value', () => {
		const rows = [1, 2, 3, 4, 5, null].map((v) => row({ a: v }));
		const tree: FormulaNode = { op: 'mul', args: [a, c(10)] };
		expect(evaluateColumn(tree, rows, registry)).toEqual([10, 20, 30, 40, 50, null]);
	});

	it('resolves a zscore population over all loaded rows, excluding nulls', () => {
		const rows = [1, 2, 3, 4, 5, null].map((v) => row({ a: v }));
		const values = evaluateColumn({ op: 'zscore', args: [a] }, rows, registry);
		expect(values[4]).toBeCloseTo(Math.SQRT2, 10);
		expect(values[2]).toBeCloseTo(0, 12);
		expect(values[5]).toBeNull();
	});

	it('gives every row null when fewer than five rows have a value', () => {
		const rows = [1, 2, 3, null, null].map((v) => row({ a: v }));
		expect(evaluateColumn({ op: 'zscore', args: [a] }, rows, registry)).toEqual([null, null, null, null, null]);
	});

	it('keeps two zscore populations independent', () => {
		const rows = [
			{ a: 1, b: 10 },
			{ a: 2, b: 20 },
			{ a: 3, b: 30 },
			{ a: 4, b: 40 },
			{ a: 5, b: 50 },
		].map(row);
		const tree: FormulaNode = {
			op: 'add',
			args: [
				{ op: 'zscore', args: [a] },
				{ op: 'zscore', args: [b] },
			],
		};
		// Both columns are perfectly aligned, so each z is the same and the sum is twice a's z.
		const values = evaluateColumn(tree, rows, registry);
		expect(values[4]).toBeCloseTo(2 * Math.SQRT2, 10);
		expect(values[0]).toBeCloseTo(-2 * Math.SQRT2, 10);
	});

	it('resolves a zscore nested inside another zscore argument', () => {
		const rows = [1, 2, 3, 4, 5].map((v) => row({ a: v }));
		const tree: FormulaNode = { op: 'zscore', args: [{ op: 'zscore', args: [a] }] };
		const values = evaluateColumn(tree, rows, registry);
		// The inner z-scores are symmetric around 0, so their own z-score is 0 at the middle row.
		expect(values[2]).toBeCloseTo(0, 12);
		expect(values[4]).toBeGreaterThan(0);
	});
});
