import { describe, it, expect } from 'vitest';
import { STEP_LABELS, stepsToTree, treeToSteps, type Steps } from '#lib/customColumns/steps';
import type { FormulaNode } from '#lib/customColumns/types';

const bangForBuck: Steps = {
	start: 'tmdbScore',
	steps: [{ op: 'div', with: { operand: 'budget' }, scale: 'millions' }],
};

const bangForBuckTree: FormulaNode = {
	op: 'div',
	args: [{ operand: 'tmdbScore' }, { op: 'div', args: [{ operand: 'budget' }, { const: 1000000 }] }],
};

describe('stepsToTree', () => {
	it('builds Bang for Buck: TMDB score divided by Budget in millions', () => {
		expect(stepsToTree(bangForBuck)).toEqual(bangForBuckTree);
	});

	it('returns the start operand alone when there are no steps', () => {
		expect(stepsToTree({ start: 'votes', steps: [] })).toEqual({ operand: 'votes' });
	});

	it('scales by thousands', () => {
		expect(stepsToTree({ start: 'budget', steps: [{ op: 'div', with: { const: 2 }, scale: 'thousands' }] })).toEqual({
			op: 'div',
			args: [{ operand: 'budget' }, { op: 'div', args: [{ const: 2 }, { const: 1000 }] }],
		});
	});

	it('wraps a step in log10 and then zscore, in that order', () => {
		const tree = stepsToTree({
			start: 'budget',
			steps: [{ op: 'mul', with: { const: 3 }, compress: true, compareToRest: true }],
		});
		expect(tree).toEqual({
			op: 'zscore',
			args: [{ op: 'log10', args: [{ op: 'mul', args: [{ operand: 'budget' }, { const: 3 }] }] }],
		});
	});
});

describe('treeToSteps', () => {
	it('reads Bang for Buck back as the same steps', () => {
		expect(treeToSteps(bangForBuckTree)).toEqual(bangForBuck);
	});

	it('returns a bare operand as zero steps', () => {
		expect(treeToSteps({ operand: 'votes' })).toEqual({ start: 'votes', steps: [] });
	});

	it('returns null when the start is not an operand', () => {
		expect(treeToSteps({ const: 4 })).toBeNull();
	});

	it('returns null for min, max and coalesce', () => {
		expect(treeToSteps({ op: 'min', args: [{ operand: 'a' }, { operand: 'b' }] })).toBeNull();
		expect(treeToSteps({ op: 'max', args: [{ operand: 'a' }, { operand: 'b' }] })).toBeNull();
		expect(treeToSteps({ op: 'coalesce', args: [{ operand: 'a' }, { const: 0 }] })).toBeNull();
		expect(
			treeToSteps({
				op: 'add',
				args: [{ op: 'coalesce', args: [{ operand: 'a' }, { const: 0 }] }, { operand: 'b' }],
			}),
		).toBeNull();
	});

	it('returns null for a branching tree (a step whose with-value is a formula)', () => {
		const branching: FormulaNode = {
			op: 'add',
			args: [{ operand: 'a' }, { op: 'mul', args: [{ operand: 'b' }, { operand: 'c' }] }],
		};
		expect(treeToSteps(branching)).toBeNull();
	});

	it('returns null for transforms in the wrong order', () => {
		const wrong: FormulaNode = {
			op: 'log10',
			args: [{ op: 'zscore', args: [{ op: 'add', args: [{ operand: 'a' }, { const: 1 }] }] }],
		};
		expect(treeToSteps(wrong)).toBeNull();
	});
});

describe('steps round trip', () => {
	const cases: { name: string; steps: Steps }[] = [
		{ name: 'Bang for Buck', steps: bangForBuck },
		{ name: 'start only', steps: { start: 'boxOffice', steps: [] } },
		{
			name: 'chain of plain steps',
			steps: {
				start: 'votes',
				steps: [
					{ op: 'add', with: { const: 5 } },
					{ op: 'sub', with: { operand: 'runtime' } },
					{ op: 'mul', with: { operand: 'myOverall' } },
				],
			},
		},
		{
			name: 'compress big gaps on a step',
			steps: { start: 'budget', steps: [{ op: 'div', with: { const: 4 }, compress: true }] },
		},
		{
			name: 'compare to the rest on the last step',
			steps: {
				start: 'tmdbScore',
				steps: [{ op: 'add', with: { operand: 'myAgreement' }, compareToRest: true }],
			},
		},
		{
			name: 'thousands scale with both transforms',
			steps: {
				start: 'boxOffice',
				steps: [{ op: 'div', with: { operand: 'budget' }, scale: 'thousands', compress: true, compareToRest: true }],
			},
		},
	];

	for (const { name, steps } of cases) {
		it(`${name}: treeToSteps(stepsToTree(steps)) equals steps`, () => {
			expect(treeToSteps(stepsToTree(steps))).toEqual(steps);
		});
	}

	it("treats scale 'none' the same as no scale", () => {
		const explicit: Steps = { start: 'votes', steps: [{ op: 'add', with: { const: 2 }, scale: 'none' }] };
		const implicit: Steps = { start: 'votes', steps: [{ op: 'add', with: { const: 2 } }] };
		expect(stepsToTree(explicit)).toEqual(stepsToTree(implicit));
	});
});

describe('STEP_LABELS', () => {
	it('gives the plain-language names used in the UI', () => {
		expect(STEP_LABELS).toEqual({
			compress: 'Compress big gaps',
			compareToRest: 'Compare to the rest',
			millions: 'in $ millions',
			thousands: 'in $ thousands',
		});
	});
});
