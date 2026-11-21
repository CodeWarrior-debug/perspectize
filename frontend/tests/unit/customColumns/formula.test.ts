import { describe, it, expect } from 'vitest';
import { OPERANDS } from '#lib/customColumns/operands';
import { parseFormula, printFormula } from '#lib/customColumns/formula';
import type { FormulaNode } from '#lib/customColumns/types';

const parse = (text: string) => parseFormula(text, OPERANDS);
const tree = (text: string): FormulaNode => {
	const result = parse(text);
	if (!('tree' in result)) throw new Error(`expected a tree for ${text}: ${result.error}`);
	return result.tree;
};
const errorOf = (text: string) => {
	const result = parse(text);
	if ('tree' in result) throw new Error(`expected an error for ${text}`);
	return result;
};

const tmdb: FormulaNode = { operand: 'tmdbScore' };
const budget: FormulaNode = { operand: 'budget' };
const votes: FormulaNode = { operand: 'votes' };

describe('parseFormula: the Bang for Buck example', () => {
	it('parses [TMDB score] / ([Budget] / 1000000) to the step tree', () => {
		expect(tree('[TMDB score] / ([Budget] / 1000000)')).toEqual({
			op: 'div',
			args: [tmdb, { op: 'div', args: [budget, { const: 1000000 }] }],
		});
	});

	it('matches column labels case-insensitively', () => {
		expect(tree('[tmdb score] / [budget]')).toEqual({ op: 'div', args: [tmdb, budget] });
	});
});

describe('parseFormula: precedence and associativity', () => {
	it('multiplies before adding', () => {
		expect(tree('[Votes] + [Runtime] * 2')).toEqual({
			op: 'add',
			args: [votes, { op: 'mul', args: [{ operand: 'runtime' }, { const: 2 }] }],
		});
	});

	it('is left-associative for minus and divide', () => {
		expect(tree('[Votes] - [Runtime] - 1')).toEqual({
			op: 'sub',
			args: [{ op: 'sub', args: [votes, { operand: 'runtime' }] }, { const: 1 }],
		});
	});

	it('honours parentheses', () => {
		expect(tree('([Votes] + 1) * 2')).toEqual({
			op: 'mul',
			args: [{ op: 'add', args: [votes, { const: 1 }] }, { const: 2 }],
		});
	});

	it('reads a negative literal after an operator', () => {
		expect(tree('[Votes] * -5')).toEqual({ op: 'mul', args: [votes, { const: -5 }] });
	});

	it('reads exponent notation', () => {
		expect(tree('[Budget] / 1e6')).toEqual({ op: 'div', args: [budget, { const: 1e6 }] });
	});
});

describe('parseFormula: functions', () => {
	it('parses log10, sqrt and zscore', () => {
		expect(tree('log10([Budget])')).toEqual({ op: 'log10', args: [budget] });
		expect(tree('sqrt([Votes])')).toEqual({ op: 'sqrt', args: [votes] });
		expect(tree('zscore([TMDB score])')).toEqual({ op: 'zscore', args: [tmdb] });
	});

	it('parses min, max and coalesce with two or more arguments', () => {
		expect(tree('min([Votes], 5)')).toEqual({ op: 'min', args: [votes, { const: 5 }] });
		expect(tree('max([Votes], 5)')).toEqual({ op: 'max', args: [votes, { const: 5 }] });
		expect(tree('coalesce([Budget], 0)')).toEqual({ op: 'coalesce', args: [budget, { const: 0 }] });
	});
});

describe('parseFormula: plain-language errors', () => {
	it('names the closest real columns for an unknown column', () => {
		const result = errorOf('[Rating]');
		expect(result.error).toBe("There's no column called [Rating]. Did you mean [TMDB score] or [My overall]?");
		expect(result.suggestions).toEqual(['TMDB score', 'My overall']);
	});

	it('suggests one column when only one is close', () => {
		expect(errorOf('[Box offce]').error).toBe("There's no column called [Box offce]. Did you mean [Box office]?");
	});

	it('reports an unclosed column bracket', () => {
		expect(errorOf('[Votes + 1').error).toMatch(/\]/);
	});

	it('reports unbalanced parentheses both ways', () => {
		expect(errorOf('([Votes] + 1').error).toMatch(/\)/);
		expect(errorOf('[Votes] + 1)').error).toMatch(/\(/);
	});

	it('reports the wrong number of arguments', () => {
		expect(errorOf('min([Votes])').error).toMatch(/at least 2/);
		expect(errorOf('log10([Votes], 2)').error).toMatch(/exactly 1/);
		expect(errorOf('[Votes] - [Runtime] - 1 - ').error).toMatch(/finish|stops/i);
	});

	it('reports an empty formula', () => {
		expect(errorOf('   ').error).toMatch(/Type a formula/);
	});

	it('reports an unknown function', () => {
		expect(errorOf('round([Votes])').error).toMatch(/no function called round/);
	});

	it('reports more than 200 parts (a wide call, so depth stays small)', () => {
		const args = (n: number) => Array.from({ length: n }, () => '[Votes]').join(', ');
		// min(...) with 199 operands is 200 nodes; 200 operands is 201.
		expect(tree(`min(${args(199)})`)).toBeDefined();
		expect(errorOf(`min(${args(200)})`).error).toMatch(/more than 200 parts/);
	});

	it('reports nesting deeper than 20 levels', () => {
		const nest = (n: number) => `${'log10('.repeat(n - 1)}[Votes]${')'.repeat(n - 1)}`;
		expect(tree(nest(20))).toBeDefined();
		expect(errorOf(nest(21)).error).toMatch(/more than 20 levels deep/);
	});
});

describe('printFormula', () => {
	it('prints the Bang for Buck tree in the canonical form', () => {
		expect(printFormula(tree('[TMDB score] / ([Budget] / 1000000)'), OPERANDS)).toBe(
			'[TMDB score] / ([Budget] / 1000000)',
		);
	});

	it('only adds parentheses where precedence needs them', () => {
		expect(printFormula(tree('[Votes] + [Runtime] * 2'), OPERANDS)).toBe('[Votes] + [Runtime] * 2');
		expect(printFormula(tree('([Votes] + 1) * 2'), OPERANDS)).toBe('([Votes] + 1) * 2');
	});

	it('prints functions with their names', () => {
		expect(printFormula(tree('min([Votes], 5)'), OPERANDS)).toBe('min([Votes], 5)');
		expect(printFormula(tree('log10([Budget]) + 2'), OPERANDS)).toBe('log10([Budget]) + 2');
	});

	it('round-trips: parse(print(tree)) equals tree', () => {
		const trees: FormulaNode[] = [
			{ op: 'sub', args: [tmdb, { op: 'sub', args: [votes, budget] }] },
			{ op: 'zscore', args: [{ op: 'log10', args: [budget] }] },
			{ op: 'add', args: [votes, { const: -5 }] },
			{ op: 'coalesce', args: [budget, { const: 1e21 }] },
			{ op: 'mul', args: [{ const: 0.000001 }, votes] },
		];
		for (const t of trees) {
			const printed = printFormula(t, OPERANDS);
			expect(tree(printed), printed).toEqual(t);
		}
	});

	it('round-trips: print(parse(text)) is stable for canonical text', () => {
		for (const text of ['[Votes] * (-5)', 'sqrt([Votes]) - 1', '[Budget] / 1000000']) {
			expect(printFormula(tree(text), OPERANDS)).toBe(text);
		}
	});

	it('prints an unknown operand key in brackets', () => {
		expect(printFormula({ operand: 'mystery' }, OPERANDS)).toBe('[mystery]');
	});
});
