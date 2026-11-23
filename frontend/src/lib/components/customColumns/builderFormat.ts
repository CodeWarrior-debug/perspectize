/**
 * Display and copy helpers for the custom-column builder. Pure, so the builder and its preview
 * share one set of rules and each can be unit-tested without mounting a component.
 */
import type { Operand } from '#lib/customColumns';
import { formatMoneyExact } from '#lib/utils/formatting.js';

/** Shown in a cell with no value. Never 0: a missing input is not a zero (Decision 8). */
export const EMPTY_CELL = '—';

/**
 * The `payload.numberFormat` values. Stored as these short strings, so the grid can read the same
 * set; the order is the order of the select.
 */
export const NUMBER_FORMATS = [
	{ value: 'sig3', label: 'Number (3 significant figures)' },
	{ value: 'rating', label: '0-10 rating' },
	{ value: 'dollars', label: 'Dollars' },
	{ value: 'percent', label: 'Percent' },
] as const;

export type NumberFormat = (typeof NUMBER_FORMATS)[number]['value'];

export const DEFAULT_NUMBER_FORMAT: NumberFormat = 'sig3';

/** A stored format this build does not know falls back to the default instead of breaking the cell. */
export function normalizeNumberFormat(stored: string | undefined): NumberFormat {
	return NUMBER_FORMATS.some((f) => f.value === stored) ? (stored as NumberFormat) : DEFAULT_NUMBER_FORMAT;
}

/** The new column's value in the chosen format. `value` is the evaluator's number; null is blank. */
export function formatCustomValue(value: number | null, format: string): string {
	if (value === null) return EMPTY_CELL;
	switch (normalizeNumberFormat(format)) {
		case 'rating':
			return value.toFixed(1);
		case 'dollars': {
			const whole = Math.round(Math.abs(value)).toLocaleString('en-US');
			return value < 0 ? `-$${whole}` : `$${whole}`;
		}
		case 'percent':
			return `${(value * 100).toLocaleString('en-US', { maximumSignificantDigits: 3 })}%`;
		case 'sig3':
			return value.toLocaleString('en-US', { maximumSignificantDigits: 3 });
	}
}

/** An operand column's value as it reads in the grid's own units. */
export function formatOperandValue(operand: Operand, value: number | null): string {
	if (value === null) return EMPTY_CELL;
	switch (operand.unit) {
		case 'money':
			return formatMoneyExact(value);
		case 'rating':
			return value.toFixed(1);
		case 'minutes':
			return `${Math.round(value)} min`;
		case 'year':
			return String(Math.round(value));
		case 'number':
			return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
	}
}

/**
 * The message for a failed save. The server's text arrives inside graphql-request's ClientError
 * message, so a name clash is detected by its wording; anything else gets a generic line.
 */
export function saveErrorMessage(err: unknown): string {
	const message = err instanceof Error ? err.message : '';
	if (/already|in use|taken|duplicate/i.test(message)) {
		return 'You already have a custom column with this name. Choose another name.';
	}
	return 'Could not save this column. Check your connection and try again.';
}
