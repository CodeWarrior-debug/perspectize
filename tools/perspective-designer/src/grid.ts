/**
 * The desktop interface: the app shell, page header, filter chips, the grid (drawn as a table
 * with the Activity grid's Balham metrics: 36px header, 49px rows, 11px uppercase labels) and the
 * bottom bar. Both pages share it; only the columns and cells differ.
 */
import { contentRows, type ContentRow } from './aggregate.js';
import {
  cellTip,
  feelingsNode,
  fmtDate,
  headerTip,
  metricCellBody,
  rawTip,
  rawValueNode,
  subline,
  typeTile,
} from './cells.js';
import type { Ctx } from './ctx.js';
import { el } from './dom.js';
import { PERSPECTIVES, TYPE_META, VIEWER, contentById, type Perspective } from './fixture.js';
import { METRICS, aggregator, aggregatorsFor, metric, type AggregatorId, type MetricId } from './registry.js';
import {
  columnMin,
  visibleCols,
  visibleContentRows,
  visiblePerspectives,
  type ColDef,
  type Page,
  type SortSpec,
  type State,
} from './state.js';
import { attachTip } from './tip.js';

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

export function appNav(s: State, compact: boolean): HTMLElement {
  const links = ['Library', s.pageName, 'Discover', 'Compare', 'Plan'];
  const nav = el('nav', { class: 'app-nav' }, [
    el('span', { class: 'logo' }, ['◎ Perspectize']),
    compact
      ? el('span', { class: 'hamburger', 'aria-label': 'Menu' }, ['☰'])
      : el(
          'span',
          { class: 'nav-links' },
          links.map((l) => el('span', { class: `nav-link${l === s.pageName ? ' on' : ''}${l === s.pageName ? ' new' : ''}` }, [l]))
        ),
  ]);
  return nav;
}

export function pageTabs(ctx: Ctx): HTMLElement {
  const { s } = ctx;
  const tab = (page: Page, label: string) => {
    const b = el('button', { type: 'button', class: `page-tab${s.page === page ? ' on' : ''}`, 'aria-pressed': String(s.page === page) }, [label]);
    b.addEventListener('click', () => ctx.set((x) => void (x.page = page)));
    return b;
  };
  return el('div', { class: 'page-tabs', role: 'tablist' }, [tab('content', 'By content'), tab('perspectives', 'Perspectives')]);
}

export function segmented<T extends string>(options: { value: T; label: string; disabled?: string }[], value: T, onPick: (v: T) => void, cls = ''): HTMLElement {
  return el(
    'div',
    { class: `seg ${cls}`, role: 'group' },
    options.map((o) => {
      const b = el('button', { type: 'button', class: o.value === value ? 'on' : '', disabled: !!o.disabled, title: o.disabled ?? '' }, [o.label]);
      b.addEventListener('click', () => onPick(o.value));
      return b;
    })
  );
}

export function scopeControl(ctx: Ctx): HTMLElement {
  const { s } = ctx;
  if (s.page === 'content') {
    return segmented(
      [
        { value: 'public', label: 'Everyone (public)' },
        { value: 'mine', label: 'Mine' },
        { value: 'optin', label: '+ opted-in private' },
      ],
      s.scope,
      (v) => ctx.set((x) => void (x.scope = v))
    );
  }
  return segmented(
    [
      { value: 'mine', label: 'Mine' },
      { value: 'public', label: 'Public' },
    ],
    s.pScope,
    (v) => ctx.set((x) => void (x.pScope = v))
  );
}

/** Filter chips row (like FilterChips.svelte), plus the drill-down chip on the perspectives page. */
export function chipsRow(ctx: Ctx): HTMLElement | null {
  const { s } = ctx;
  const chips: HTMLElement[] = [];
  const filters = s.page === 'content' ? s.filters : s.pFilters;
  for (const [id, f] of Object.entries(filters)) {
    if (!f) continue;
    const m = metric(id as MetricId);
    const label = s.page === 'content' ? `${m.label} ${aggregator(s.aggs[m.id]).chip}` : m.label;
    const x = el('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove ${label} filter` }, ['×']);
    x.addEventListener('click', () =>
      ctx.set((st) => {
        if (st.page === 'content') delete st.filters[id as MetricId];
        else delete st.pFilters[id as MetricId];
      })
    );
    chips.push(el('span', { class: 'fchip' }, [`${label}: ${f.min ?? '0'}–${f.max ?? '10'}`, x]));
  }
  if (s.page === 'perspectives' && s.contentFilter !== null) {
    const x = el('button', { type: 'button', class: 'chip-x', 'aria-label': 'Remove content filter' }, ['×']);
    x.addEventListener('click', () => ctx.set((st) => void (st.contentFilter = null)));
    chips.unshift(el('span', { class: 'fchip strong' }, [`Content: ${contentById(s.contentFilter).title}`, x]));
  }
  if (!chips.length) return null;
  const clear = el('button', { type: 'button', class: 'linkish' }, ['Clear all']);
  clear.addEventListener('click', () =>
    ctx.set((st) => {
      if (st.page === 'content') st.filters = {};
      else {
        st.pFilters = {};
        st.contentFilter = null;
      }
    })
  );
  return el('div', { class: 'chips-row' }, [...chips, clear]);
}

/** Banner on a drilled-down perspectives page: what the aggregate counted versus what the viewer can open. */
export function drillBanner(ctx: Ctx): HTMLElement | null {
  const { s } = ctx;
  if (s.page !== 'perspectives' || s.contentFilter === null) return null;
  const row = contentRows(s.scope === 'mine' ? 'public' : s.scope, s.policy, s.aggs).find((r) => r.content.id === s.contentFilter)!;
  const back = el('button', { type: 'button', class: 'linkish' }, [`← Back to ${s.pageName}`]);
  back.addEventListener('click', () => ctx.set((x) => void (x.page = 'content')));
  const hidden = row.total - row.visible;
  const text =
    `${s.pageName} counts ${row.counted} ${row.counted === 1 ? 'person' : 'people'} on this item (one vote each). ` +
    `You can open ${row.visible} of its ${row.total} perspectives` +
    (hidden
      ? `: ${hidden} ${hidden === 1 ? 'is' : 'are'} private, never shown${s.scope === 'optin' ? ' (counted only if the owner opted in)' : ' and not counted'}.`
      : '.');
  const showing = s.pScope === 'mine' ? ' Showing only yours: switch to Public to see the rest.' : '';
  return el('div', { class: 'drill-banner' }, [back, el('span', {}, [text + showing])]);
}

// ---------------------------------------------------------------------------
// Header cells
// ---------------------------------------------------------------------------

function sortState(sorts: SortSpec[], col: string): { dir: 'asc' | 'desc' | null; order: number } {
  const i = sorts.findIndex((x) => x.col === col);
  return { dir: i === -1 ? null : sorts[i].dir, order: sorts.length > 1 && i !== -1 ? i + 1 : 0 };
}

/** Header click: cycle this column's sort (ratings start descending); shift-click adds it to the stack. */
function cycleSort(sorts: SortSpec[], c: ColDef, multi: boolean): SortSpec[] {
  const ratingFirst = c.kind === 'metric' || c.kind === 'raw' || c.kind === 'count' || c.kind === 'date';
  const first: 'asc' | 'desc' = ratingFirst ? 'desc' : 'asc';
  const cur = sorts.find((x) => x.col === c.id);
  const next: SortSpec | null = !cur ? { col: c.id, dir: first } : cur.dir === first ? { col: c.id, dir: first === 'asc' ? 'desc' : 'asc' } : null;
  if (multi) {
    const rest = sorts.filter((x) => x.col !== c.id);
    return next ? (cur ? sorts.map((x) => (x.col === c.id ? next : x)) : [...rest, next]) : rest;
  }
  return next ? [next] : [];
}

function headerCell(ctx: Ctx, page: Page, c: ColDef, width: number): HTMLElement {
  const { s } = ctx;
  const th = el('th', { class: `hc k-${c.kind}`, scope: 'col' });
  th.style.width = `${width}px`;
  if (!c.label) return th;
  const sorts = page === 'content' ? s.sorts : s.pSorts;
  const filters = page === 'content' ? s.filters : s.pFilters;
  const st = sortState(sorts, c.id);
  const numeric = c.kind === 'metric' || c.kind === 'raw' || c.kind === 'count';
  if (st.dir) th.classList.add('sorted');
  if (numeric) th.classList.add('right');

  const label = el('span', { class: 'hc-label', tabIndex: 0 }, [c.label]);
  const sortIcon = el('span', { class: 'hc-sort' }, [st.dir ? (st.dir === 'asc' ? '↑' : '↓') : '', st.order ? el('sup', {}, [String(st.order)]) : null]);
  const active = !!filters[c.id as MetricId];
  const funnel = c.filter
    ? el('button', { type: 'button', class: `hc-funnel${active ? ' active' : ''}`, 'aria-label': `Filter ${c.label}`, 'data-anchor': `filter-${c.id}` }, ['⏷'])
    : null;
  funnel?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (c.kind === 'metric' || c.kind === 'raw') ctx.open({ kind: 'filter', host: 'desktop', page, metric: c.id as MetricId });
  });

  let chip: HTMLElement | null = null;
  if (c.kind === 'metric') {
    const agg = aggregator(s.aggs[c.id as MetricId]);
    const interactive = s.aggControl !== 'toolbar';
    chip = interactive
      ? el('button', { type: 'button', class: 'agg-chip', 'data-anchor': `agg-${c.id}`, 'aria-haspopup': 'menu', 'aria-label': `${c.label} aggregator: ${agg.label}` }, [agg.chip, el('span', { class: 'caret' }, ['▾'])])
      : el('span', { class: 'agg-chip static' }, [agg.chip]);
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (interactive) ctx.open({ kind: 'aggMenu', host: 'desktop', metric: c.id as MetricId });
    });
    attachTip(label, () => headerTip(c.id as MetricId, s.policy, s.scope, agg.id));
  } else {
    attachTip(label, () => ({ title: c.label, body: [c.tip] }));
  }

  const stacked = c.kind === 'metric' && s.headerLayout === 'stacked';
  const inner = stacked
    ? el('div', { class: 'hc-inner stacked' }, [
        el('div', { class: 'hc-line' }, [funnel, el('span', { class: 'grow' }), sortIcon, label]),
        el('div', { class: 'hc-line chip-line' }, [chip]),
      ])
    : el('div', { class: 'hc-inner' }, numeric ? [funnel, el('span', { class: 'grow' }), sortIcon, label, chip] : [label, sortIcon, el('span', { class: 'grow' }), funnel]);
  th.append(inner);
  if (c.sortable) {
    th.classList.add('sortable');
    th.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.agg-chip, .hc-funnel')) return;
      const multi = (e as MouseEvent).shiftKey;
      ctx.set((x) => {
        if (page === 'content') x.sorts = cycleSort(x.sorts, c, multi);
        else x.pSorts = cycleSort(x.pSorts, c, multi);
      });
    });
  }
  return th;
}

// ---------------------------------------------------------------------------
// Widths
// ---------------------------------------------------------------------------

const FLEX: Partial<Record<string, number>> = { item: 3, content: 3, claim: 2, metric: 1, raw: 0.6, owner: 0.6, date: 0.6, type: 0.5, count: 0.5, feelings: 0.6 };

/** Column widths for a grid `width` px wide: every column gets its minimum, flex shares the rest. */
export function layoutWidths(s: State, page: Page, width: number): { cols: ColDef[]; widths: number[]; total: number; minSum: number } {
  const cols = visibleCols(s, page);
  const mins = cols.map((c) => columnMin(s, page, c).min);
  const minSum = mins.reduce((a, b) => a + b, 0);
  const spare = Math.max(0, width - minSum);
  const flexes = cols.map((c) => (c.kind === 'action' ? 0 : (FLEX[c.id] ?? FLEX[c.kind] ?? 0.5)));
  const flexSum = flexes.reduce((a, b) => a + b, 0) || 1;
  const widths = mins.map((m, i) => Math.floor(m + (spare * flexes[i]) / flexSum));
  return { cols, widths, total: Math.max(width, minSum), minSum };
}

// ---------------------------------------------------------------------------
// Body rows
// ---------------------------------------------------------------------------

function contentCell(ctx: Ctx, row: ContentRow, c: ColDef): HTMLElement {
  const { s } = ctx;
  const td = el('td', { class: `k-${c.kind}` });
  switch (c.kind) {
    case 'action': {
      const mine = PERSPECTIVES.some((p) => p.contentId === row.content.id && p.owner === VIEWER);
      const b = el('button', { type: 'button', class: `perspectize${mine ? ' mine' : ''}`, title: mine ? 'Edit your perspective' : 'Add a perspective' }, [mine ? '◉' : '+']);
      td.append(b);
      break;
    }
    case 'item': {
      const title = el('button', { type: 'button', class: 'title-link' }, [row.content.title]);
      title.addEventListener('click', (e) => {
        e.stopPropagation();
        ctx.open({ kind: 'details', host: 'desktop', contentId: row.content.id });
      });
      const drill = el('button', { type: 'button', class: 'drill-link' }, [row.visible ? `${row.visible} perspective${row.visible === 1 ? '' : 's'} ›` : 'no perspectives yet']);
      drill.disabled = !row.visible;
      drill.addEventListener('click', (e) => {
        e.stopPropagation();
        ctx.drill(row.content.id);
      });
      td.append(
        el('div', { class: 'item-cell' }, [
          typeTile(row.content),
          el('div', { class: 'item-text' }, [title, el('div', { class: 'item-sub' }, [el('span', { class: 'creator' }, [row.content.creator || TYPE_META[row.content.type].label]), ' · ', drill])]),
        ])
      );
      break;
    }
    case 'type':
      td.append(el('span', { class: 'type-cell' }, [typeTile(row.content, 'thumb mini'), TYPE_META[row.content.type].label]));
      break;
    case 'metric': {
      const cell = row.cells[c.id as MetricId];
      td.classList.add('right', `st-${cell.state}`);
      td.tabIndex = -1;
      td.append(metricCellBody(cell, true));
      attachTip(td, () => cellTip(row, cell, s.policy, s.scope, () => ctx.drill(row.content.id)), { pinOnClick: true });
      break;
    }
    case 'count':
      td.classList.add('right');
      td.append(el('span', { class: 'num' }, [String(row.counted)]));
      break;
    case 'date':
      td.append(row.lastRated ? fmtDate(row.lastRated) : el('span', { class: 'empty-marker' }, ['—']));
      break;
  }
  return td;
}

function perspectiveCell(ctx: Ctx, p: Perspective, c: ColDef): HTMLElement {
  const td = el('td', { class: `k-${c.kind}` });
  const content = contentById(p.contentId);
  switch (c.kind) {
    case 'content': {
      const title = el('button', { type: 'button', class: 'title-link' }, [content.title]);
      title.addEventListener('click', (e) => {
        e.stopPropagation();
        ctx.open({ kind: 'details', host: 'desktop', contentId: content.id });
      });
      td.append(
        el('div', { class: 'item-cell' }, [
          typeTile(content),
          el('div', { class: 'item-text' }, [title, el('div', { class: 'item-sub' }, [subline(content)])]),
        ])
      );
      break;
    }
    case 'owner':
      td.append(
        el('span', { class: 'owner' }, [
          p.owner === VIEWER ? el('span', { class: 'you' }, ['you']) : p.owner,
          p.privacy === 'PRIVATE' ? el('span', { class: 'lock', title: p.allowInAggregates ? 'Private · allowed in aggregates' : 'Private · only you' }, ['🔒']) : null,
        ])
      );
      break;
    case 'claim':
      td.append(el('span', { class: 'claim' }, [p.claim]));
      break;
    case 'raw':
      td.classList.add('right');
      td.append(rawValueNode(p, c.id as MetricId));
      attachTip(td, () => rawTip(p, c.id as MetricId), { pinOnClick: true });
      break;
    case 'feelings':
      td.append(feelingsNode(p));
      break;
    case 'date':
      td.append(fmtDate(c.id === 'created' ? p.createdAt : p.updatedAt));
      break;
  }
  return td;
}

function skeletonRows(cols: ColDef[]): HTMLElement[] {
  return Array.from({ length: 8 }, (_, i) =>
    el(
      'tr',
      { class: `row skel${i % 2 ? ' alt' : ''}` },
      cols.map((c) => el('td', {}, [c.kind === 'action' ? null : el('span', { class: 'skel-bar', style: `width:${40 + ((i * 17 + c.id.length * 11) % 50)}%` })]))
    )
  );
}

function emptyState(ctx: Ctx, colspan: number): HTMLElement {
  const { s } = ctx;
  const mineEmpty = s.page === 'perspectives' && s.pScope === 'mine' && s.dataState !== 'empty';
  const msg =
    s.dataState === 'error'
      ? 'Failed to load. Please try again.'
      : mineEmpty
        ? 'You haven’t written a perspective on this yet.'
        : s.page === 'content'
          ? 'No content matches these filters.'
          : 'No perspectives match these filters.';
  const btn = el('button', { type: 'button', class: 'btn' }, [s.dataState === 'error' ? 'Retry' : mineEmpty ? 'Show public perspectives' : 'Clear filters']);
  btn.addEventListener('click', () =>
    ctx.set((x) => {
      x.dataState = 'live';
      if (mineEmpty) x.pScope = 'public';
      else if (s.dataState !== 'error') {
        x.filters = {};
        x.pFilters = {};
      }
    })
  );
  const td = el('td', { colSpan: colspan, class: 'empty-state' }, [el('p', {}, [msg]), btn]);
  return el('tr', {}, [td]);
}

export function renderGrid(ctx: Ctx, width: number): HTMLElement {
  const { s } = ctx;
  const page = s.page;
  const { cols, widths, total } = layoutWidths(s, page, width);
  const table = el('table', { class: `grid${s.headerLayout === 'stacked' && page === 'content' ? ' tall-header' : ''}` });
  table.style.width = `${total}px`;
  table.append(el('colgroup', {}, widths.map((w) => el('col', { style: `width:${w}px` }))));
  table.append(el('thead', {}, [el('tr', {}, cols.map((c, i) => headerCell(ctx, page, c, widths[i])))]));
  const tbody = el('tbody');
  if (s.dataState === 'loading') tbody.append(...skeletonRows(cols));
  else if (s.dataState === 'error') tbody.append(emptyState(ctx, cols.length));
  else if (page === 'content') {
    const rows = visibleContentRows(s);
    if (!rows.length) tbody.append(emptyState(ctx, cols.length));
    rows.forEach((row, i) => {
      const tr = el('tr', { class: `row${i % 2 ? ' alt' : ''}${s.selected === row.content.id ? ' selected' : ''}`, tabIndex: 0, 'data-content': String(row.content.id) });
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && row.visible) ctx.drill(row.content.id);
      });
      for (const c of cols) tr.append(contentCell(ctx, row, c));
      tbody.append(tr);
    });
  } else {
    const ps = visiblePerspectives(s);
    if (!ps.length) tbody.append(emptyState(ctx, cols.length));
    ps.forEach((p, i) => {
      const tr = el('tr', { class: `row clickable${i % 2 ? ' alt' : ''}`, tabIndex: 0 });
      tr.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button, .tip-anchor')) return;
        ctx.open({ kind: 'perspective', host: 'desktop', id: p.id });
      });
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ctx.open({ kind: 'perspective', host: 'desktop', id: p.id });
      });
      for (const c of cols) tr.append(perspectiveCell(ctx, p, c));
      tbody.append(tr);
    });
  }
  table.append(tbody);
  return el('div', { class: 'grid-scroll' }, [table]);
}

/** Per-column aggregator selects: the "toolbar" placement of the aggregator control. */
function aggToolbar(ctx: Ctx): HTMLElement {
  const { s } = ctx;
  const metricsShown = visibleCols(s, 'content').filter((c) => c.kind === 'metric');
  const sel = (id: MetricId) => {
    const select = el(
      'select',
      { class: 'mini-select', 'aria-label': `${metric(id).label} aggregator` },
      aggregatorsFor(metric(id), s.policy).map((a) => el('option', { value: a.id, selected: a.id === s.aggs[id] }, [a.chip]))
    );
    select.addEventListener('change', () => ctx.set((x) => void (x.aggs[id] = select.value as AggregatorId)));
    return el('label', { class: 'agg-pick' }, [metric(id).label, select]);
  };
  const all = el(
    'select',
    { class: 'mini-select', 'aria-label': 'Set for all columns' },
    [el('option', { value: '' }, ['Set all…']), ...aggregatorsFor(metric('quality'), s.policy).map((a) => el('option', { value: a.id }, [a.label]))]
  );
  all.addEventListener('change', () => {
    const v = all.value as AggregatorId;
    if (v) ctx.set((x) => METRICS.forEach((m) => (x.aggs[m.id] = v)));
  });
  return el('div', { class: 'agg-toolbar' }, [el('span', { class: 'muted' }, ['Aggregate']), ...metricsShown.map((c) => sel(c.id as MetricId)), all]);
}

export function bottomBar(ctx: Ctx, count: number, mobile: boolean): HTMLElement {
  const { s } = ctx;
  const btn = (label: string, icon: string, run: () => void, disabled = false) => {
    const b = el('button', { type: 'button', class: 'bar-btn', disabled }, [el('span', { 'aria-hidden': 'true' }, [icon]), mobile ? null : el('span', {}, [label])]);
    b.setAttribute('aria-label', label);
    b.addEventListener('click', run);
    return b;
  };
  const sorts = s.page === 'content' ? s.sorts : s.pSorts;
  const host = mobile ? 'mobile' : 'desktop';
  return el('div', { class: 'bottom-bar' }, [
    el('span', { class: 'muted' }, [`${count} total`]),
    segmented(
      [
        { value: 'all', label: 'All' },
        { value: 'loaded', label: 'Loaded' },
      ],
      s.mode,
      (v) => ctx.set((x) => void (x.mode = v)),
      'small'
    ),
    mobile ? null : btn('Columns', '⚙', () => ctx.open({ kind: 'columns', host, page: s.page })),
    btn('Edit sorts', '⇅', () => ctx.open({ kind: 'sort', host, page: s.page })),
    btn('Clear sorts', '⤫', () => ctx.set((x) => (x.page === 'content' ? (x.sorts = []) : (x.pSorts = []))), !sorts.length),
    el('span', { class: 'grow' }),
    mobile ? null : el('span', { class: 'muted' }, ['Page 1 of 1']),
  ]);
}

export function renderDesktop(ctx: Ctx): HTMLElement {
  const { s } = ctx;
  const gridWidth = s.deskWidth;
  const count = s.dataState === 'live' ? (s.page === 'content' ? visibleContentRows(s).length : visiblePerspectives(s).length) : 0;
  const subtitle =
    s.page === 'content'
      ? 'What people think of each item: pick a measure for every rating column.'
      : s.pScope === 'mine'
        ? 'Every perspective you’ve written, one row each.'
        : 'Public perspectives across all content, plus your own.';
  const frame = el('div', { class: 'device desktop app', 'data-theme': s.theme, 'data-host': 'desktop' });
  frame.style.width = `${gridWidth + 2 * 32 + 2}px`;
  frame.append(
    appNav(s, false),
    el('div', { class: 'page' }, [
      el('div', { class: 'page-head' }, [
        el('div', {}, [el('h1', {}, [s.pageName]), el('p', { class: 'muted' }, [subtitle])]),
        pageTabs(ctx),
        el('div', { class: 'head-right' }, [scopeControl(ctx), el('input', { class: 'search', placeholder: s.page === 'content' ? 'Search content…' : 'Search claims…', type: 'text' })]),
      ]),
      drillBanner(ctx),
      el('div', { class: 'card' }, [
        chipsRow(ctx),
        s.page === 'content' && s.aggControl !== 'header' ? aggToolbar(ctx) : null,
        renderGrid(ctx, gridWidth),
        bottomBar(ctx, count, false),
      ]),
    ]),
    el('div', { class: 'overlay-layer', 'data-layer': 'desktop' })
  );
  return frame;
}
