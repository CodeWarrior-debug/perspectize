/**
 * columnChartSettings — which numeric columns have their distribution chart
 * turned on. Kept under its own localStorage key, separate from the column
 * layout visibility map (`COLUMN_LAYOUTS_KEY`), whose parser would reject a
 * second shape. Unknown, malformed or wrong-version data reads as all-off and
 * is never rewritten on read; storage failures fall back silently.
 */

export const CHART_SETTINGS_KEY = 'perspectize.columnCharts';

const VERSION = 1;

function isFlagMap(value: unknown): value is Record<string, boolean> {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		Object.values(value).every((v) => typeof v === 'boolean')
	);
}

/** colId -> chart on. `{}` when missing, malformed, wrong version or storage is unavailable. */
export function loadChartFlags(): Record<string, boolean> {
	try {
		const raw = localStorage.getItem(CHART_SETTINGS_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null) return {};
		const { version, flags } = parsed as { version?: unknown; flags?: unknown };
		if (version !== VERSION || !isFlagMap(flags)) return {};
		return flags;
	} catch {
		return {};
	}
}

export function setChartFlag(colId: string, on: boolean): void {
	try {
		const flags = { ...loadChartFlags(), [colId]: on };
		localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify({ version: VERSION, flags }));
	} catch {
		// localStorage unavailable (private browsing, quota) — the chart still
		// works, the choice just isn't remembered.
	}
}

export function isChartOn(colId: string): boolean {
	return loadChartFlags()[colId] === true;
}
