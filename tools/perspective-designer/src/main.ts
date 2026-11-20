/**
 * Entry point: holds the state, re-renders on every change, and places the open overlay in its
 * device frame. Deterministic: no network, no storage, no clock (dates come from the fixture).
 */
import { renderMobile } from './cards.js';
import type { Ctx, Overlay } from './ctx.js';
import { el } from './dom.js';
import { renderDesktop } from './grid.js';
import { renderOverlay } from './overlays.js';
import { contract, controls, decisions, policySummary, readouts, scenarios, widthBudget } from './panels.js';
import { initialState, tierOf, type State } from './state.js';
import { closeTip } from './tip.js';

const state: State = initialState();
let overlay: Overlay | null = null;

const ctx: Ctx = {
  s: state,
  get overlay() {
    return overlay;
  },
  set(fn) {
    fn(state);
    render();
  },
  open(o) {
    overlay = o;
    render();
  },
  drill(contentId) {
    overlay = null;
    state.page = 'perspectives';
    state.contentFilter = contentId;
    // A drill-down is about other people's views of one item, so it opens on Public.
    state.pScope = 'public';
    state.selected = contentId;
    render();
  },
};

function render(): void {
  closeTip();
  // Keep each frame's scroll position across the re-render.
  const scroll = new Map<string, { left: number; top: number }>();
  document.querySelectorAll<HTMLElement>('.device').forEach((d) => {
    const g = d.querySelector<HTMLElement>('.grid-scroll, .screen');
    if (g) scroll.set(d.dataset.host ?? '', { left: g.scrollLeft, top: g.scrollTop });
  });

  document.getElementById('controls')!.replaceChildren(controls(ctx), scenarios(ctx));

  const frames: HTMLElement[] = [];
  if (state.viewport !== 'mobile') frames.push(renderDesktop(ctx));
  if (state.viewport !== 'desktop') frames.push(renderMobile(ctx));
  const stage = document.getElementById('stage')!;
  stage.className = `stage vp-${state.viewport}`;
  stage.replaceChildren(
    ...frames.map((f) =>
      el('figure', { class: `frame-wrap ${f.dataset.host}` }, [el('figcaption', {}, [f.dataset.host === 'desktop' ? `Desktop · ${tierOf(state.deskWidth)} tier · grid ${state.deskWidth}px` : 'Mobile · 390 × 780 · card mode']), f])
    ),
    el('p', { class: 'policy-line muted small' }, [policySummary(state)])
  );
  for (const f of frames) {
    const saved = scroll.get(f.dataset.host ?? '');
    const g = f.querySelector<HTMLElement>('.grid-scroll, .screen');
    if (g && saved) {
      g.scrollTop = saved.top;
      g.scrollLeft = saved.left;
    }
    renderOverlay(ctx, f);
  }

  document.getElementById('panels')!.replaceChildren(readouts(ctx), widthBudget(ctx), decisions(ctx), contract());
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay) ctx.open(null);
});

/** Hook for the screenshot script and for poking at states from the console. */
(window as unknown as { __pd: Ctx }).__pd = ctx;

render();
