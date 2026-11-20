/**
 * Hover tooltips that look like the app's: one dark `.tip-surface` popover (CellPopover /
 * tooltipSpec), opened after a short delay, kept open while the pointer is on the anchor or the
 * popover. Clicking a cell pins it so the copy button can be used; Esc or a click elsewhere
 * closes it. Same behaviour as the Content Type Designer's tip layer, plus key/value rows.
 */
import { copyText, el } from './dom.js';
let layer = null;
let anchor = null;
let pinned = false;
let openTimer;
let closeTimer;
function ensureLayer() {
    if (layer)
        return layer;
    layer = el('div', { class: 'tip-surface', role: 'tooltip' });
    layer.hidden = true;
    layer.addEventListener('mouseenter', () => window.clearTimeout(closeTimer));
    layer.addEventListener('mouseleave', () => {
        if (!pinned)
            scheduleClose();
    });
    document.body.append(layer);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape')
            closeTip();
    });
    document.addEventListener('mousedown', (e) => {
        const t = e.target;
        if (pinned && layer && !layer.contains(t) && !anchor?.contains(t))
            closeTip();
    });
    window.addEventListener('scroll', () => {
        if (!pinned)
            closeTip();
        else if (anchor)
            place(anchor);
    }, true);
    return layer;
}
export function closeTip() {
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
    pinned = false;
    anchor?.classList.remove('tip-anchor');
    anchor = null;
    if (layer)
        layer.hidden = true;
}
function scheduleClose() {
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(closeTip, 140);
}
function place(target) {
    if (!layer)
        return;
    const r = target.getBoundingClientRect();
    const w = layer.offsetWidth;
    const h = layer.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    let top = r.bottom + 6;
    if (top + h > vh - 8 && r.top - h - 6 > 8)
        top = r.top - h - 6;
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    layer.style.top = `${top}px`;
    layer.style.left = `${left}px`;
}
function paint(content) {
    const surface = ensureLayer();
    const kids = [];
    if (content.title)
        kids.push(el('div', { class: 'tip-title' }, [content.title]));
    if (content.body?.length)
        kids.push(el('div', { class: 'tip-body' }, content.body.map((line) => el('p', {}, [line]))));
    if (content.rows?.length) {
        kids.push(el('dl', { class: 'tip-rows' }, content.rows.flatMap(([k, v]) => [el('dt', {}, [k]), el('dd', {}, [v])])));
    }
    if (content.copy !== undefined) {
        const status = el('span', { class: 'tip-status' }, [`copies “${content.copy}”`]);
        const btn = el('button', { type: 'button', title: 'Copy value' }, ['⧉ Copy']);
        btn.addEventListener('click', async () => {
            status.textContent = (await copyText(content.copy)) ? `Copied “${content.copy}”` : `Clipboard blocked here, would copy “${content.copy}”`;
        });
        kids.push(el('div', { class: 'tip-actions' }, [btn, status]));
    }
    if (content.action) {
        const { label, run } = content.action;
        const go = el('button', { type: 'button', class: 'tip-go' }, [label]);
        go.addEventListener('click', () => {
            closeTip();
            run();
        });
        kids.push(go);
    }
    if (content.meta?.length)
        kids.push(el('div', { class: 'tip-meta' }, content.meta.map((m) => el('div', {}, [m]))));
    if (pinned)
        kids.push(el('div', { class: 'tip-pin' }, ['Pinned: Esc or click elsewhere to close']));
    surface.replaceChildren(...kids);
    surface.hidden = false;
}
function open(target, build) {
    window.clearTimeout(closeTimer);
    anchor?.classList.remove('tip-anchor');
    anchor = target;
    target.classList.add('tip-anchor');
    paint(build());
    place(target);
}
/**
 * Give `target` an app-style popover. `pinOnClick` makes a click pin it open (cells, so the copy
 * button is reachable); headers keep their click for sorting.
 */
export function attachTip(target, build, opts = {}) {
    ensureLayer();
    target.addEventListener('mouseenter', () => {
        if (pinned)
            return;
        window.clearTimeout(openTimer);
        window.clearTimeout(closeTimer);
        openTimer = window.setTimeout(() => open(target, build), anchor ? 60 : 220);
    });
    target.addEventListener('mouseleave', () => {
        window.clearTimeout(openTimer);
        if (!pinned)
            scheduleClose();
    });
    target.addEventListener('focus', () => {
        if (!pinned)
            open(target, build);
    });
    target.addEventListener('blur', () => {
        if (!pinned)
            scheduleClose();
    });
    if (opts.pinOnClick) {
        target.addEventListener('click', (e) => {
            if (e.target.closest('a, button'))
                return;
            e.stopPropagation();
            pinned = true;
            open(target, build);
        });
    }
}
/** Open a tip immediately, pinned (used by screenshots and keyboard users). */
export function showTipNow(target, build, pin = false) {
    ensureLayer();
    pinned = pin;
    open(target, build);
}
//# sourceMappingURL=tip.js.map