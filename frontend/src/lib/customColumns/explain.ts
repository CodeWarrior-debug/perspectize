/** Plain-language copy for the guided transforms, and the before/after preview of "Compress big gaps". */

/** One-line explanation of the "Compress big gaps" step. */
export function explainCompress(): string {
	return 'Each step up means 10x bigger, so one tiny value stops swamping everything';
}

export type CompressPreview = {
	smallest: { before: number; after: number | null };
	largest: { before: number; after: number | null };
};

/**
 * Before and after log10 for the smallest and largest present values (null and undefined are
 * missing, not zero). `after` is null when log10 has no value there (zero or negative input).
 * Null when no value is present.
 */
export function compressPreview(values: readonly (number | null | undefined)[]): CompressPreview | null {
	const present = values.filter((v): v is number => v != null && Number.isFinite(v));
	if (present.length === 0) return null;
	const smallest = Math.min(...present);
	const largest = Math.max(...present);
	const after = (v: number) => (v > 0 ? Math.log10(v) : null);
	return {
		smallest: { before: smallest, after: after(smallest) },
		largest: { before: largest, after: after(largest) },
	};
}

/** Explains the "Compare to the rest" step against the number of loaded rows. */
export function explainCompareToRest(loadedRowCount: number): string {
	return `How far above or below the typical value, measured against these ${loadedRowCount} loaded rows: 0 is typical, +1 clearly above, -2 far below`;
}
