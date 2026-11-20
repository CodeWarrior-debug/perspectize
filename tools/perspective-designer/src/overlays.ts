/**
 * Menus, dialogs and bottom sheets. Desktop gets an anchored aggregator menu and filter popover
 * plus centred dialogs (ColumnPickerDialog / SortPickerDialog look); mobile gets the same content
 * as bottom sheets. Overlays live in the state so they survive the re-render a choice triggers.
 */
import { contentRows } from './aggregate.js';
import { cellTip, fmtDate } from './cells.js';
import type { Ctx, Overlay } from './ctx.js';
import { el } from './dom.js';
import { PERSPECTIVES, TYPE_META, VIEWER, contentById } from './fixture.js';
import { METRICS, aggregator, aggregatorsFor, fmtRating, metric, minNFor, type AggregatorId, type MetricId } from './registry.js';
import { CONTENT_COLS, DEFAULT_COLS, DEFAULT_PCOLS, PERSPECTIVE_COLS, colDef, type Page, type SortSpec, type State } from './state.js';

function closeBtn(ctx: Ctx): HTMLElement {
  const b = el('button', { type: 'button', class: 'x', 'aria-label': 'Close' }, ['×']);
  b.addEventListener('click', () => ctx.open(null));
  return b;
}

function shell(ctx: Ctx, o: Overlay, title: string, body: (HTMLElement | null)[], footer?: HTMLElement[]): HTMLElement {
  const sheet = o.host === 'mobile';
  const box = el('div', { class: sheet ? 'sheet' : 'dialog', role: 'dialog', 'aria-label': title }, [
    sheet ? el('div', { class: 'grabber' }) : null,
    el('div', { class: 'dlg-head' }, [el('h2', {}, [title]), closeBtn(ctx)]),
    el('div', { class: 'dlg-body' }, body),
    footer ? el('div', { class: 'dlg-foot' }, footer) : null,
  ]);
  const backdrop = el('div', { class: `backdrop${sheet ? ' sheet-backdrop' : ''}` }, [box]);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) ctx.open(null);
  });
  return backdrop;
}

function done(ctx: Ctx): HTMLElement {
  const b = el('button', { type: 'button', class: 'btn primary' }, ['Done']);
  b.addEventListener('click', () => ctx.open(null));
  return b;
}

// ---------------------------------------------------------------------------
// Aggregator choice (header menu, metrics sheet, sort rows)
// ---------------------------------------------------------------------------

function aggOptions(ctx: Ctx, id: MetricId, compact: boolean): HTMLElement {
  const { s } = ctx;
  return el(
    'div',
    { class: compact ? 'agg-chips' : 'agg-list', role: 'menu' },
    aggregatorsFor(metric(id), s.policy).map((a) => {
      const on = s.aggs[id] === a.id;
      const min = minNFor(a, s.policy);
      const b = compact
        ? el('button', { type: 'button', class: `chip-opt${on ? ' on' : ''}`, role: 'menuitemradio', 'aria-checked': String(on) }, [a.chip])
        : el('button', { type: 'button', class: `menu-item${on ? ' on' : ''}`, role: 'menuitemradio', 'aria-checked': String(on) }, [
            el('span', { class: 'check' }, [on ? '✓' : '']),
            el('span', { class: 'mi-text' }, [el('span', { class: 'mi-label' }, [a.label]), el('span', { class: 'mi-desc' }, [a.describe])]),
            el('span', { class: 'mi-badge', title: 'Minimum contributors before a value shows' }, [s.scope === 'mine' ? '' : min > 1 ? `n≥${min}` : 'always']),
          ]);
      b.addEventListener('click', () => ctx.set((x) => void (x.aggs[id] = a.id)));
      return b;
    })
  );
}

function setAllRow(ctx: Ctx): HTMLElement {
  const { s } = ctx;
  return el('div', { class: 'set-all' }, [
    el('span', { class: 'muted small' }, ['Set for all columns (each column still shows and sorts by one)']),
    el(
      'div',
      { class: 'agg-chips' },
      aggregatorsFor(metric('quality'), s.policy).map((a) => {
        const on = METRICS.every((m) => s.aggs[m.id] === a.id);
        const b = el('button', { type: 'button', class: `chip-opt${on ? ' on' : ''}` }, [a.chip]);
        b.addEventListener('click', () => ctx.set((x) => METRICS.forEach((m) => (x.aggs[m.id] = a.id))));
        return b;
      })
    ),
  ]);
}

function aggMenu(ctx: Ctx, id: MetricId): HTMLElement {
  return el('div', { class: 'menu anchored', 'data-anchor-for': `agg-${id}` }, [
    el('div', { class: 'menu-title' }, [`${metric(id).label}: show`]),
    aggOptions(ctx, id, false),
    el('div', { class: 'menu-sep' }),
    setAllRow(ctx),
  ]);
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function rangeInputs(s: State, page: Page, id: MetricId): { row: HTMLElement; read: () => { min: number | null; max: number | null } | null } {
  const cur = (page === 'content' ? s.filters : s.pFilters)[id];
  const mk = (v: number | null | undefined, ph: string) =>
    el('input', { type: 'number', min: '0', max: '10', step: '0.5', value: v === null || v === undefined ? '' : String(v), placeholder: ph, class: 'num-input' });
  const lo = mk(cur?.min, '0');
  const hi = mk(cur?.max, '10');
  const label = page === 'content' ? `${metric(id).label} · ${aggregator(s.aggs[id]).chip}` : metric(id).label;
  return {
    row: el('div', { class: 'range-row' }, [el('span', { class: 'range-label' }, [label]), lo, el('span', { class: 'muted' }, ['to']), hi]),
    read: () => {
      const a = lo.value === '' ? null : Number(lo.value);
      const b = hi.value === '' ? null : Number(hi.value);
      return a === null && b === null ? null : { min: a, max: b };
    },
  };
}

function applyFilter(ctx: Ctx, page: Page, id: MetricId, f: { min: number | null; max: number | null } | null) {
  ctx.set((x) => {
    const target = page === 'content' ? x.filters : x.pFilters;
    if (f) target[id] = f;
    else delete target[id];
  });
}

function filterPopover(ctx: Ctx, page: Page, id: MetricId): HTMLElement {
  const { row, read } = rangeInputs(ctx.s, page, id);
  const apply = el('button', { type: 'button', class: 'btn primary' }, ['Apply']);
  const clear = el('button', { type: 'button', class: 'btn' }, ['Clear']);
  apply.addEventListener('click', () => {
    applyFilter(ctx, page, id, read());
    ctx.open(null);
  });
  clear.addEventListener('click', () => {
    applyFilter(ctx, page, id, null);
    ctx.open(null);
  });
  return el('div', { class: 'menu anchored filter-pop', 'data-anchor-for': `filter-${id}` }, [
    el('div', { class: 'menu-title' }, ['Between (0–10)']),
    row,
    el('p', { class: 'muted small' }, [page === 'content' ? 'Filters the value shown. Hidden and empty cells never match.' : 'A perspective that left this blank never matches.']),
    el('div', { class: 'row-end' }, [clear, apply]),
  ]);
}

function filterSheet(ctx: Ctx, o: Overlay & { kind: 'filterSheet' }): HTMLElement {
  const ids = METRICS.map((m) => m.id);
  const inputs = ids.map((id) => ({ id, ...rangeInputs(ctx.s, o.page, id) }));
  const apply = el('button', { type: 'button', class: 'btn primary' }, ['Apply']);
  apply.addEventListener('click', () => {
    ctx.set((x) => {
      const target = o.page === 'content' ? x.filters : x.pFilters;
      for (const i of inputs) {
        const f = i.read();
        if (f) target[i.id] = f;
        else delete target[i.id];
      }
    });
    ctx.open(null);
  });
  return shell(ctx, o, 'Filter', [...inputs.map((i) => i.row), el('p', { class: 'muted small' }, ['Hidden and empty values never match a range.'])], [apply]);
}

// ---------------------------------------------------------------------------
// Columns, sorts, measures
// ---------------------------------------------------------------------------

function columnsDialog(ctx: Ctx, o: Overlay & { kind: 'columns' }): HTMLElement {
  const { s } = ctx;
  const defs = o.page === 'content' ? CONTENT_COLS : PERSPECTIVE_COLS;
  const chosen = o.page === 'content' ? s.cols : s.pCols;
  const groups = [...new Set(defs.filter((d) => d.picker).map((d) => d.group))];
  const body = groups.map((g) =>
    el('fieldset', { class: 'pick-group' }, [
      el('legend', {}, [g]),
      ...defs
        .filter((d) => d.picker && d.group === g)
        .map((d) => {
          const box = el('input', { type: 'checkbox', checked: chosen.includes(d.id) });
          box.addEventListener('change', () =>
            ctx.set((x) => {
              const list = o.page === 'content' ? x.cols : x.pCols;
              const next = box.checked ? [...list, d.id] : list.filter((c) => c !== d.id);
              const order = defs.map((c) => c.id);
              next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
              if (o.page === 'content') x.cols = next;
              else x.pCols = next;
            })
          );
          return el('label', { class: 'pick' }, [box, el('span', {}, [d.label]), d.kind === 'metric' ? el('span', { class: 'muted small' }, [`· ${aggregator(s.aggs[d.id as MetricId]).chip}`]) : null]);
        }),
    ])
  );
  const def = o.page === 'content' ? DEFAULT_COLS : DEFAULT_PCOLS;
  const custom = chosen.join() !== def.join();
  const reset = el('button', { type: 'button', class: 'btn small' }, ['Reset to default columns']);
  reset.addEventListener('click', () => ctx.set((x) => (o.page === 'content' ? (x.cols = [...DEFAULT_COLS]) : (x.pCols = [...DEFAULT_PCOLS]))));
  const hint = el('div', { class: `layout-hint${custom ? ' custom' : ''}` }, [
    el('span', {}, [custom ? 'Your custom columns for this view are saved.' : 'Showing the default columns for this view. Changes are saved for next time.']),
    custom ? reset : null,
  ]);
  return shell(ctx, o, 'Columns', [el('p', { class: 'muted small' }, ['One column per measure; its aggregator is chosen on the column itself.']), ...body, hint], [done(ctx)]);
}

function sortRows(ctx: Ctx, page: Page): HTMLElement {
  const { s } = ctx;
  const sorts = page === 'content' ? s.sorts : s.pSorts;
  const defs = (page === 'content' ? CONTENT_COLS : PERSPECTIVE_COLS).filter((d) => d.sortable);
  const commit = (next: SortSpec[]) => ctx.set((x) => (page === 'content' ? (x.sorts = next) : (x.pSorts = next)));
  const rows = sorts.map((sp, i) => {
    const used = new Set(sorts.map((x) => x.col));
    const select = el(
      'select',
      { class: 'grow-select', 'aria-label': `Sort column ${i + 1}` },
      defs.filter((d) => d.id === sp.col || !used.has(d.id)).map((d) => el('option', { value: d.id, selected: d.id === sp.col }, [d.label]))
    );
    select.addEventListener('change', () => commit(sorts.map((x, j) => (j === i ? { ...x, col: select.value } : x))));
    const isMetric = page === 'content' && colDef(page, sp.col).kind === 'metric';
    const aggSel = isMetric
      ? el(
          'select',
          { class: 'agg-select', 'aria-label': 'Aggregator' },
          aggregatorsFor(metric(sp.col as MetricId), s.policy).map((a) => el('option', { value: a.id, selected: s.aggs[sp.col as MetricId] === a.id }, [a.chip]))
        )
      : null;
    aggSel?.addEventListener('change', () => ctx.set((x) => void (x.aggs[sp.col as MetricId] = aggSel.value as AggregatorId)));
    const dir = el('button', { type: 'button', class: 'btn small' }, [sp.dir === 'asc' ? '↑ Asc' : '↓ Desc']);
    dir.addEventListener('click', () => commit(sorts.map((x, j) => (j === i ? { ...x, dir: x.dir === 'asc' ? 'desc' : 'asc' } : x))));
    const up = el('button', { type: 'button', class: 'icon-btn', disabled: i === 0, 'aria-label': 'Move up' }, ['▴']);
    up.addEventListener('click', () => {
      const n = [...sorts];
      [n[i - 1], n[i]] = [n[i], n[i - 1]];
      commit(n);
    });
    const rm = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove' }, ['×']);
    rm.addEventListener('click', () => commit(sorts.filter((_, j) => j !== i)));
    return el('div', { class: 'sort-row' }, [el('span', { class: 'muted' }, [String(i + 1)]), select, aggSel, dir, up, rm]);
  });
  const free = defs.filter((d) => !sorts.some((x) => x.col === d.id));
  const add = el('button', { type: 'button', class: 'btn dashed' }, ['+ Add sort column']);
  add.disabled = !free.length;
  add.addEventListener('click', () => commit([...sorts, { col: free[0].id, dir: 'desc' }]));
  return el('div', { class: 'sort-rows' }, [
    sorts.length ? null : el('p', { class: 'muted center' }, ['No sort applied: showing default order.']),
    ...rows,
    add,
    page === 'content' ? el('p', { class: 'muted small' }, ['A rating sorts by the aggregator its column shows; changing it here changes the column too. Hidden values always sort last.']) : null,
  ]);
}

function metricsSheet(ctx: Ctx, o: Overlay): HTMLElement {
  const { s } = ctx;
  const rows = METRICS.map((m) => {
    const box = el('input', { type: 'checkbox', checked: s.cols.includes(m.id) });
    box.addEventListener('change', () =>
      ctx.set((x) => {
        const order = CONTENT_COLS.map((c) => c.id);
        x.cols = box.checked ? [...x.cols, m.id].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : x.cols.filter((c) => c !== m.id);
      })
    );
    return el('div', { class: 'measure-row' }, [el('label', { class: 'pick' }, [box, el('span', {}, [m.label])]), aggOptions(ctx, m.id, true)]);
  });
  return shell(
    ctx,
    o,
    'Measures',
    [
      el('p', { class: 'muted small' }, ['Cards show the sorted measure first, then the first ticked ones, up to three. Each measure keeps its own aggregator, as a column does on desktop.']),
      setAllRow(ctx),
      ...rows,
    ],
    [done(ctx)]
  );
}

function cellSheet(ctx: Ctx, o: Overlay & { kind: 'cellSheet' }): HTMLElement {
  const { s } = ctx;
  const row = contentRows(s.scope, s.policy, s.aggs).find((r) => r.content.id === o.contentId)!;
  const cell = row.cells[o.metric];
  const tip = cellTip(row, cell, s.policy, s.scope);
  const sortBtn = el('button', { type: 'button', class: 'btn' }, ['Sort by this']);
  sortBtn.addEventListener('click', () => {
    ctx.set((x) => void (x.sorts = [{ col: o.metric, dir: 'desc' }]));
    ctx.open(null);
  });
  const measure = el('button', { type: 'button', class: 'btn' }, ['Change measure']);
  measure.addEventListener('click', () => ctx.open({ kind: 'metricsSheet', host: 'mobile' }));
  const drill = el('button', { type: 'button', class: 'btn primary', disabled: !row.visible }, ['See perspectives']);
  drill.addEventListener('click', () => ctx.drill(row.content.id));
  return shell(
    ctx,
    o,
    `${metric(o.metric).label} · ${aggregator(s.aggs[o.metric]).label}`,
    [
      el('div', { class: 'sheet-sub' }, [row.content.title]),
      el('div', { class: 'tip-surface inline' }, [
        el('div', { class: 'tip-title' }, [tip.title ?? '']),
        ...(tip.body ?? []).map((b) => el('p', {}, [b])),
        el('dl', { class: 'tip-rows' }, (tip.rows ?? []).flatMap(([k, v]) => [el('dt', {}, [k]), el('dd', {}, [v])])),
      ]),
    ],
    [sortBtn, measure, drill]
  );
}

// ---------------------------------------------------------------------------
// Details and perspective views
// ---------------------------------------------------------------------------

function detailsModal(ctx: Ctx, o: Overlay & { kind: 'details' }): HTMLElement {
  const { s } = ctx;
  const c = contentById(o.contentId);
  const row = contentRows('public', s.policy, s.aggs).find((r) => r.content.id === c.id)!;
  const q = row.cells.quality;
  const tiles = [
    ['Perspectives you can open', `${row.visible} of ${row.total}`],
    ['Average quality', q.state === 'value' && q.mean !== null ? `${fmtRating(q.mean)} (n ${q.n})` : q.state === 'hidden' ? `hidden, n ${q.n}` : '—'],
    ['Type', TYPE_META[c.type].label],
    ['Creator', c.creator || '—'],
  ];
  const drill = el('button', { type: 'button', class: 'btn primary', disabled: !row.visible }, [`Open its perspectives in ${s.pageName}`]);
  drill.addEventListener('click', () => ctx.drill(c.id));
  return shell(
    ctx,
    o,
    'Library details',
    [
      el('div', { class: 'det-title' }, [c.title]),
      el('div', { class: 'tiles' }, tiles.map(([k, v]) => el('div', { class: 'tile' }, [el('div', { class: 'tile-k' }, [k]), el('div', { class: 'tile-v' }, [v])]))),
      el('p', { class: 'muted small' }, ['Mock of ActivityDetailsModal: the content cell on both pages links here, back into the Library.']),
    ],
    [drill]
  );
}

function perspectiveModal(ctx: Ctx, o: Overlay & { kind: 'perspective' }): HTMLElement {
  const p = PERSPECTIVES.find((x) => x.id === o.id)!;
  const c = contentById(p.contentId);
  const ratings = METRICS.map((m) => {
    const v = m.read(p);
    return el('div', { class: 'tile' }, [el('div', { class: 'tile-k' }, [m.label]), el('div', { class: 'tile-v' }, [v === null ? '—' : fmtRating(v)])]);
  });
  const details = el('button', { type: 'button', class: 'btn' }, ['Content details']);
  details.addEventListener('click', () => ctx.open({ kind: 'details', host: o.host, contentId: c.id }));
  const compare = p.owner !== VIEWER ? el('button', { type: 'button', class: 'btn primary', title: 'Opens Compare with this owner on this content' }, [`Compare with ${p.owner}`]) : null;
  return shell(
    ctx,
    o,
    'Perspective',
    [
      el('div', { class: 'sheet-sub' }, [c.title]),
      el('blockquote', { class: 'claim big' }, [p.claim]),
      el('div', { class: 'muted small' }, [
        `${p.owner === VIEWER ? 'You' : p.owner} · ${p.privacy === 'PUBLIC' ? 'Public' : 'Private'} · created ${fmtDate(p.createdAt)} · updated ${fmtDate(p.updatedAt)}`,
      ]),
      el('div', { class: 'tiles three' }, ratings),
      p.feelings.length ? el('div', { class: 'feel-list' }, p.feelings.map((f) => el('span', { class: 'mchip' }, [`${f.emoji} ${f.label} · ${fmtRating(f.intensity)}`]))) : null,
    ],
    [details, ...(compare ? [compare] : [])]
  );
}

// ---------------------------------------------------------------------------

export function renderOverlay(ctx: Ctx, frame: HTMLElement): void {
  const o = ctx.overlay;
  const layer = frame.querySelector<HTMLElement>('.overlay-layer');
  if (!layer || !o || frame.dataset.host !== o.host) return;
  let node: HTMLElement;
  switch (o.kind) {
    case 'aggMenu':
      node = aggMenu(ctx, o.metric);
      break;
    case 'filter':
      node = o.host === 'mobile' ? filterSheet(ctx, { kind: 'filterSheet', host: 'mobile', page: o.page }) : filterPopover(ctx, o.page, o.metric);
      break;
    case 'filterSheet':
      node = filterSheet(ctx, o);
      break;
    case 'columns':
      node = columnsDialog(ctx, o);
      break;
    case 'sort':
      node = shell(ctx, o, 'Sort by', [el('p', { class: 'muted small' }, ['Stack multiple columns: the first row is the primary sort, later rows break ties.']), sortRows(ctx, o.page)], [done(ctx)]);
      break;
    case 'metricsSheet':
      node = metricsSheet(ctx, o);
      break;
    case 'cellSheet':
      node = cellSheet(ctx, o);
      break;
    case 'details':
      node = detailsModal(ctx, o);
      break;
    case 'perspective':
      node = perspectiveModal(ctx, o);
      break;
  }
  layer.append(node);
  const anchored = node.matches('.anchored') ? node : null;
  if (anchored) {
    const catcher = el('div', { class: 'click-catcher' });
    catcher.addEventListener('click', () => ctx.open(null));
    layer.prepend(catcher);
    const a = frame.querySelector<HTMLElement>(`[data-anchor="${anchored.dataset.anchorFor}"]`);
    if (a) {
      const fr = frame.getBoundingClientRect();
      const ar = a.getBoundingClientRect();
      const w = anchored.offsetWidth;
      anchored.style.top = `${ar.bottom - fr.top + 4}px`;
      anchored.style.left = `${Math.max(8, Math.min(ar.right - fr.left - w, fr.width - w - 8))}px`;
      a.classList.add('open');
    }
  }
}
