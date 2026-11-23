import { defaultColumnVisibility, togglableColIds, type ColumnView, type ResponsiveTier } from './grid-config';
import { isCustomColId } from './customColumnDefs';

export { columnViewFor, type ColumnView } from './grid-config';

/**
 * columnLayouts — per-view Activity table column setups.
 *
 * A "view" is the default column set a type filter maps to: `movie` when the
 * filter is exactly MOVIE, `book` when it is exactly BOOK, `claim` when it is exactly
 * CLAIM, `general` for everything else (YouTube, Bible passages, several types, no
 * filter). A view with a saved layout shows it; one without shows its defaults for the
 * current responsive tier. Layouts are kept in localStorage so they survive a refresh;
 * failures fall back to defaults. The view mapping itself lives in grid-config
 * (columnViewFor).
 */

/** colId -> visible. */
export type ColumnLayout = Record<string, boolean>;

export const COLUMN_LAYOUTS_KEY = 'perspectize:activityColumns:v1';

/** Toast wording for each view ("Showing Movie columns"). */
export const COLUMN_VIEW_LABEL: Record<ColumnView, string> = {
	movie: 'Movie columns',
	book: 'Book columns',
	webpage: 'Webpage columns',
	claim: 'Claim columns',
	general: 'standard columns',
};

function isLayout(value: unknown): value is ColumnLayout {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		Object.values(value).every((v) => typeof v === 'boolean')
	);
}

function readAll(): Partial<Record<ColumnView, ColumnLayout>> {
	try {
		const raw = localStorage.getItem(COLUMN_LAYOUTS_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
		return parsed as Partial<Record<ColumnView, ColumnLayout>>;
	} catch {
		return {};
	}
}

function writeAll(all: Partial<Record<ColumnView, ColumnLayout>>): void {
	try {
		if (Object.keys(all).length === 0) localStorage.removeItem(COLUMN_LAYOUTS_KEY);
		else localStorage.setItem(COLUMN_LAYOUTS_KEY, JSON.stringify(all));
	} catch {
		// localStorage unavailable (private browsing, quota) — the table still
		// works, the setup just isn't remembered.
	}
}

export function loadLayout(view: ColumnView): ColumnLayout | null {
	const layout = readAll()[view];
	return isLayout(layout) ? layout : null;
}

export function saveLayout(view: ColumnView, layout: ColumnLayout): void {
	writeAll({ ...readAll(), [view]: layout });
}

export function clearLayout(view: ColumnView): void {
	const all = readAll();
	delete all[view];
	writeAll(all);
}

/**
 * The view's default layout at a tier, covering every togglable column
 * (admin ones included) so applying it also hides picker-only columns such as
 * Date Added that a previous custom layout turned on.
 */
export function defaultLayout(
	tier: ResponsiveTier,
	view: ColumnView,
	soloType: string | null = null,
	customColIds: readonly string[] = [],
): ColumnLayout {
	const { visible } = defaultColumnVisibility(tier, view, soloType);
	const shown = new Set(visible);
	const layout: ColumnLayout = {};
	for (const colId of new Set([...togglableColIds(true), ...visible])) layout[colId] = shown.has(colId);
	// Custom columns are hidden by default, so a reset (or a switch into this view) hides them too.
	for (const colId of customColIds) layout[colId] = false;
	return layout;
}

/**
 * A saved layout without the custom columns that are not in the grid now (deleted, unavailable, or
 * not offered in this view). Dropped at apply time only: the stored layout is not rewritten, so a
 * formula that is merely still loading keeps its saved visibility.
 */
export function dropAbsentCustomColumns(layout: ColumnLayout, isPresent: (colId: string) => boolean): ColumnLayout {
	const out: ColumnLayout = {};
	for (const [colId, visible] of Object.entries(layout)) {
		if (isCustomColId(colId) && !isPresent(colId)) continue;
		out[colId] = visible;
	}
	return out;
}

/**
 * What to apply when the visibility effect runs, and whether to show the
 * "Showing … columns" toast: only on a change of view (never on first load,
 * a resize or a grid remount) that actually changes a column.
 */
export function planColumnSwitch(args: {
	prevView: ColumnView | null;
	view: ColumnView;
	current: ColumnLayout;
	saved: ColumnLayout | null;
	defaults: ColumnLayout;
}): { apply: ColumnLayout; toast: boolean } {
	const apply = args.saved ?? args.defaults;
	const switching = args.prevView !== null && args.prevView !== args.view;
	const changes = Object.entries(apply).some(([colId, visible]) => (args.current[colId] ?? false) !== visible);
	return { apply, toast: switching && changes };
}
