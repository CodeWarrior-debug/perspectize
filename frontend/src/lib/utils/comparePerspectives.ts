/**
 * Pure comparison logic for the Compare Perspectives page. Given two
 * PerspectiveItems on the same content, computes per-dimension rating
 * comparisons, "filled in differently" rows, feelings overlap, and overall
 * (thumbs) agreement. No I/O, no Svelte — unit tested directly.
 */
import type { PerspectiveItem, FeelingEntry } from '$lib/queries/perspectives';
import { ratingToDisplay } from '$lib/utils/ratings';

export type RatingStatus = 'similar' | 'diverges' | 'conflict';

export interface RatingRow {
	key: string;
	label: string;
	leftDisplay: number;
	rightDisplay: number;
	delta: number;
	pctDiff: number;
	status: RatingStatus;
}

export interface FilledInDifferentlyRow {
	key: string;
	label: string;
	side: 'left' | 'right';
	display: number;
}

export interface FeelingRef {
	emoji: string;
	label: string | null;
}

export interface FeelingComparison {
	shared: FeelingRef[];
	leftOnly: FeelingRef[];
	rightOnly: FeelingRef[];
}

export interface OverallComparison {
	left: string | null;
	right: string | null;
	agree: boolean;
}

export interface ComparisonSummary {
	similar: number;
	diverges: number;
	conflict: number;
}

/** Handoff-specified thresholds, in display units (0.0-10.0 scale). */
export const SIMILAR_THRESHOLD = 1.0;
export const DIVERGES_THRESHOLD = 3.0;

/**
 * The four standard rating dimensions and their labels. This is the single
 * source of truth `getFieldLabel` (below) reads from, and that
 * AddFieldSearch.svelte and PerspectivePopover.svelte also import from, so a
 * renamed/relabeled dimension can't drift between the three files (see the UI
 * gap audit, gap #17).
 */
export const STANDARD_DIMENSIONS: { key: 'quality' | 'agreement' | 'importance' | 'confidence'; label: string }[] = [
	{ key: 'quality', label: 'Quality' },
	{ key: 'agreement', label: 'Agreement' },
	{ key: 'importance', label: 'Importance' },
	{ key: 'confidence', label: 'Confidence' },
];

function statusFor(delta: number): RatingStatus {
	if (delta <= SIMILAR_THRESHOLD) return 'similar';
	if (delta <= DIVERGES_THRESHOLD) return 'diverges';
	return 'conflict';
}

function toDisplay(value: number): number {
	return Number(ratingToDisplay(value));
}

/** Numeric-only entries of customFields, coercing string numbers, skipping the rest. */
function numericCustomFields(customFields: Record<string, unknown> | null): Map<string, number> {
	const result = new Map<string, number>();
	if (!customFields) return result;
	for (const [key, value] of Object.entries(customFields)) {
		const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
		if (!Number.isNaN(num)) result.set(key, num);
	}
	return result;
}

/**
 * Human-readable label for a rating dimension key. Standard dimensions use
 * their fixed label; custom field keys (which AddFieldSearch prefixes with
 * "custom:" and lowercases) have the prefix stripped, hyphens converted to
 * spaces, and every word title-cased — e.g. "story-pacing" -> "Story Pacing".
 * Shared with PerspectivePopover.svelte's field labels so the same key reads
 * identically everywhere in the app.
 */
export function getFieldLabel(key: string): string {
	const standard = STANDARD_DIMENSIONS.find((d) => d.key === key);
	if (standard) return standard.label;
	return key
		.replace(/^custom:/, '')
		.replace(/-/g, ' ')
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function compareRatings(left: PerspectiveItem, right: PerspectiveItem): RatingRow[] {
	const rows: RatingRow[] = [];

	for (const { key, label } of STANDARD_DIMENSIONS) {
		const leftValue = left[key];
		const rightValue = right[key];
		if (leftValue === null || rightValue === null) continue;
		const leftDisplay = toDisplay(leftValue);
		const rightDisplay = toDisplay(rightValue);
		const delta = Math.abs(leftDisplay - rightDisplay);
		rows.push({
			key,
			label,
			leftDisplay,
			rightDisplay,
			delta,
			pctDiff: (delta / 10) * 100,
			status: statusFor(delta),
		});
	}

	const leftCustom = numericCustomFields(left.customFields);
	const rightCustom = numericCustomFields(right.customFields);
	for (const [key, leftRaw] of leftCustom) {
		if (!rightCustom.has(key)) continue;
		const rightRaw = rightCustom.get(key)!;
		const leftDisplay = toDisplay(leftRaw);
		const rightDisplay = toDisplay(rightRaw);
		const delta = Math.abs(leftDisplay - rightDisplay);
		rows.push({
			key,
			label: getFieldLabel(key),
			leftDisplay,
			rightDisplay,
			delta,
			pctDiff: (delta / 10) * 100,
			status: statusFor(delta),
		});
	}

	return rows;
}

export function filledInDifferently(left: PerspectiveItem, right: PerspectiveItem): FilledInDifferentlyRow[] {
	const rows: FilledInDifferentlyRow[] = [];
	for (const { key, label } of STANDARD_DIMENSIONS) {
		const leftValue = left[key];
		const rightValue = right[key];
		if (leftValue !== null && rightValue === null) {
			rows.push({ key, label, side: 'left', display: toDisplay(leftValue) });
		} else if (leftValue === null && rightValue !== null) {
			rows.push({ key, label, side: 'right', display: toDisplay(rightValue) });
		}
	}

	// Same numeric-only custom field handling as compareRatings — a custom
	// field only one side filled in was previously dropped entirely here,
	// even though the matching "both filled it in" case already surfaces in
	// compareRatings (compare-page-enhancements #3).
	const leftCustom = numericCustomFields(left.customFields);
	const rightCustom = numericCustomFields(right.customFields);
	for (const [key, leftRaw] of leftCustom) {
		if (!rightCustom.has(key)) rows.push({ key, label: getFieldLabel(key), side: 'left', display: toDisplay(leftRaw) });
	}
	for (const [key, rightRaw] of rightCustom) {
		if (!leftCustom.has(key)) {
			rows.push({ key, label: getFieldLabel(key), side: 'right', display: toDisplay(rightRaw) });
		}
	}

	return rows;
}

function feelingKey(f: FeelingEntry): string {
	return f.label ?? f.emoji;
}

export function compareFeelings(left: PerspectiveItem, right: PerspectiveItem): FeelingComparison {
	const leftFeelings = left.feelings ?? [];
	const rightFeelings = right.feelings ?? [];
	const rightByKey = new Map(rightFeelings.map((f) => [feelingKey(f), f]));
	const matchedRightKeys = new Set<string>();

	const shared: FeelingRef[] = [];
	const leftOnly: FeelingRef[] = [];
	for (const f of leftFeelings) {
		const key = feelingKey(f);
		if (rightByKey.has(key)) {
			shared.push({ emoji: f.emoji, label: f.label });
			matchedRightKeys.add(key);
		} else {
			leftOnly.push({ emoji: f.emoji, label: f.label });
		}
	}
	const rightOnly = rightFeelings
		.filter((f) => !matchedRightKeys.has(feelingKey(f)))
		.map((f) => ({ emoji: f.emoji, label: f.label }));

	return { shared, leftOnly, rightOnly };
}

export function compareOverall(left: PerspectiveItem, right: PerspectiveItem): OverallComparison {
	const agree = left.like !== null && right.like !== null && left.like === right.like;
	return { left: left.like, right: right.like, agree };
}

export function summarize(rows: RatingRow[]): ComparisonSummary {
	const summary: ComparisonSummary = { similar: 0, diverges: 0, conflict: 0 };
	for (const row of rows) summary[row.status]++;
	return summary;
}

export function sortRatingRows(rows: RatingRow[], desc: boolean): RatingRow[] {
	return [...rows].sort((a, b) => (desc ? b.delta - a.delta : a.delta - b.delta));
}
