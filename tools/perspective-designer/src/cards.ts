/**
 * The mobile interface (390px): the card list that replaces the grid below 860px. With no header
 * row, the header's three jobs move to a control row above the cards: Sort (which also picks the
 * sorted measure's aggregator), Measures (which ratings a card shows and how each is aggregated)
 * and Filter. Tapping a rating on a card opens its detail sheet, the stand-in for a hover tooltip.
 */
import type { ContentRow } from './aggregate.js';
import { contestedMark, feelingsNode, fmtDate, rawValueNode, spreadBar, subline, typeTile, valueNode } from './cells.js';
import type { Ctx } from './ctx.js';
import { el } from './dom.js';
import { PERSPECTIVES, VIEWER, contentById, type Perspective } from './fixture.js';
import { METRICS, aggregator, metric, type MetricId } from './registry.js';
import { appNav, bottomBar, chipsRow, drillBanner, pageTabs, scopeControl } from './grid.js';
import { visibleContentRows, visiblePerspectives, type State } from './state.js';

/** Ratings a card shows: the sorted measure first (so the order explains itself), then the chosen columns, at most three. */
export function cardMetrics(s: State): MetricId[] {
  const chosen = s.cols.filter((id) => METRICS.some((m) => m.id === id)) as MetricId[];
  const sorted = s.sorts.find((x) => METRICS.some((m) => m.id === x.col))?.col as MetricId | undefined;
  const order = sorted ? [sorted, ...chosen.filter((id) => id !== sorted)] : chosen;
  return order.slice(0, 3);
}

function sortSummary(s: State): string {
  const sorts = s.page === 'content' ? s.sorts : s.pSorts;
  if (!sorts.length) return 'Sort';
  const first = sorts[0];
  const m = METRICS.find((x) => x.id === first.col);
  const name = m ? (s.page === 'content' ? `${m.label} · ${aggregator(s.aggs[m.id]).chip}` : m.label) : first.col === 'updated' ? 'Updated' : first.col === 'created' ? 'Created' : first.col[0].toUpperCase() + first.col.slice(1);
  return `${name} ${first.dir === 'asc' ? '↑' : '↓'}${sorts.length > 1 ? ` +${sorts.length - 1}` : ''}`;
}

function controlRow(ctx: Ctx): HTMLElement {
  const { s } = ctx;
  const filters = s.page === 'content' ? s.filters : s.pFilters;
  const nFilters = Object.values(filters).filter(Boolean).length;
  const b = (label: string, run: () => void, cls = '') => {
    const x = el('button', { type: 'button', class: `ctl ${cls}` }, [label]);
    x.addEventListener('click', run);
    return x;
  };
  return el('div', { class: 'ctl-row' }, [
    b(`⇅ ${sortSummary(s)}`, () => ctx.open({ kind: 'sort', host: 'mobile', page: s.page }), 'grow'),
    s.page === 'content' ? b('Measures', () => ctx.open({ kind: 'metricsSheet', host: 'mobile' })) : null,
    b(nFilters ? `Filter (${nFilters})` : 'Filter', () => ctx.open({ kind: 'filterSheet', host: 'mobile', page: s.page })),
  ]);
}

function metricTile(ctx: Ctx, row: ContentRow, id: MetricId): HTMLElement {
  const { s } = ctx;
  const cell = row.cells[id];
  const agg = aggregator(s.aggs[id]);
  const sorted = s.sorts[0]?.col === id;
  const tile = el('button', { type: 'button', class: `mtile st-${cell.state}${sorted ? ' sorted' : ''}` }, [
    el('span', { class: 'mt-label' }, [metric(id).label, el('span', { class: 'mt-agg' }, [agg.chip])]),
    el('span', { class: 'mt-value' }, [valueNode(cell), cell.contested ? contestedMark() : null]),
    el('span', { class: 'mt-foot' }, [spreadBar(cell), cell.agg !== 'count' && cell.n ? el('span', { class: 'n' }, [`n ${cell.n}`]) : null]),
  ]);
  tile.addEventListener('click', (e) => {
    e.stopPropagation();
    ctx.open({ kind: 'cellSheet', host: 'mobile', contentId: row.content.id, metric: id });
  });
  return tile;
}

function contentCard(ctx: Ctx, row: ContentRow): HTMLElement {
  const { s } = ctx;
  const mine = PERSPECTIVES.some((p) => p.contentId === row.content.id && p.owner === VIEWER);
  const title = el('button', { type: 'button', class: 'pc-title' }, [row.content.title]);
  title.addEventListener('click', () => ctx.open({ kind: 'details', host: 'mobile', contentId: row.content.id }));
  const contested = cardMetrics(s).filter((id) => row.cells[id].contested);
  const drill = el('button', { type: 'button', class: 'drill-link' }, [row.visible ? `${row.visible} perspective${row.visible === 1 ? '' : 's'} ›` : 'No perspectives yet']);
  drill.disabled = !row.visible;
  drill.addEventListener('click', () => ctx.drill(row.content.id));
  return el('div', { class: `pcard${s.selected === row.content.id ? ' selected' : ''}` }, [
    el('div', { class: 'pc-top' }, [
      typeTile(row.content, 'thumb big'),
      el('div', { class: 'pc-text' }, [title, el('div', { class: 'pc-sub' }, [subline(row.content)])]),
      el('button', { type: 'button', class: `perspectize${mine ? ' mine' : ''}`, title: mine ? 'Edit your perspective' : 'Add a perspective' }, [mine ? '◉' : '+']),
    ]),
    el('div', { class: 'pc-metrics' }, cardMetrics(s).map((id) => metricTile(ctx, row, id))),
    el('div', { class: 'pc-foot' }, [
      contested.length ? el('span', { class: 'contested-pill' }, [`⚑ Contested: ${contested.map((id) => metric(id).label).join(', ')}`]) : el('span', {}),
      drill,
    ]),
  ]);
}

function perspectiveCard(ctx: Ctx, p: Perspective): HTMLElement {
  const c = contentById(p.contentId);
  const card = el('div', { class: 'pcard clickable', tabIndex: 0 }, [
    el('div', { class: 'pc-top' }, [
      typeTile(c, 'thumb big'),
      el('div', { class: 'pc-text' }, [
        el('span', { class: 'pc-title static' }, [c.title]),
        el('div', { class: 'pc-sub' }, [
          p.owner === VIEWER ? el('span', { class: 'you' }, ['you']) : p.owner,
          p.privacy === 'PRIVATE' ? ' 🔒' : '',
          ` · ${fmtDate(p.updatedAt)}`,
        ]),
      ]),
    ]),
    el('p', { class: 'pc-claim' }, [p.claim]),
    el('div', { class: 'pc-raw' }, [
      ...(['quality', 'agreement', 'importance', 'confidence'] as MetricId[]).map((id) =>
        el('span', { class: 'raw-pair' }, [el('span', { class: 'raw-k' }, [metric(id).label.slice(0, 4)]), rawValueNode(p, id)])
      ),
      feelingsNode(p),
    ]),
  ]);
  card.addEventListener('click', () => ctx.open({ kind: 'perspective', host: 'mobile', id: p.id }));
  return card;
}

function skeletonCards(): HTMLElement[] {
  return Array.from({ length: 4 }, () =>
    el('div', { class: 'pcard skel' }, [
      el('div', { class: 'pc-top' }, [el('span', { class: 'thumb big skel-block' }), el('div', { class: 'pc-text' }, [el('span', { class: 'skel-bar', style: 'width:80%' }), el('span', { class: 'skel-bar', style: 'width:45%' })])]),
      el('div', { class: 'pc-metrics' }, [el('span', { class: 'mtile skel-block' }), el('span', { class: 'mtile skel-block' }), el('span', { class: 'mtile skel-block' })]),
    ])
  );
}

function emptyCards(ctx: Ctx): HTMLElement {
  const { s } = ctx;
  const mineEmpty = s.page === 'perspectives' && s.pScope === 'mine' && s.dataState !== 'empty';
  const msg = s.dataState === 'error' ? 'Failed to load. Please try again.' : mineEmpty ? 'You haven’t written a perspective on this yet.' : 'Nothing matches these filters.';
  const btn = el('button', { type: 'button', class: 'btn' }, [s.dataState === 'error' ? 'Retry' : mineEmpty ? 'Show public perspectives' : 'Clear filters']);
  btn.addEventListener('click', () =>
    ctx.set((x) => {
      x.dataState = 'live';
      if (mineEmpty) x.pScope = 'public';
      else {
        x.filters = {};
        x.pFilters = {};
      }
    })
  );
  return el('div', { class: 'empty-state' }, [el('p', {}, [msg]), btn]);
}

export function renderMobile(ctx: Ctx): HTMLElement {
  const { s } = ctx;
  const list = el('div', { class: 'card-list' });
  let count = 0;
  if (s.dataState === 'loading') list.append(...skeletonCards());
  else if (s.dataState === 'error') list.append(emptyCards(ctx));
  else if (s.page === 'content') {
    const rows = visibleContentRows(s);
    count = rows.length;
    if (!rows.length) list.append(emptyCards(ctx));
    for (const r of rows) list.append(contentCard(ctx, r));
  } else {
    const ps = visiblePerspectives(s);
    count = ps.length;
    if (!ps.length) list.append(emptyCards(ctx));
    for (const p of ps) list.append(perspectiveCard(ctx, p));
  }
  const frame = el('div', { class: 'device mobile app', 'data-theme': s.theme, 'data-host': 'mobile' }, [
    el('div', { class: 'screen' }, [
      appNav(s, true),
      el('div', { class: 'm-head' }, [el('h1', {}, [s.pageName]), pageTabs(ctx), el('div', { class: 'm-scope' }, [scopeControl(ctx)])]),
      drillBanner(ctx),
      controlRow(ctx),
      chipsRow(ctx),
      list,
      bottomBar(ctx, count, true),
    ]),
    el('div', { class: 'overlay-layer', 'data-layer': 'mobile' }),
  ]);
  return frame;
}
