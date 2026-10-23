import { isMovieOnlyTypeFilter } from '$lib/utils/grid-config';

export const CHART_TYPES = [
	'histogram',
	'line',
	'pie',
	'box',
	'cumulative',
	'summary',
	'density',
	'strip',
	'topBottom',
	'coverage',
] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
	histogram: 'Histogram',
	line: 'Line',
	pie: 'Pie',
	box: 'Box plot',
	cumulative: 'Cumulative',
	summary: 'Summary',
	density: 'Density',
	strip: 'Strip plot',
	topBottom: 'Top and bottom 10',
	coverage: 'Coverage',
};

/** Numeric columns that can show a chart (colIds from grid-config.ts COLUMNS). */
export const CHART_ELIGIBLE_COLS: ReadonlySet<string> = new Set([
	'views',
	'likes',
	'percentLiked',
	'duration',
	'boxOffice',
	'vsBudget',
	'tmdbScore',
	'budget',
	'votes',
]);

/** Default chart per eligible column. Developers change individual entries here. */
export const DEFAULT_CHART_TYPE: Record<string, ChartType> = Object.fromEntries(
	[...CHART_ELIGIBLE_COLS].map((id) => [id, 'histogram' as ChartType]),
);

export function defaultChartType(colId: string): ChartType {
	return DEFAULT_CHART_TYPE[colId] ?? 'histogram';
}

export function isChartEligible(colId: string, typeFilter: string | undefined): boolean {
	return CHART_ELIGIBLE_COLS.has(colId) && isMovieOnlyTypeFilter(typeFilter);
}
