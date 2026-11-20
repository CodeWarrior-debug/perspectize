/**
 * Everything around the device frames: the view controls, scenario shortcuts, the URL / request
 * readouts, the width budget, the design decisions (each with its live switch where one is
 * practical) and the backend contract the UI relies on.
 */
import type { Ctx } from './ctx.js';
import { el } from './dom.js';
import { AGGREGATORS, METRICS, aggregator, minNFor, spreadMinN, type Policy } from './registry.js';
import { layoutWidths } from './grid.js';
import {
  DEFAULT_COLS,
  DEFAULT_PCOLS,
  THEMES,
  columnMin,
  initialState,
  requestFor,
  tierOf,
  urlFor,
  type DataState,
  type DeskWidth,
  type Page,
  type PageName,
  type State,
  type Viewport,
} from './state.js';
import { CHIP_BOX, CHROME, HEADER_TEXT } from './widths.js';

function select<T extends string | number>(label: string, value: T, options: { value: T; label: string }[], onPick: (v: T) => void): HTMLElement {
  const s = el(
    'select',
    { 'aria-label': label },
    options.map((o) => el('option', { value: String(o.value), selected: o.value === value }, [o.label]))
  );
  s.addEventListener('change', () => onPick(options.find((o) => String(o.value) === s.value)!.value));
  return el('label', { class: 'ctl-field' }, [el('span', {}, [label]), s]);
}

function toggle<T extends string>(value: T, options: { value: T; label: string }[], onPick: (v: T) => void): HTMLElement {
  return el(
    'div',
    { class: 'tool-seg' },
    options.map((o) => {
      const b = el('button', { type: 'button', class: o.value === value ? 'on' : '' }, [o.label]);
      b.addEventListener('click', () => onPick(o.value));
      return b;
    })
  );
}

export function controls(ctx: Ctx): HTMLElement {
  const { s } = ctx;
  const reset = el('button', { type: 'button' }, ['Reset']);
  reset.addEventListener('click', () => ctx.set((x) => Object.assign(x, initialState())));
  return el('div', { class: 'controls' }, [
    toggle<Page>(s.page, [
      { value: 'content', label: 'By content' },
      { value: 'perspectives', label: 'Perspectives' },
    ], (v) => ctx.set((x) => void (x.page = v))),
    toggle<Viewport>(s.viewport, [
      { value: 'both', label: 'Desktop + mobile' },
      { value: 'desktop', label: 'Desktop' },
      { value: 'mobile', label: 'Mobile' },
    ], (v) => ctx.set((x) => void (x.viewport = v))),
    select<DeskWidth>('Grid width', s.deskWidth, [
      { value: 1212, label: '1212px (lg, full budget)' },
      { value: 1000, label: '1000px (lg)' },
      { value: 880, label: '880px (md)' },
    ], (v) => ctx.set((x) => void (x.deskWidth = v))),
    select('Theme', s.theme, THEMES.map((t) => ({ value: t.id, label: t.label })), (v) => ctx.set((x) => void (x.theme = v))),
    select<DataState>('Data', s.dataState, [
      { value: 'live', label: 'Loaded data' },
      { value: 'loading', label: 'Loading' },
      { value: 'empty', label: 'Empty (no matches)' },
      { value: 'error', label: 'Error' },
    ], (v) => ctx.set((x) => void (x.dataState = v))),
    reset,
  ]);
}

interface Scenario {
  label: string;
  what: string;
  apply: (s: State) => void;
  after?: (ctx: Ctx) => void;
}

const SCENARIOS: Scenario[] = [
  {
    label: 'Where people split',
    what: 'Agreement · std dev, highest first: the contested claims rise to the top, flagged ⚑.',
    apply: (s) => {
      s.page = 'content';
      s.aggs.agreement = 'stddev';
      s.sorts = [{ col: 'agreement', dir: 'desc' }];
    },
  },
  {
    label: 'Important but low quality',
    what: 'Importance · avg beside Quality · avg, sorted by Importance then Quality ascending.',
    apply: (s) => {
      s.page = 'content';
      s.aggs.importance = 'avg';
      s.aggs.quality = 'avg';
      s.sorts = [
        { col: 'importance', dir: 'desc' },
        { col: 'quality', dir: 'asc' },
      ];
    },
  },
  {
    label: 'Masked MIN sorts last',
    what: 'Quality · min ascending: only items with 5+ people show a minimum; hidden cells sort after every real value, so order leaks nothing.',
    apply: (s) => {
      s.page = 'content';
      s.aggs.quality = 'min';
      s.sorts = [{ col: 'quality', dir: 'asc' }];
    },
  },
  {
    label: 'Missing is not zero',
    what: 'Importance · count: “How SQLite Is Tested” has 2 perspectives but a real count of 0 Importance ratings; avg would be empty, not 0.',
    apply: (s) => {
      s.page = 'content';
      s.aggs.importance = 'count';
      s.sorts = [{ col: 'importance', dir: 'asc' }];
    },
  },
  {
    label: 'Drill into Arrival',
    what: 'Counted 5 people, 6 perspectives exist, you can open 4: the banner explains the gap.',
    apply: (s) => {
      s.pScope = 'public';
    },
    after: (ctx) => ctx.drill(1),
  },
  {
    label: 'Two slots, one vote',
    what: 'Scope “+ opted-in private”: kofi has a public and an opted-in private perspective on Remote work; only the public one counts (one vote per person).',
    apply: (s) => {
      s.page = 'content';
      s.scope = 'optin';
      s.sorts = [{ col: 'perspectives', dir: 'desc' }];
      if (!s.cols.includes('perspectives')) s.cols = [...s.cols, 'perspectives'];
    },
  },
  {
    label: 'Gather all (tooltip)',
    what: 'Every aggregator is fetched; the extras appear only in the cell tooltip. Columns still show and sort by one aggregator each.',
    apply: (s) => {
      s.page = 'content';
      s.policy.gatherAll = true;
    },
  },
  {
    label: 'Strict privacy (n≥5 everywhere)',
    what: 'A flat minimum of 5: most cells lock, which is what a small community would see.',
    apply: (s) => {
      s.page = 'content';
      s.policy.minN = 'flat5';
    },
  },
  {
    label: 'My perspectives',
    what: 'The per-perspective page, default scope Mine: your own private ones included, marked 🔒.',
    apply: (s) => {
      s.page = 'perspectives';
      s.pScope = 'mine';
      s.contentFilter = null;
    },
  },
];

export function scenarios(ctx: Ctx): HTMLElement {
  return el('div', { class: 'scenarios' }, [
    el('span', { class: 'muted small' }, ['Try:']),
    ...SCENARIOS.map((sc) => {
      const b = el('button', { type: 'button', class: 'scenario', title: sc.what }, [sc.label]);
      b.addEventListener('click', () => {
        ctx.set((x) => {
          const fresh = initialState();
          Object.assign(x, { ...fresh, viewport: x.viewport, theme: x.theme, deskWidth: x.deskWidth, aggs: { ...fresh.aggs }, policy: { ...fresh.policy } });
          sc.apply(x);
        });
        sc.after?.(ctx);
      });
      return b;
    }),
  ]);
}

export function readouts(ctx: Ctx): HTMLElement {
  const { s } = ctx;
  const req = requestFor(s);
  return el('section', { class: 'panel' }, [
    el('h2', {}, ['URL and request']),
    el('p', { class: 'blurb' }, [
      'What the current view would put in the address bar (shareable: aggregator choices, sort and filters live here; columns stay in the per-view saved layout, as in the Library), the query it would send and the TanStack key that caches it. The key mirrors every variable the request sends, plus the viewer.',
    ]),
    el('div', { class: 'readout' }, [el('span', { class: 'ro-k' }, ['URL']), el('code', { 'data-testid': 'url-readout' }, [urlFor(s)])]),
    el('div', { class: 'readout' }, [el('span', { class: 'ro-k' }, ['Query']), el('code', {}, [req.query])]),
    el('details', { open: true }, [el('summary', {}, ['Variables']), el('pre', {}, [JSON.stringify(req.variables, null, 2)])]),
    el('details', {}, [el('summary', {}, ['queryKey']), el('pre', {}, [JSON.stringify(req.queryKey)])]),
  ]);
}

// ---------------------------------------------------------------------------
// Width budget
// ---------------------------------------------------------------------------

function budgetTable(s: State, page: Page, width: number, title: string): HTMLElement {
  const { cols, minSum } = layoutWidths(s, page, width);
  const rows = cols.map((c) => columnMin(s, page, c));
  const ok = minSum <= width;
  return el('div', { class: 'budget' }, [
    el('h3', {}, [`${title}: ${tierOf(width)} tier at ${width}px`]),
    el('table', { class: 'plain' }, [
      el('thead', {}, [el('tr', {}, ['Column', 'Header (label + chrome)', 'Chip reserve', 'Cell floor', 'Min width'].map((h) => el('th', {}, [h])))]),
      el(
        'tbody',
        {},
        rows.map((r) => el('tr', {}, [el('td', {}, [r.label]), el('td', { class: 'r' }, [String(r.header)]), el('td', { class: 'r' }, [r.chip ? String(r.chip) : '']), el('td', { class: 'r' }, [r.cell ? String(r.cell) : '']), el('td', { class: 'r b' }, [String(r.min)])]))
      ),
      el('tfoot', {}, [el('tr', {}, [el('td', { colSpan: 4 }, [`Sum of minimums vs ${width}px`]), el('td', { class: `r b ${ok ? 'ok' : 'err'}` }, [`${minSum} ${ok ? '✓ fits' : '✗ scrolls'}`])])]),
    ]),
    el('div', { class: 'budget-bar' }, [
      ...rows.map((r) => el('span', { class: 'bb-seg', style: `flex:${r.min}`, title: `${r.label}: ${r.min}px` } , [r.min > 60 ? r.label : ''])),
      ok ? el('span', { class: 'bb-spare', style: `flex:${width - minSum}`, title: 'Spare, shared by flex' }, [width - minSum > 50 ? `+${width - minSum}` : '']) : null,
    ]),
  ]);
}

export function widthBudget(ctx: Ctx): HTMLElement {
  const { s } = ctx;
  const chips = AGGREGATORS.map((a) => a.chip);
  const lg = { ...s, deskWidth: 1212 as DeskWidth, cols: [...DEFAULT_COLS], pCols: [...DEFAULT_PCOLS] };
  return el('section', { class: 'panel' }, [
    el('h2', {}, ['Width budget']),
    el('p', { class: 'blurb' }, [
      `The Library grid is 1212px (max-w-screen-xl less padding) and each default lg set’s minimums must fit it. Every column’s floor is headerMinWidth: the label in Geist 600 at ${HEADER_TEXT.fontSize}px, uppercase, ${HEADER_TEXT.letterSpacingEm}em spacing, plus ${CHROME.padding}px padding each side, a ${CHROME.guard}px guard, sort arrow ${CHROME.sort}px, sort order ${CHROME.sortOrder.toFixed(1)}px and funnel ${CHROME.filter}px. A rating column adds the aggregator chip reserve: the widest chip (“${chips.reduce((a, b) => (a.length >= b.length ? a : b))}”, 10px) plus ${CHIP_BOX.padX * 2}px padding, an ${CHIP_BOX.caret}px caret and a ${CHIP_BOX.gapBefore}px gap, so switching aggregator never resizes the column. Header layout “${s.headerLayout}” (switch it under Decisions).`,
    ]),
    el('div', { class: 'budget-grid' }, [
      budgetTable(s, s.page, s.deskWidth, 'Current view'),
      budgetTable(lg, 'content', 1212, 'Default set, By content'),
      budgetTable(lg, 'perspectives', 1212, 'Default set, Perspectives'),
    ]),
    el('p', { class: 'muted small' }, [
      'Tiers: lg (900px+) shows the chosen set; md (860–899px) keeps Item plus the first two rating columns; below 860px the card list replaces the grid (card mode). At lg widths under the minimum sum, the grid scrolls sideways with Item pinned.',
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

interface Decision {
  q: string;
  source: string;
  proposal: string;
  why: string;
  alternatives?: string;
  control?: (ctx: Ctx) => HTMLElement;
}

const policySwitch = <K extends keyof Policy>(key: K, opts: { value: Policy[K]; label: string }[]) => (ctx: Ctx) =>
  toggle(String(ctx.s.policy[key]), opts.map((o) => ({ value: String(o.value), label: o.label })), (v) =>
    ctx.set((x) => void (x.policy[key] = opts.find((o) => String(o.value) === v)!.value))
  );

export const DECISIONS: Decision[] = [
  {
    q: 'Page name and nav placement',
    source: 'Open question 5',
    proposal: 'One nav item, “Gauge”, between Library and Discover, with two tabs: By content (aggregates) and Perspectives (one row each).',
    why: 'Nav labels are one word and new top-level pages take a one-word verb (frontend/CLAUDE.md). One item for both pages keeps the nav at five and makes the drill-down a tab switch.',
    alternatives: 'Weigh · Insights (noun) · Perspectives (noun; collides with the second tab).',
    control: (ctx) => toggle<PageName>(ctx.s.pageName, (['Gauge', 'Weigh', 'Insights', 'Perspectives'] as PageName[]).map((v) => ({ value: v, label: v })), (v) => ctx.set((x) => void (x.pageName = v))),
  },
  {
    q: 'Relation to Library, Compare and Discover',
    source: 'Open question 5',
    proposal: 'Beside the Library, not replacing it. The Library answers “what is there”, Gauge “what people think of it”. Content titles open Library details on both pages; a perspective opens Compare with its owner; Library details gains “Open its perspectives in Gauge”. Discover is untouched.',
    why: 'Each page keeps one row unit and one question; the links make them one family.',
  },
  {
    q: 'Where the aggregator control lives',
    source: 'Design process, gate 1',
    proposal: 'A chip in each rating header (“Quality · avg ▾”); its menu lists every aggregator with its privacy minimum and a “Set for all columns” row.',
    why: 'Per-column choice is the point (avg Quality beside std dev Agreement); a page-wide toggle can’t show that. The chip names the aggregator even when nobody opens it.',
    alternatives: 'Toolbar of per-column selects above the grid, or both.',
    control: (ctx) =>
      toggle(ctx.s.aggControl, [
        { value: 'header', label: 'Header chip' },
        { value: 'toolbar', label: 'Toolbar' },
        { value: 'both', label: 'Both' },
      ], (v) => ctx.set((x) => void (x.aggControl = v))),
  },
  {
    q: 'Header layout for the chip',
    source: 'Design process, gate 2',
    proposal: 'Inline: label and chip on the 36px header row, with a fixed chip reserve in the column’s minimum width.',
    why: 'Keeps the Activity grid’s 36px header and row rhythm. The default lg set still fits 1212px (see Width budget).',
    alternatives: 'Stacked: chip on a second header line (52px header), narrower columns.',
    control: (ctx) =>
      toggle(ctx.s.headerLayout, [
        { value: 'inline', label: 'Inline' },
        { value: 'stacked', label: 'Stacked' },
      ], (v) => ctx.set((x) => void (x.headerLayout = v))),
  },
  {
    q: 'Which aggregators ship first',
    source: 'Open question 2',
    proposal: 'AVG, COUNT, STDDEV, MIN, MAX on every measure. SUM only on custom numeric fields and feeling intensity. Median and percentiles later (each is one registry entry).',
    why: 'A sum of 0–10 ratings mostly restates COUNT × AVG; on intensities and custom numbers it is a real total.',
    control: policySwitch('sumOnRatings', [
      { value: false, label: 'SUM on custom + feelings' },
      { value: true, label: 'SUM everywhere' },
    ]),
  },
  {
    q: 'Minimum contributors per aggregator',
    source: 'Open question 3, ADR 0002 §6',
    proposal: `COUNT always shown; AVG, SUM and STDDEV need ${aggregator('avg').proposedMinN}; MIN and MAX need ${aggregator('min').proposedMinN} (each is one person’s value). The spread bar draws min and max, so it follows the MIN/MAX rule.`,
    why: 'MIN/MAX with one or two contributors is a person’s private value; an average of three is not.',
    alternatives: 'One flat number for everything.',
    control: policySwitch('minN', [
      { value: 'proposed', label: 'Per aggregator' },
      { value: 'flat1', label: 'Flat 1 (off)' },
      { value: 'flat2', label: 'Flat 2' },
      { value: 'flat3', label: 'Flat 3' },
      { value: 'flat5', label: 'Flat 5' },
    ]),
  },
  {
    q: 'Below the minimum: hide or coarsen',
    source: 'ADR 0002 §6 (“hidden or coarsened”)',
    proposal: 'Hide: 🔒 with the n it has and the n it needs. The count stays visible.',
    why: 'Simple and honest. Coarsening (an average shown as a band such as 7–10) is offered for AVG from 2 contributors only.',
    control: policySwitch('below', [
      { value: 'hide', label: 'Hide' },
      { value: 'coarsen', label: 'Coarsen AVG' },
    ]),
  },
  {
    q: 'Hidden values in sort and filter',
    source: 'Privacy, #751',
    proposal: 'A hidden value is empty: it sorts after every real value in both directions and never matches a range filter. Applied on the server before ORDER BY and HAVING.',
    why: 'If a hidden MIN still sorted into its true place, the order would leak it. Try the “Masked MIN sorts last” scenario.',
  },
  {
    q: 'What n counts',
    source: 'ADR 0002 §7, migration 000038 (owner decision)',
    proposal: 'People: one vote per user per content, the public perspective wins. Labelled “n” in cells, “people” in tooltips. Fixed rule, not a switch.',
    why: 'A user holds at most one public and one private perspective per content (migration 000038); only a scope that admits private rows can see two, and then the public one counts.',
  },
  {
    q: 'Whose perspectives (population)',
    source: 'Open question 4, owner decision',
    proposal: 'The viewer’s choice, on desktop and mobile. By content: Everyone (public) by default; Mine (your own, nothing masked); “+ opted-in private” once the ADR’s “Allow in aggregates” exists. Private perspectives never enter the shared number by default; your own value always shows as “Mine” in the cell tooltip and detail sheet. Perspectives page: Mine by default, Public widens to everyone’s public rows plus yours (owner-or-public rule).',
    why: 'Who to listen to is the reader’s question, not a site-wide rule; the default keeps private rows out.',
    control: (ctx) =>
      toggle(ctx.s.scope, [
        { value: 'public', label: 'Everyone (public)' },
        { value: 'mine', label: 'Mine' },
        { value: 'optin', label: '+ opted-in private (later)' },
      ], (v) => ctx.set((x) => void (x.scope = v))),
  },
  {
    q: 'Contested flag',
    source: 'Spread and sample size',
    proposal: 'Std dev of 2.5 or more with at least 3 people (⚑ in the cell, a pill on cards, the bar turns amber).',
    why: 'Std dev is what the column can already show. The alternative reuses Compare’s “conflict” gap (range above 3.0).',
    control: policySwitch('contested', [
      { value: 'stddev', label: 'Std dev ≥ 2.5' },
      { value: 'range', label: 'Range > 3 (Compare)' },
    ]),
  },
  {
    q: 'Std dev and the scale',
    source: 'Rating scale',
    proposal: 'Sample standard deviation (Postgres stddev), computed on stored 0–10,000 values and shown on the 0–10 scale with two decimals. Undefined for one rating: empty, never 0.',
    why: 'Matches the database function the query will use; two decimals because spreads are small numbers.',
  },
  {
    q: 'One aggregator per column',
    source: 'Metric × aggregator, owner decision',
    proposal: 'A measure appears once and shows, sorts and filters by exactly one aggregator, the one its chip names. “Set for all columns” only sets each column’s single aggregator.',
    why: 'Two Quality columns would bring back the column-per-pair picker the issue rejects, and a second sortable value per cell would make the sort ambiguous.',
  },
  {
    q: 'Gather all (tooltip only)',
    source: 'Owner decision',
    proposal: 'Off by default. When on, the request fetches every aggregator for each shown measure; the extras appear only in the cell tooltip (each masked by its own minimum), never as columns, never sortable or filterable.',
    why: 'Lets a reader see the whole picture of one cell without widening the grid or the sort model.',
    control: policySwitch('gatherAll', [
      { value: false, label: 'Off' },
      { value: true, label: 'Gather all' },
    ]),
  },
  {
    q: 'Default columns per tier',
    source: 'Design process, gate 2',
    proposal: 'lg: ◎ Item Type Quality Agreement Importance Confidence (Perspectives, Last rated, Clarity, Hopeful in the picker). md: Item + first two ratings. Perspectives page lg: Content Owner Claim, the four ratings, Feelings, Updated.',
    why: 'Both sets fit 1212px with their chip reserve (see Width budget). The per-item perspective count rides in the Item cell’s “n perspectives ›” link.',
  },
  {
    q: 'Mobile: no header row',
    source: 'Mobile card list',
    proposal: 'A control row above the cards: Sort (also picks the sorted measure’s aggregator), Measures (which ratings a card shows, each with its aggregator, plus set-for-all) and Filter. Cards show the sorted measure first, then up to two more. Tapping a rating opens its detail sheet (the tooltip’s content plus Sort by this / See perspectives).',
    why: 'Every header job has one home; nothing depends on hover.',
  },
  {
    q: 'Drill-down',
    source: 'Bridge to the per-perspective page',
    proposal: 'The Item cell’s “n perspectives ›” link, the cell popover’s action and Enter on a row open the Perspectives tab filtered to that content (?content=id). The row you came from stays selected on return.',
    why: 'Row click is left for the cell popover, as in the Library. The banner reconciles “counted” with “you can open”, so private rows never look like a bug.',
  },
  {
    q: 'Glossary terms in the UI',
    source: 'docs/glossary/perspectives',
    proposal: '“Owner” (not author), “Perspectives”, “Claim”, “Feelings”, “Standard dimensions” / “Optional dimensions” as picker groups, “Private” with 🔒.',
    why: 'The glossary reserves Author/Creator for content makers.',
  },
];

export function decisions(ctx: Ctx): HTMLElement {
  return el('section', { class: 'panel' }, [
    el('h2', {}, ['Design decisions']),
    el('p', { class: 'blurb' }, ['Each open question with the default this preview demonstrates. Where a switch is shown, flip it and the frames above change live.']),
    el(
      'ol',
      { class: 'decisions' },
      DECISIONS.map((d) =>
        el('li', { class: 'decision' }, [
          el('div', { class: 'd-head' }, [el('strong', {}, [d.q]), el('span', { class: 'd-src' }, [d.source])]),
          el('p', {}, [el('span', { class: 'd-tag' }, ['Proposed']), ' ', d.proposal]),
          el('p', { class: 'muted' }, [d.why]),
          d.alternatives ? el('p', { class: 'muted small' }, [`Alternatives: ${d.alternatives}`]) : null,
          d.control ? el('div', { class: 'd-ctl' }, [d.control(ctx)]) : null,
        ])
      )
    ),
  ]);
}

export const CONTRACT: string[] = [
  'contentMetrics(scope: PUBLIC | MINE | PUBLIC_AND_OPTED_IN, gatherAll: Boolean, filter: ContentFilter, metrics: [MetricRequest!]!, metricFilters: [MetricRange!], sortBy: [MetricSort!], first, after): a cursor-paginated content list costing a fixed number of statements for any number of metrics.',
  'MetricRequest = { metric: { kind: STANDARD | CUSTOM | FEELING, key }, aggregator: AVG | COUNT | MIN | MAX | SUM | STDDEV }. STANDARD keys are an enum (QUALITY, AGREEMENT, IMPORTANCE, CONFIDENCE); CUSTOM and FEELING keys are strings bound as parameters and checked against keys that exist.',
  'One aggregator per metric column: metrics, metricFilters and sortBy each name the column’s single aggregator; the server sorts and filters by that one only.',
  'gatherAll (default false): each cell also returns every other aggregator for its metric, each masked by its own minN, for the tooltip only; they never drive sort or filter.',
  'Each returned cell: { metric, aggregator, value (stored 0–10,000 scale; COUNT a whole number; null when empty or hidden), n, hidden, minN }. The UI divides by 1,000 and formats STDDEV to two decimals.',
  'Each cell also returns a masked summary { mean, stddev, min, max } for the tooltip and the spread bar; every field is null unless its own threshold is met (mean and stddev at 3, min and max at 5), so the bar never reveals what the chip hides.',
  'n counts rated values after the scope rule and one vote per user per content, the public row winning (ADR 0002 §7; a user holds at most one public and one private perspective per content, migration 000038). COUNT = n; a measure nobody rated has COUNT 0 and every other aggregate null.',
  'Scope is the viewer’s choice. PUBLIC (default): public rows only. MINE: the viewer’s own rows, public and private, no masking. PUBLIC_AND_OPTED_IN (later, needs the “Allow in aggregates” opt-in): public plus opted-in private rows. Private rows never enter a shared number by default.',
  'Each content row returns the viewer’s own value per metric (“mine”: their public row, else their private one), shown beside the shared number but never part of it.',
  'Masking happens before ORDER BY and HAVING: hidden values are NULL, NULLS LAST in both directions, and a range filter never matches NULL.',
  'STDDEV is stddev_samp (null for one value). Thresholds are server constants (COUNT 1; AVG, SUM, STDDEV 3; MIN, MAX 5) returned per cell as minN, so the UI never hard-codes them.',
  'Per content row: counted (rows feeding the aggregate), perspectiveCount (all) and visiblePerspectiveCount (what the viewer may open), plus lastRated = newest updatedAt among counted rows; batched through a dataloader.',
  'SUM is accepted only for CUSTOM and FEELING metrics unless the policy decision changes.',
  'perspectives(filter: { scope: MINE | PUBLIC, contentId, ratingRanges: [{ metric, min, max }] }, sortBy: [{ metric | field, order }], first, after): owner-or-public rows, no de-duplication, missing ratings sort last and never match a range.',
  'The drill-down is that list with contentId set; the banner uses the content row’s counted / perspectiveCount / visiblePerspectiveCount.',
  'Both query keys include the viewer (ADR 0002 threat 5) and every variable the request sends.',
];

export function contract(): HTMLElement {
  return el('section', { class: 'panel' }, [
    el('h2', {}, ['Backend contract this UI relies on']),
    el('p', { class: 'blurb' }, ['Assumptions to reconcile with the backend design spec. Field names are proposals; the shape and the order of operations are what the screens depend on.']),
    el('ol', { class: 'contract' }, CONTRACT.map((c) => el('li', {}, [c]))),
  ]);
}

export function policySummary(s: State): string {
  const parts = AGGREGATORS.map((a) => `${a.chip} ${minNFor(a, s.policy)}`);
  return `min n: ${parts.join(' · ')} · spread bar ${spreadMinN(s.policy)} · ${METRICS.length} measures`;
}
