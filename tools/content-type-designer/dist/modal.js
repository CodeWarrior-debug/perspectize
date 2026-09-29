/**
 * A mock of ActivityDetailsModal driven by a DetailsLayout and one sample row,
 * so a type's details view can be judged before any Svelte is written. Tiles
 * and sections carry the same popovers as grid cells; "Show field sources"
 * annotates every value with where it would come from.
 */
import { COLUMNS } from './catalog.js';
import { el } from './dom.js';
import { cellText } from './model.js';
import { attachTip, cellTipContent, closeTip } from './tip.js';
let showSources = false;
let openModal = null;
function onKey(e) {
    if (e.key === 'Escape' && openModal && !document.querySelector('.tip-surface:not([hidden])'))
        closeDetails();
}
export function closeDetails() {
    closeTip();
    openModal?.remove();
    openModal = null;
    document.removeEventListener('keydown', onKey);
}
function valueOf(row, ref) {
    const id = ref.col ?? ref.key;
    return id ? row[id] : undefined;
}
function listOf(value) {
    if (value === undefined)
        return [];
    if (typeof value !== 'string' && value.items)
        return value.items;
    return (cellText(value) ?? '').split(/;\s*/).map((s) => s.trim()).filter(Boolean);
}
function media(kind, title, accent, url) {
    if (kind === 'none')
        return null;
    const initials = title
        .split(/\s+/)
        .filter((w) => /^[\p{L}\p{N}]/u.test(w))
        .slice(0, 2)
        .map((w) => w[0])
        .join('');
    const caption = { poster: 'poster · w342', still: 'still · w300', thumb: 'hqdefault', icon: 'icon' }[kind];
    const tile = el('div', { class: `media media-${kind}` }, [
        el('span', { class: 'media-initials' }, [initials || '◎']),
        el('span', { class: 'media-caption' }, [caption])
    ]);
    tile.style.setProperty('--type-accent', accent);
    attachTip(tile, () => ({
        body: [url ? `Opens ${url} in a new tab` : 'Image placeholder — the real app loads it from the source'],
        meta: [`${kind === 'still' ? '16:9 still_path' : kind === 'poster' ? '2:3 poster_path' : kind} — placeholder in the planner`]
    }));
    return tile;
}
function tileView(tile, input) {
    const b = tile.col ? input.binding(tile.col) : undefined;
    const col = tile.col ? COLUMNS.find((c) => c.id === tile.col) : undefined;
    const label = tile.label ?? b?.label ?? col?.generic ?? tile.key ?? '';
    const value = valueOf(input.row, tile);
    const text = value !== undefined && typeof value !== 'string' && value.items ? value.items.join(', ') : cellText(value) ?? '—';
    const tooltip = tile.tooltip ?? b?.tooltip ?? col?.tooltip;
    const source = tile.source ?? b?.path ?? '';
    const node = el('div', { class: 'tile' }, [
        el('div', { class: 'tile-label' }, [label]),
        el('div', { class: 'tile-value' }, [text]),
        ...(showSources && source ? [el('div', { class: 'tile-source' }, [source])] : [])
    ]);
    if (tile.col && !b)
        node.classList.add('tile-unbound');
    attachTip(node, () => {
        const content = cellTipContent(value, label, [
            ...(tooltip ? [`Tooltip: ${tooltip}`] : []),
            ...(source ? [`Source: ${source}`] : [])
        ]);
        return { ...content, title: label };
    }, { pinOnClick: true });
    return node;
}
function sectionView(section, input) {
    const value = valueOf(input.row, section);
    if (value === undefined)
        return null;
    const b = section.col ? input.binding(section.col) : undefined;
    const source = section.source ?? b?.path ?? '';
    const head = el('div', { class: 'modal-label' }, [section.label]);
    const tooltip = section.tooltip ?? b?.tooltip;
    if (tooltip || source) {
        attachTip(head, () => ({ title: section.label, body: tooltip ? [tooltip] : [], meta: source ? [`Source: ${source}`] : [] }));
        head.classList.add('has-tip');
    }
    let body;
    if (section.kind === 'text') {
        body = el('div', { class: `modal-text${section.spoiler ? ' spoiler' : ''}`, tabIndex: section.spoiler ? 0 : -1 }, [cellText(value) ?? '']);
    }
    else if (section.kind === 'chips') {
        body = el('div', { class: 'modal-chips' }, listOf(value).map((v) => el('span', { class: 'mchip' }, [v])));
    }
    else if (section.kind === 'people') {
        body = el('div', { class: 'modal-people' }, listOf(value).map((entry) => {
            const [name, role] = entry.split(/\s+—\s+/);
            return el('div', { class: 'person' }, [
                el('span', { class: 'avatar' }, [name.split(' ').map((w) => w[0]).slice(0, 2).join('')]),
                el('span', {}, [el('strong', {}, [name]), ...(role ? [el('span', { class: 'muted' }, [` · ${role}`])] : [])])
            ]);
        }));
    }
    else {
        body = el('div', { class: 'modal-list' }, listOf(value).map((entry) => {
            const inApp = entry.endsWith('✓');
            const row = el('div', { class: `mrow${inApp ? ' in-app' : ''}` }, [
                el('span', {}, [entry.replace(/\s*✓$/, '')]),
                el('span', { class: 'mrow-action' }, [entry === '…' ? '' : inApp ? 'In Perspectize › open' : '+ Add'])
            ]);
            return row;
        }));
    }
    return el('div', { class: 'modal-section' }, [
        head,
        body,
        ...(showSources && source ? [el('div', { class: 'tile-source' }, [source])] : [])
    ]);
}
export function openDetails(input) {
    closeDetails();
    const { layout, row } = input;
    const title = cellText(row.item) ?? '(untitled)';
    const url = cellText(row[layout.link ?? 'url']);
    const close = el('button', { type: 'button', class: 'modal-close', title: 'Close' }, ['✕']);
    close.addEventListener('click', closeDetails);
    const sources = el('label', { class: 'modal-toggle' }, [
        el('input', { type: 'checkbox', checked: showSources }),
        el('span', {}, ['Show field sources'])
    ]);
    sources.querySelector('input').addEventListener('change', (e) => {
        showSources = e.target.checked;
        openDetails(input);
    });
    const hero = el('div', { class: 'modal-hero' });
    const m = media(layout.media, title, input.accent, url);
    if (m)
        hero.append(m);
    const crumbs = (layout.breadcrumb ?? []).map((k) => cellText(row[k])).filter(Boolean);
    const subtitle = layout.subtitle
        .map((s) => {
        const key = typeof s === 'string' ? s : s.key;
        const text = cellText(row[key]);
        return text && typeof s !== 'string' ? `${text} ${s.suffix}` : text;
    })
        .filter(Boolean)
        .join(' · ');
    hero.append(el('div', { class: 'modal-titles' }, [
        ...(crumbs.length ? [el('div', { class: 'crumbs' }, crumbs.flatMap((c, i) => [...(i ? [' › '] : []), el('a', { href: '#', class: 'crumb' }, [c])]))] : []),
        el('div', { class: 'modal-title' }, [title]),
        ...(layout.tagline && row[layout.tagline] ? [el('div', { class: 'tagline' }, [cellText(row[layout.tagline])])] : []),
        ...(subtitle ? [el('div', { class: 'modal-sub' }, [subtitle])] : [])
    ]));
    for (const a of Array.from(hero.querySelectorAll('a.crumb')))
        a.addEventListener('click', (e) => e.preventDefault());
    const links = el('div', { class: 'modal-links' });
    if (url)
        links.append(el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, [`↗ ${url}`]));
    for (const l of layout.links ?? []) {
        const id = cellText(row[l.key]);
        if (id)
            links.append(el('a', { href: `${l.prefix ?? ''}${id}`, target: '_blank', rel: 'noopener noreferrer', class: 'pill-link' }, [`${l.label} ↗`]));
    }
    const tiles = el('div', { class: 'tiles' }, layout.tiles.map((t) => tileView(t, input)));
    const actions = el('div', { class: 'modal-actions' }, layout.actions.map((a) => el('button', { type: 'button', class: 'outline' }, [a])));
    const footer = el('div', { class: 'modal-footer' }, [
        el('div', {}, [
            el('div', { class: 'modal-label' }, ['Last updated in Perspectize']),
            el('div', {}, [cellText(row.updatedAt) ?? cellText(row.createdAt) ?? '—'])
        ]),
        actions
    ]);
    const sections = layout.sections.map((s) => sectionView(s, input)).filter(Boolean);
    const nav = [];
    if (layout.prevNext) {
        const [p, n] = layout.prevNext;
        nav.push(el('div', { class: 'modal-nav' }, [
            el('button', { type: 'button', class: 'outline', disabled: !row[p] }, [row[p] ? `‹ ${cellText(row[p])}` : '‹ first']),
            el('button', { type: 'button', class: 'outline', disabled: !row[n] }, [row[n] ? `${cellText(row[n])} ›` : 'last ›'])
        ]));
    }
    const attribution = layout.attribution
        ? [el('div', { class: 'attribution' }, [el('span', { class: 'tmdb-mark' }, ['TMDB']), el('span', {}, [layout.attribution])])]
        : [];
    const notes = layout.notes?.length
        ? [
            el('div', { class: 'design-notes' }, [
                el('div', { class: 'modal-label' }, ['Design notes (planner only)']),
                el('ul', {}, layout.notes.map((n) => el('li', {}, [n])))
            ])
        ]
        : [];
    const dialog = el('div', { class: 'modal', role: 'dialog', ariaModal: 'true', ariaLabel: `${input.typeLabel} details` }, [
        el('div', { class: 'modal-head' }, [el('span', {}, [layout.heading]), el('span', { class: 'modal-head-right' }, [sources, close])]),
        el('div', { class: 'modal-body' }, [hero, links, tiles, footer, ...sections, ...nav, ...attribution, ...notes])
    ]);
    const backdrop = el('div', { class: 'modal-backdrop' }, [dialog]);
    backdrop.addEventListener('mousedown', (e) => {
        if (e.target === backdrop)
            closeDetails();
    });
    document.body.append(backdrop);
    openModal = backdrop;
    document.addEventListener('keydown', onKey);
    close.focus();
}
//# sourceMappingURL=modal.js.map