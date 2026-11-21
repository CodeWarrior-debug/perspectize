/**
 * Pure evaluator for custom-column formulas. A value of null means "no value" (Decision 8):
 * a missing operand is never treated as zero. Any null operand makes the result null, except
 * inside `coalesce`, which takes the first non-null argument.
 *
 * z-scores need the population of values for their argument across the loaded rows. The
 * population is passed in through the context and never fetched; `evaluateColumn` builds it.
 */
import type { Operand, OperandRow } from './operands';
import { isConstNode, isOperandNode, type FormulaNode } from './types';

/** A z-score needs at least this many population values; fewer gives no value. */
export const MIN_ZSCORE_POPULATION = 5;

/** Operands by key; the catalogue passed in, so the evaluator stays independent of content types. */
export type OperandRegistry = ReadonlyMap<string, Operand>;

export type EvalContext = {
	operands: OperandRegistry;
	/**
	 * Population values for each z-score argument, keyed by `populationKey(argument)`. A z-score
	 * whose argument has no entry gives no value.
	 */
	population?: ReadonlyMap<string, readonly number[]>;
};

/** Key under which a z-score's population is stored: the canonical JSON of its argument subtree. */
export function populationKey(argument: FormulaNode): string {
	return JSON.stringify(argument);
}

const finiteOrNull = (v: number | null): number | null => (v !== null && Number.isFinite(v) ? v : null);

type Spread = { mean: number; sd: number };

/** Mean and population standard deviation (divide by N), computed once per population array. */
const spreadCache = new WeakMap<readonly number[], Spread | null>();

function spreadOf(population: readonly number[]): Spread | null {
	const cached = spreadCache.get(population);
	if (cached !== undefined) return cached;
	let result: Spread | null = null;
	if (population.length >= MIN_ZSCORE_POPULATION) {
		const n = population.length;
		const mean = population.reduce((acc, v) => acc + v, 0) / n;
		const variance = population.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
		result = { mean, sd: Math.sqrt(variance) };
	}
	spreadCache.set(population, result);
	return result;
}

/**
 * How far `x` sits from the population mean, in population standard deviations. Null when the
 * value is missing or the population has fewer than MIN_ZSCORE_POPULATION values; zero spread
 * gives 0.
 */
export function zscoreOf(x: number | null, population: readonly number[]): number | null {
	if (x === null) return null;
	const spread = spreadOf(population);
	if (!spread) return null;
	if (spread.sd === 0) return 0;
	return finiteOrNull((x - spread.mean) / spread.sd);
}

function applyBinary(op: 'add' | 'sub' | 'mul' | 'div', values: number[]): number | null {
	let acc = values[0];
	for (const v of values.slice(1)) {
		switch (op) {
			case 'add':
				acc += v;
				break;
			case 'sub':
				acc -= v;
				break;
			case 'mul':
				acc *= v;
				break;
			case 'div':
				if (v === 0) return null;
				acc /= v;
				break;
		}
	}
	return finiteOrNull(acc);
}

/** The value of a formula for one row, or null when it has none. */
export function evaluate(node: FormulaNode, row: OperandRow, ctx: EvalContext): number | null {
	if (isConstNode(node)) return finiteOrNull(node.const);
	if (isOperandNode(node)) return finiteOrNull(ctx.operands.get(node.operand)?.get(row) ?? null);

	const { op, args } = node;
	if (op === 'coalesce') {
		for (const arg of args) {
			const v = evaluate(arg, row, ctx);
			if (v !== null) return v;
		}
		return null;
	}

	if (op === 'zscore') {
		const x = evaluate(args[0], row, ctx);
		const population = ctx.population?.get(populationKey(args[0]));
		return population ? zscoreOf(x, population) : null;
	}

	const values: number[] = [];
	for (const arg of args) {
		const v = evaluate(arg, row, ctx);
		if (v === null) return null;
		values.push(v);
	}

	switch (op) {
		case 'add':
		case 'sub':
		case 'mul':
		case 'div':
			return applyBinary(op, values);
		case 'min':
			return finiteOrNull(Math.min(...values));
		case 'max':
			return finiteOrNull(Math.max(...values));
		case 'log10':
			return values[0] > 0 ? finiteOrNull(Math.log10(values[0])) : null;
		case 'sqrt':
			return values[0] >= 0 ? finiteOrNull(Math.sqrt(values[0])) : null;
	}
}

/** Every z-score argument in the tree, innermost first, so inner populations exist before outer ones need them. */
function zscoreArgumentsInnerFirst(node: FormulaNode, out: FormulaNode[] = []): FormulaNode[] {
	if (isConstNode(node) || isOperandNode(node)) return out;
	for (const arg of node.args) zscoreArgumentsInnerFirst(arg, out);
	if (node.op === 'zscore') out.push(node.args[0]);
	return out;
}

/**
 * The value of a formula for every row, in order. Each z-score's population is the value of its
 * argument over all rows that have one, so the z-score of a row is relative to the loaded rows.
 */
export function evaluateColumn(
	tree: FormulaNode,
	rows: readonly OperandRow[],
	operands: OperandRegistry,
): (number | null)[] {
	const population = new Map<string, number[]>();
	for (const argument of zscoreArgumentsInnerFirst(tree)) {
		const key = populationKey(argument);
		if (population.has(key)) continue;
		const ctx = { operands, population };
		const values: number[] = [];
		for (const row of rows) {
			const v = evaluate(argument, row, ctx);
			if (v !== null) values.push(v);
		}
		population.set(key, values);
	}
	const ctx = { operands, population };
	return rows.map((row) => evaluate(tree, row, ctx));
}
