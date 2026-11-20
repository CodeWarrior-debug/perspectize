/**
 * View state for both pages, the column definitions and width tiers, and the readouts derived
 * from them: the URL a view would have, the request it would send and its TanStack query key.
 */
import { contentRows, readablePerspectives, type ContentRow, type Scope } from './aggregate.js';
import { VIEWER, contentById, type Perspective } from './fixture.js';
import {
  DEFAULT_POLICY,
  METRICS,
  aggregator,
  aggregatorsFor,
  metric,
  type AggregatorId,
  type MetricId,
  type Policy,
} from './registry.js';
import { headerMinWidth, metricColumnMin } from './widths.js';

export type Page = 'content' | 'perspectives';
export type Viewport = 'desktop' | 'mobile' | 'both';
export type DataState = 'live' | 'loading' | 'empty' | 'error';
export type DeskWidth = 1212 | 1000 | 880;
export type PageName = 'Gauge' | 'Weigh' | 'Insights' | 'Perspectives';

export interface SortSpec {
  col: string;
  dir: 'asc' | 'desc';
}

export interface RangeFilter {
  min: number | null;
  max: number | null;
}

export interface State {
  page: Page;
  viewport: Viewport;
  theme: string;
  deskWidth: DeskWidth;
  scope: Scope;
  pScope: 'mine' | 'public';
  aggs: Record<MetricId, AggregatorId>;
  cols: string[];
  pCols: string[];
  sorts: SortSpec[];
  pSorts: SortSpec[];
  filters: Partial<Record<MetricId, RangeFilter>>;
  pFilters: Partial<Record<MetricId, RangeFilter>>;
  /** Drill-down: the perspectives page limited to one content item. */
  contentFilter: number | null;
  /** The content row the viewer drilled from: kept highlighted on return. */
  selected: number | null;
  mode: 'all' | 'loaded';
  dataState: DataState;
  aggControl: 'header' | 'toolbar' | 'both';
  headerLayout: 'inline' | 'stacked';
  pageName: PageName;
  policy: Policy;
}

export const THEMES: { id: string; label: string; dark: boolean }[] = [
  { id: 'reading-room', label: 'Reading Room (default)', dark: false },
  { id: 'archive', label: 'Archive', dark: false },
  { id: 'garden', label: 'Garden', dark: false },
  { id: 'midnight', label: 'Midnight', dark: true },
  { id: 'fd-lamp-oil', label: 'Lamp Oil', dark: true },
];

const allAvg = () => Object.fromEntries(METRICS.map((m) => [m.id, 'avg'])) as Record<MetricId, AggregatorId>;

export const DEFAULT_COLS = ['type', 'quality', 'agreement', 'importance', 'confidence'];
export const DEFAULT_PCOLS = ['owner', 'claim', 'quality', 'agreement', 'importance', 'confidence', 'feelings', 'updated'];

export function initialState(): State {
  return {
    page: 'content',
    viewport: 'both',
    theme: 'reading-room',
    deskWidth: 1212,
    scope: 'public',
    pScope: 'mine',
    aggs: { ...allAvg(), agreement: 'stddev' },
    cols: [...DEFAULT_COLS],
    pCols: [...DEFAULT_PCOLS],
    sorts: [{ col: 'agreement', dir: 'desc' }],
    pSorts: [{ col: 'updated', dir: 'desc' }],
    filters: {},
    pFilters: {},
    contentFilter: null,
    selected: null,
    mode: 'all',
    dataState: 'live',
    aggControl: 'header',
    headerLayout: 'inline',
    pageName: 'Gauge',
    policy: { ...DEFAULT_POLICY },
  };
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export type ColKind = 'action' | 'item' | 'type' | 'metric' | 'raw' | 'count' | 'date' | 'owner' | 'claim' | 'feelings' | 'content';

export interface ColDef {
  id: string;
  label: string;
  kind: ColKind;
  sortable: boolean;
  filter: boolean;
  /** Cell-content floor (px); the header floor is computed. */
  minCell: number;
  /** Shown in the column picker (false = always on, e.g. Item). */
  picker: boolean;
  group: 'Standard dimensions' | 'Optional dimensions' | 'Feelings' | 'About the content' | 'About the perspective' | '';
  /** Header tooltip body. */
  tip: string;
}

const groupOf = (id: MetricId): ColDef['group'] => {
  const k = metric(id).kind;
  return k === 'STANDARD' ? 'Standard dimensions' : k === 'CUSTOM' ? 'Optional dimensions' : 'Feelings';
};

export const CONTENT_COLS: ColDef[] = [
  { id: 'perspectize', label: '', kind: 'action', sortable: false, filter: false, minCell: 50, picker: false, group: '', tip: '' },
  { id: 'item', label: 'Item', kind: 'item', sortable: true, filter: false, minCell: 175, picker: false, group: '', tip: 'The content item. Its title opens Library details; “n perspectives” opens them on the Perspectives tab.' },
  { id: 'type', label: 'Type', kind: 'type', sortable: true, filter: true, minCell: 150, picker: true, group: 'About the content', tip: 'Content type.' },
  ...METRICS.map((m): ColDef => ({ id: m.id, label: m.label, kind: 'metric', sortable: true, filter: true, minCell: 0, picker: true, group: groupOf(m.id), tip: m.gloss })),
  { id: 'perspectives', label: 'Perspectives', kind: 'count', sortable: true, filter: true, minCell: 0, picker: true, group: 'About the content', tip: 'Perspectives counted in this row’s aggregates (after the privacy rule and one vote per person).' },
  { id: 'lastRated', label: 'Last rated', kind: 'date', sortable: true, filter: true, minCell: 96, picker: true, group: 'About the content', tip: 'When the newest counted perspective was last updated.' },
];

export const PERSPECTIVE_COLS: ColDef[] = [
  { id: 'content', label: 'Content', kind: 'content', sortable: true, filter: false, minCell: 175, picker: false, group: '', tip: 'The content this perspective is about. The title opens its Library details.' },
  { id: 'owner', label: 'Owner', kind: 'owner', sortable: true, filter: true, minCell: 0, picker: true, group: 'About the perspective', tip: 'Who wrote the perspective. 🔒 marks a private perspective (only ever your own here).' },
  { id: 'claim', label: 'Claim', kind: 'claim', sortable: false, filter: true, minCell: 130, picker: true, group: 'About the perspective', tip: 'The short statement at the heart of the perspective.' },
  ...METRICS.map((m): ColDef => ({ id: m.id, label: m.label, kind: 'raw', sortable: true, filter: true, minCell: 0, picker: true, group: groupOf(m.id), tip: m.gloss })),
  { id: 'feelings', label: 'Feelings', kind: 'feelings', sortable: false, filter: true, minCell: 0, picker: true, group: 'About the perspective', tip: 'Feelings picked, with intensity on hover.' },
  { id: 'created', label: 'Created', kind: 'date', sortable: true, filter: true, minCell: 96, picker: true, group: 'About the perspective', tip: 'When the perspective was written.' },
  { id: 'updated', label: 'Updated', kind: 'date', sortable: true, filter: true, minCell: 96, picker: true, group: 'About the perspective', tip: 'When the perspective was last changed.' },
];

export function colDef(page: Page, id: string): ColDef {
  return (page === 'content' ? CONTENT_COLS : PERSPECTIVE_COLS).find((c) => c.id === id)!;
}

export interface WidthRow {
  id: string;
  label: string;
  header: number;
  chip: number;
  cell: number;
  min: number;
}

export function columnMin(s: State, page: Page, c: ColDef): WidthRow {
  if (c.kind === 'metric') {
    const chips = aggregatorsFor(metric(c.id as MetricId), s.policy).map((a) => a.chip);
    const w = metricColumnMin(c.label, chips, s.headerLayout);
    return { id: c.id, label: c.label, header: w.label + w.chrome, chip: w.chip, cell: w.cell, min: w.min };
  }
  const header = c.label ? headerMinWidth(c.label, { sortable: c.sortable, filter: c.filter }) : 0;
  void page;
  return { id: c.id, label: c.label || '◎', header, chip: 0, cell: c.minCell, min: Math.max(header, c.minCell) };
}

export type Tier = 'lg' | 'md';

export function tierOf(width: number): Tier {
  return width >= 900 ? 'lg' : 'md';
}

/** Visible columns at a width: the user's set at lg; md keeps Item plus the first two rating columns. */
export function visibleCols(s: State, page: Page): ColDef[] {
  const defs = page === 'content' ? CONTENT_COLS : PERSPECTIVE_COLS;
  const chosen = page === 'content' ? s.cols : s.pCols;
  const fixed = defs.filter((d) => !d.picker);
  let picked = defs.filter((d) => d.picker && chosen.includes(d.id));
  if (tierOf(s.deskWidth) === 'md') picked = picked.filter((d) => d.kind === 'metric' || d.kind === 'raw').slice(0, 2);
  return [...fixed, ...picked];
}

// ---------------------------------------------------------------------------
// Rows (sort + filter on the masked value)
// ---------------------------------------------------------------------------

function cmp(a: number | string | null, b: number | string | null, dir: 'asc' | 'desc'): number {
  // Empty and hidden values sort last in both directions, so the order never hints at a hidden value.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const r = a < b ? -1 : a > b ? 1 : 0;
  return dir === 'asc' ? r : -r;
}

export function contentSortValue(row: ContentRow, col: string): number | string | null {
  if (col === 'item') return row.content.title.toLowerCase();
  if (col === 'type') return row.content.type;
  if (col === 'perspectives') return row.counted;
  if (col === 'lastRated') return row.lastRated;
  return row.cells[col as MetricId]?.sortValue ?? null;
}

const inRange = (v: number | null, f: RangeFilter) => v !== null && (f.min === null || v >= f.min) && (f.max === null || v <= f.max);

export function visibleContentRows(s: State): ContentRow[] {
  if (s.dataState === 'empty') return [];
  const rows = contentRows(s.scope, s.policy, s.aggs).filter((r) =>
    Object.entries(s.filters).every(([id, f]) => !f || inRange(r.cells[id as MetricId].sortValue, f))
  );
  const sorted = rows.filter((r) => s.scope !== 'mine' || r.counted > 0);
  return [...sorted].sort((a, b) => {
    for (const sp of s.sorts) {
      const r = cmp(contentSortValue(a, sp.col), contentSortValue(b, sp.col), sp.dir);
      if (r) return r;
    }
    return a.content.id - b.content.id;
  });
}

export function perspectiveSortValue(p: Perspective, col: string): number | string | null {
  if (col === 'content') return contentById(p.contentId).title.toLowerCase();
  if (col === 'owner') return p.owner;
  if (col === 'created') return p.createdAt;
  if (col === 'updated') return p.updatedAt;
  const m = METRICS.find((x) => x.id === col);
  const v = m ? m.read(p) : null;
  return v === null ? null : v / 1000;
}

export function visiblePerspectives(s: State): Perspective[] {
  if (s.dataState === 'empty') return [];
  return readablePerspectives(s.pScope)
    .filter((p) => s.contentFilter === null || p.contentId === s.contentFilter)
    .filter((p) =>
      Object.entries(s.pFilters).every(([id, f]) => !f || inRange(perspectiveSortValue(p, id) as number | null, f))
    )
    .sort((a, b) => {
      for (const sp of s.pSorts) {
        const r = cmp(perspectiveSortValue(a, sp.col), perspectiveSortValue(b, sp.col), sp.dir);
        if (r) return r;
      }
      return a.id - b.id;
    });
}

// ---------------------------------------------------------------------------
// Readouts: URL, request, query key
// ---------------------------------------------------------------------------

export function pagePath(s: State): string {
  return `/${s.pageName.toLowerCase()}${s.page === 'perspectives' ? '/perspectives' : ''}`;
}

const range = (f: RangeFilter) => `${f.min ?? ''}..${f.max ?? ''}`;

export function urlFor(s: State): string {
  const p = new URLSearchParams();
  if (s.page === 'content') {
    if (s.scope !== 'public') p.set('scope', s.scope);
    if (s.mode !== 'all') p.set('mode', s.mode);
    for (const m of METRICS) if (s.aggs[m.id] !== 'avg') p.set(`a.${m.id}`, s.aggs[m.id]);
    if (s.sorts.length) p.set('sort', s.sorts.map((x) => `${x.col}.${x.dir}`).join(','));
    for (const [id, f] of Object.entries(s.filters)) if (f) p.set(`f.${id}`, range(f));
  } else {
    if (s.pScope !== 'mine') p.set('scope', s.pScope);
    if (s.contentFilter !== null) p.set('content', String(s.contentFilter));
    if (s.pSorts.length) p.set('sort', s.pSorts.map((x) => `${x.col}.${x.dir}`).join(','));
    for (const [id, f] of Object.entries(s.pFilters)) if (f) p.set(`f.${id}`, range(f));
  }
  const q = p.toString().replace(/%2C/g, ',');
  return `${pagePath(s)}${q ? `?${q}` : ''}`;
}

const metricRef = (id: MetricId) => ({ kind: metric(id).kind, key: metric(id).key });
const stored = (v: number | null) => (v === null ? null : Math.round(v * 1000));

/** Metric columns the request must include: visible ones plus any that carry a sort or filter. */
function requestedMetrics(s: State): MetricId[] {
  const shown = visibleCols(s, 'content').filter((c) => c.kind === 'metric').map((c) => c.id as MetricId);
  const extra = [...s.sorts.map((x) => x.col), ...Object.keys(s.filters)].filter((id) => METRICS.some((m) => m.id === id)) as MetricId[];
  return [...new Set([...shown, ...extra])];
}

export function requestFor(s: State): { query: string; variables: unknown; queryKey: unknown } {
  if (s.page === 'content') {
    const metrics = requestedMetrics(s).map((id) => ({ metric: metricRef(id), aggregator: aggregator(s.aggs[id]).gql }));
    const metricFilters = Object.entries(s.filters)
      .filter(([, f]) => f)
      .map(([id, f]) => ({ metric: metricRef(id as MetricId), aggregator: aggregator(s.aggs[id as MetricId]).gql, min: stored(f!.min), max: stored(f!.max) }));
    const sortBy = s.sorts.map((x) =>
      METRICS.some((m) => m.id === x.col)
        ? { metric: metricRef(x.col as MetricId), aggregator: aggregator(s.aggs[x.col as MetricId]).gql, order: x.dir.toUpperCase() }
        : { field: x.col.toUpperCase(), order: x.dir.toUpperCase() }
    );
    const scope = { public: 'PUBLIC', mine: 'MINE' }[s.scope];
    // gatherAll widens what each cell returns (every aggregator, for the tooltip); sort and filter keep the column's one.
    const variables = { scope, gatherAll: s.policy.gatherAll, metrics, metricFilters, sortBy: s.mode === 'all' ? sortBy : [], first: 25, after: null };
    return {
      query: 'contentMetrics(scope, gatherAll, filter, metrics, metricFilters, sortBy, first, after)',
      variables,
      // ADR 0002 threat 5: the key carries the viewer, so a revoke or sign-out never serves stale numbers.
      queryKey: ['content', 'metrics', { viewer: VIEWER, ...variables }],
    };
  }
  const ratingRanges = Object.entries(s.pFilters)
    .filter(([, f]) => f)
    .map(([id, f]) => ({ metric: metricRef(id as MetricId), min: stored(f!.min), max: stored(f!.max) }));
  const sortBy = s.pSorts.map((x) =>
    METRICS.some((m) => m.id === x.col) ? { metric: metricRef(x.col as MetricId), order: x.dir.toUpperCase() } : { field: x.col.toUpperCase(), order: x.dir.toUpperCase() }
  );
  const variables = { filter: { scope: s.pScope.toUpperCase(), contentId: s.contentFilter, ratingRanges }, sortBy, first: 25, after: null };
  return { query: 'perspectives(filter, sortBy, first, after)', variables, queryKey: ['perspectives', 'list', { viewer: VIEWER, ...variables }] };
}
