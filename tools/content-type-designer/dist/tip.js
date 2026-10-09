/**
 * Hover tooltips that look like the app's: one dark `.tip-surface` popover
 * (CellPopover / tooltipSpec), opened after a short delay, kept open while the
 * pointer is on the anchor or the popover. Clicking a cell pins it so the copy
 * button can be used; Esc or a click elsewhere closes it.
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
    const body = el('div', { class: `tip-body${content.spoiler ? ' spoiler' : ''}` });
    for (const line of content.body ?? [])
        body.append(el('p', {}, [line]));
    if (body.childElementCount)
        kids.push(body);
    if (content.items?.length) {
        const boxes = [];
        const list = el('div', { class: 'tip-items' });
        for (const item of content.items) {
            const box = el('input', { type: 'checkbox' });
            boxes.push(box);
            list.append(el('label', {}, [box, el('span', {}, [item])]));
        }
        const status = el('span', { class: 'tip-status' });
        const copySelected = el('button', { type: 'button' }, ['Copy selected']);
        const copyAll = el('button', { type: 'button' }, ['Copy all']);
        const run = async (values) => {
            if (!values.length) {
                status.textContent = 'Nothing selected';
                return;
            }
            const text = values.join(', ');
            status.textContent = (await copyText(text)) ? `Copied: ${text}` : `Would copy: ${text}`;
        };
        copySelected.addEventListener('click', () => run(content.items.filter((_, i) => boxes[i].checked)));
        copyAll.addEventListener('click', () => run(content.items));
        kids.push(list, el('div', { class: 'tip-actions' }, [copySelected, copyAll, status]));
    }
    else if (content.copy !== undefined) {
        const status = el('span', { class: 'tip-status' }, [`copies “${content.copy}”`]);
        const btn = el('button', { type: 'button', title: 'Copy raw value' }, ['⧉ Copy']);
        btn.addEventListener('click', async () => {
            status.textContent = (await copyText(content.copy)) ? `Copied “${content.copy}”` : `Clipboard blocked here — would copy “${content.copy}”`;
        });
        kids.push(el('div', { class: 'tip-actions' }, [btn, status]));
    }
    if (content.meta?.length) {
        kids.push(el('div', { class: 'tip-meta' }, content.meta.map((m) => el('div', {}, [m]))));
    }
    if (pinned)
        kids.push(el('div', { class: 'tip-pin' }, ['Pinned — Esc or click elsewhere to close']));
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
 * Give `target` an app-style popover. `pinOnClick` makes a click pin it open
 * (cells, so the copy button is reachable); headers keep their click for sorting.
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
    if (opts.pinOnClick) {
        target.addEventListener('click', (e) => {
            if (e.target.closest('a, button, .title-link, .media'))
                return;
            pinned = true;
            open(target, build);
        });
    }
}
/** Popover content for a sample cell: its tip (or text), copy value or checklist, plus planner notes. */
export function cellTipContent(value, header, meta) {
    if (value === undefined)
        return { title: header, body: ['No sample value for this row.'], meta };
    if (typeof value === 'string')
        return { body: [value], copy: value, meta };
    const body = [value.tip ?? value.text];
    if (!value.tip && value.sub)
        body.push(value.sub);
    return value.items ? { title: header, items: value.items, meta } : { body, copy: value.copy ?? value.text, meta };
}
//# sourceMappingURL=tip.js.map