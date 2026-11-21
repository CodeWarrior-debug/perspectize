import { describe, it, expect } from 'vitest';
import type { ValueGetterParams } from '@ag-grid-community/core';
import {
	buildCustomColDefs,
	customColId,
	customColumnValues,
	customHeaderTooltip,
	customOwnerLabel,
	customPickerRows,
	formatCustomValue,
	formulaIdFromColId,
	formulaOperandLabels,
	hasZscore,
	isCustomColId,
	toOperandRow,
	type ShapedRow,
} from '#lib/utils/customColumnDefs.js';
import { unknownLastComparator } from '#lib/utils/grid-config.js';
import { EMPTY_VALUE } from '#lib/utils/formatting.js';
import type { SavedFormula } from '#lib/queries/savedFormulas/index.js';
import type { FormulaNode } from '#lib/customColumns/index.js';
import type { ContentItem } from '#lib/queries/content/index.js';

const myOverall: FormulaNode = { operand: 'myOverall' };
const myImportance: FormulaNode = { operand: 'myImportance' };

function formula(overrides: Partial<SavedFormula> = {}, expression: FormulaNode = myOverall): SavedFormula {
	return {
		id: '7',
		type: 'FORMULA',
		name: 'Blend',
		privacy: 'PRIVATE',
		origin: 'OWN',
		sourceId: null,
		sourceAvailable: true,
		payloadVersion: 1,
		user: { id: 'u1', username: 'alice' },
		createdAt: '2026-11-01T12:00:00Z',
		updatedAt: '2026-11-01T12:00:00Z',
		payload: { expression, subtitle: 'Score blend' },
		...overrides,
	};
}

/** A movie-shaped row keyed by id, with the viewer's quality rating in storage units (0-10000). */
function row(id: number, quality: number | null): ShapedRow {
	return {
		id,
		contentType: 'MOVIE',
		myRatings: { quality, importance: null, agreement: null },
	} as unknown as ShapedRow;
}

/** Fake AG Grid valueGetter params: the grid context carries the custom values map. */
function getterParams(data: { id: number }, context: unknown): ValueGetterParams<ContentItem> {
	return { data, context } as unknown as ValueGetterParams<ContentItem>;
}

const LOADED = { mode: 'loaded' as const, viewerId: 'u1', rowCount: 3 };

describe('custom column ids', () => {
	it('prefixes the saved item id and reads it back', () => {
		expect(customColId('42')).toBe('custom:42');
		expect(isCustomColId('custom:42')).toBe(true);
		expect(formulaIdFromColId('custom:42')).toBe('42');
	});

	it('never matches built-in colIds', () => {
		expect(isCustomColId('views')).toBe(false);
		expect(isCustomColId('customish')).toBe(false);
		expect(isCustomColId(undefined)).toBe(false);
		expect(isCustomColId(null)).toBe(false);
	});
});

describe('toOperandRow', () => {
	it('attaches the viewer ratings and keeps the row fields', () => {
		const item = { id: 3, name: 'Film', contentType: 'MOVIE' } as unknown as ContentItem;
		const shaped = toOperandRow(item, { quality: 7250, importance: null });
		expect(shaped.id).toBe(3);
		expect((shaped as unknown as { name: string }).name).toBe('Film');
		expect(shaped.myRatings).toEqual({ quality: 7250, importance: null, agreement: null });
	});

	it('gives null ratings for an unrated row', () => {
		const item = { id: 4 } as unknown as ContentItem;
		expect(toOperandRow(item, undefined).myRatings).toEqual({ quality: null, importance: null, agreement: null });
	});
});

describe('formatCustomValue', () => {
	it('shows three significant figures by default', () => {
		expect(formatCustomValue(1.23456)).toBe('1.23');
		expect(formatCustomValue(173.4)).toBe('173');
		expect(formatCustomValue(0.0123456, undefined)).toBe('0.0123');
	});

	it('treats an unknown format key as the default', () => {
		expect(formatCustomValue(1.23456, 'nonsense')).toBe('1.23');
	});

	it('shows a missing value as the em dash, never 0', () => {
		expect(formatCustomValue(null)).toBe(EMPTY_VALUE);
		expect(formatCustomValue(undefined, 'percent')).toBe(EMPTY_VALUE);
		expect(formatCustomValue(Number.NaN)).toBe(EMPTY_VALUE);
	});

	it('formats a 0-10 rating to one decimal place', () => {
		expect(formatCustomValue(7, 'rating')).toBe('7.0');
		expect(formatCustomValue(7.25, 'rating')).toBe('7.3');
	});

	it('formats dollars in whole US dollars', () => {
		expect(formatCustomValue(1234567.4, 'dollars')).toBe('$1,234,567');
	});

	it('formats a fraction as a percentage', () => {
		expect(formatCustomValue(0.25, 'percent')).toBe('25%');
	});
});

describe('customColumnValues', () => {
	it('gives each row its value, keyed by colId then row id', () => {
		const values = customColumnValues([formula()], [row(1, 7000), row(2, 4000)], 'loaded');
		expect(values.get('custom:7')?.get('1')).toBe(7);
		expect(values.get('custom:7')?.get('2')).toBe(4);
	});

	it('gives no value for a row whose operand is missing, not zero', () => {
		const values = customColumnValues([formula()], [row(1, null)], 'loaded');
		expect(values.get('custom:7')?.get('1')).toBeNull();
	});

	it('skips a formula with no payload (an unavailable link)', () => {
		const values = customColumnValues([formula({ payload: null })], [row(1, 7000)], 'loaded');
		expect(values.has('custom:7')).toBe(false);
	});

	it('z-scores each row against the loaded rows that have a value', () => {
		// Ratings 2, 4, 6, 8, 10 (display): mean 6, population sd sqrt(8).
		const rows = [2, 4, 6, 8, 10].map((q, i) => row(i + 1, q * 1000));
		const values = customColumnValues([formula({}, { op: 'zscore', args: [myOverall] })], rows, 'loaded');
		const sd = Math.sqrt(8);
		expect(values.get('custom:7')?.get('3')).toBeCloseTo(0, 10);
		expect(values.get('custom:7')?.get('1')).toBeCloseTo(-4 / sd, 10);
		expect(values.get('custom:7')?.get('5')).toBeCloseTo(4 / sd, 10);
	});

	it('gives no z-score with fewer than five rows that have a value', () => {
		const rows = [row(1, 1000), row(2, 2000), row(3, 3000), row(4, 4000), row(5, null)];
		const values = customColumnValues([formula({}, { op: 'zscore', args: [myOverall] })], rows, 'loaded');
		expect(values.get('custom:7')?.get('1')).toBeNull();
	});

	it('gives 0 for a z-score when every loaded value is the same', () => {
		const rows = [1, 2, 3, 4, 5].map((i) => row(i, 5000));
		const values = customColumnValues([formula({}, { op: 'zscore', args: [myOverall] })], rows, 'loaded');
		expect(values.get('custom:7')?.get('2')).toBe(0);
	});

	it('gives no z-score in All Items mode, where only the page is loaded', () => {
		const rows = [2, 4, 6, 8, 10].map((q, i) => row(i + 1, q * 1000));
		const values = customColumnValues([formula({}, { op: 'zscore', args: [myOverall] })], rows, 'all');
		expect(values.get('custom:7')?.get('3')).toBeNull();
	});

	it('still computes a plain formula in All Items mode', () => {
		const values = customColumnValues([formula()], [row(1, 7000)], 'all');
		expect(values.get('custom:7')?.get('1')).toBe(7);
	});
});

describe('hasZscore', () => {
	it('finds a z-score at any depth', () => {
		expect(hasZscore(myOverall)).toBe(false);
		expect(hasZscore({ op: 'add', args: [myOverall, { op: 'zscore', args: [myImportance] }] })).toBe(true);
	});
});

describe('buildCustomColDefs', () => {
	it('builds one hidden colDef per available formula, with the ƒ mark and the name', () => {
		const { colDefs, unavailable } = buildCustomColDefs([formula()], LOADED);
		expect(unavailable).toEqual([]);
		expect(colDefs).toHaveLength(1);
		const def = colDefs[0];
		expect(def.colId).toBe('custom:7');
		expect(def.headerName).toBe('ƒ Blend');
		expect(def.hide).toBe(true);
		expect(def.headerTooltip).toContain('Blend');
	});

	it('makes loaded-mode columns sortable and filterable like built-ins, with nulls last', () => {
		const [def] = buildCustomColDefs([formula()], LOADED).colDefs;
		expect(def.sortable).toBe(true);
		expect(def.filter).toBe('agNumberColumnFilter');
		expect(def.comparator).toBe(unknownLastComparator);
	});

	it('turns sorting and filtering off in All Items mode', () => {
		const [def] = buildCustomColDefs([formula()], { ...LOADED, mode: 'all' }).colDefs;
		expect(def.sortable).toBe(false);
		expect(def.filter).toBe(false);
	});

	it('reads the value from the grid context, and gives a missing value as null', () => {
		const [def] = buildCustomColDefs([formula()], LOADED).colDefs;
		const context = { customValues: new Map([['custom:7', new Map([['1', 7]])]]) };
		const getter = def.valueGetter as (p: ValueGetterParams<ContentItem>) => unknown;
		expect(getter(getterParams({ id: 1 }, context))).toBe(7);
		expect(getter(getterParams({ id: 9 }, context))).toBeNull();
		expect(getter(getterParams({ id: 1 }, undefined))).toBeNull();
	});

	it('formats the cell by the formula number format, with the em dash for null', () => {
		const [def] = buildCustomColDefs(
			[formula({ payload: { expression: myOverall, numberFormat: 'rating' } })],
			LOADED,
		).colDefs;
		const format = def.valueFormatter as (p: { value: unknown }) => string;
		expect(format({ value: 7 })).toBe('7.0');
		expect(format({ value: null })).toBe(EMPTY_VALUE);
	});

	it('gives no column for a link whose source is gone, and reports it', () => {
		const gone = formula({ id: '8', origin: 'LINK', payload: null, name: 'Gone' });
		const { colDefs, unavailable } = buildCustomColDefs([formula(), gone], LOADED);
		expect(colDefs.map((d) => d.colId)).toEqual(['custom:7']);
		expect(unavailable.map((f) => f.id)).toEqual(['8']);
	});

	it('sorts nulls last in both directions with the grid applying the direction', () => {
		// AG Grid sorts descending by negating the comparator, so simulate that here.
		const values: (number | null)[] = [3, null, 1, 2];
		const asc = [...values].sort((a, b) => unknownLastComparator(a, b, undefined, undefined, false));
		const desc = [...values].sort((a, b) => -unknownLastComparator(a, b, undefined, undefined, true));
		expect(asc).toEqual([1, 2, 3, null]);
		expect(desc).toEqual([3, 2, 1, null]);
	});
});

describe('customHeaderTooltip', () => {
	it('gives the name, subtitle, formula, owner, privacy and the user calculation', () => {
		const tip = customHeaderTooltip(formula(), LOADED);
		const lines = tip.split('\n');
		expect(lines[0]).toBe('Blend');
		expect(lines).toContain('Score blend');
		expect(lines).toContain('Your calculation from My overall');
		expect(lines).toContain('Yours');
		expect(lines).toContain('Private');
	});

	it("never presents the calculation as TMDB's own figure", () => {
		const tip = customHeaderTooltip(formula({}, { operand: 'tmdbScore' }), LOADED);
		expect(tip).toContain('Your calculation from TMDB score');
		expect(tip).not.toMatch(/^TMDB/m);
	});

	it('says how many loaded rows a z-score is compared against', () => {
		const tip = customHeaderTooltip(formula({}, { op: 'zscore', args: [myOverall] }), { ...LOADED, rowCount: 12 });
		expect(tip).toContain('vs these 12 loaded rows');
	});

	it('explains a z-score has no value in All Items, and that sort and filter need Loaded mode', () => {
		const tip = customHeaderTooltip(formula({}, { op: 'zscore', args: [myOverall] }), { ...LOADED, mode: 'all' });
		expect(tip).toContain('no value in All Items');
		expect(tip).toContain('Sorting and filtering by custom columns works in Loaded mode');
	});
});

describe('customOwnerLabel', () => {
	it('is Yours for the viewer own item', () => {
		expect(customOwnerLabel(formula(), 'u1')).toBe('Yours');
	});

	it('is by @user for someone else own item', () => {
		expect(customOwnerLabel(formula({ user: { id: 'u2', username: 'bob' } }), 'u1')).toBe('by @bob');
	});

	it('is linked from @user for a link', () => {
		expect(customOwnerLabel(formula({ origin: 'LINK', user: { id: 'u2', username: 'bob' } }), 'u1')).toBe(
			'linked from @bob',
		);
	});

	it('is by @user when signed out', () => {
		expect(customOwnerLabel(formula(), null)).toBe('by @alice');
	});
});

describe('formulaOperandLabels', () => {
	it('lists each operand label once, in first-use order, skipping unknown keys', () => {
		const tree: FormulaNode = {
			op: 'div',
			args: [{ operand: 'myImportance' }, { op: 'add', args: [{ operand: 'myOverall' }, { operand: 'myImportance' }] }],
		};
		expect(formulaOperandLabels(tree)).toEqual(['My importance', 'My overall']);
		expect(formulaOperandLabels({ operand: 'notAnOperand' })).toEqual([]);
	});
});

describe('customPickerRows', () => {
	it('shapes available and unavailable formulas, with own set only for the viewer own items', () => {
		const mine = formula();
		const linked = formula({ id: '9', origin: 'LINK', user: { id: 'u2', username: 'bob' }, name: 'Linked' });
		const gone = formula({ id: '10', origin: 'LINK', payload: null, name: 'Gone' });
		const { available, unavailable } = customPickerRows([mine, linked], [gone], 'u1');
		expect(available.map((r) => [r.colId, r.ownerLabel, r.own])).toEqual([
			['custom:7', 'Yours', true],
			['custom:9', 'linked from @bob', false],
		]);
		expect(unavailable.map((r) => r.colId)).toEqual(['custom:10']);
	});
});
