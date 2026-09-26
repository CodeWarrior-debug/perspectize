import { COLUMNS, GROUP_LABELS, TYPES } from './catalog.js';
import { detect } from './detect.js';
import { buildMatrix, buildSpec } from './emit.js';
import { THUMBS } from './thumbs.js';
import { bindingFor, gapText, previewRowsFor, profileFor, resolveGrid, samplesFor, sortConflict, sortValue, typeLabel, unitsFor } from './model.js';
const STORAGE_KEY = 'perspectize.content-type-designer.v1';
/** Seed the type currently being designed, so a fresh open / reset lands on a filled-in form. */
const DEFAULT_SEED = 'bible';
function seededState(typeId) {
    const state = blankState();
    const t = TYPES.find((x) => x.id === typeId);
    if (!t)
        return state;
    state.draft = { ...t, id: 'draft' };
    state.seed = t.id;
    state.decisions = {};
    for (const col of COLUMNS) {
        const binding = col.bindings[t.id];
        if (binding)
            state.decisions[col.id] = { ...binding };
    }
    state.selected = ['draft'];
    return state;
}
function blankState() {
    return {
        draft: {
            id: 'draft',
            label: '',
            plural: '',
            enumValue: '',
            gist: '',
            ingestion: 'manual',
            enrichment: 'none',
            urlRequired: false,
            urlPattern: '',
            identity: '',
            icon: '',
            accent: '#3B6FD4',
            sharesUrlSpace: true,
            thumbnail: ''
        },
        decisions: {},
        selected: ['youtube'],
        rule: 'majority',
        deviations: '',
        testingNotes: ''
    };
}
let state = load() ?? seededState(DEFAULT_SEED);
function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (!parsed.draft || !parsed.decisions)
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch {
        /* private browsing — the form still works, it just will not persist */
    }
}
function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (k === 'class')
            node.className = String(v);
        else
            node[k] = v;
    }
    for (const c of children)
        node.append(c);
    return node;
}
function field(label, control, hint) {
    return el('label', { class: 'field' }, [
        el('span', { class: 'field-label' }, [label]),
        control,
        ...(hint ? [el('span', { class: 'hint' }, [hint])] : [])
    ]);
}
function input(value, onChange, placeholder = '') {
    const node = el('input', { value, placeholder });
    node.addEventListener('input', () => {
        onChange(node.value);
        save();
        renderDerived();
    });
    return node;
}
function select(value, options, onChange, labels) {
    const node = el('select');
    for (const opt of options) {
        node.append(el('option', { value: opt, selected: opt === value }, [labels?.[opt] ?? opt]));
    }
    node.addEventListener('change', () => {
        onChange(node.value);
        save();
        render();
    });
    return node;
}
function checkbox(checked, onChange, label) {
    const box = el('input', { type: 'checkbox', checked });
    box.addEventListener('change', () => {
        onChange(box.checked);
        save();
        render();
    });
    return el('label', { class: 'checkline' }, [box, el('span', {}, [label])]);
}
/* ---------------------------------------------------------------- sections */
function renderIdentity() {
    const d = state.draft;
    const seed = el('select', { class: 'seed' });
    seed.append(el('option', { value: '' }, ['Start from scratch, or seed from…']));
    for (const t of TYPES)
        seed.append(el('option', { value: t.id }, [t.label]));
    seed.addEventListener('change', () => {
        const t = TYPES.find((x) => x.id === seed.value);
        if (!t)
            return;
        state.draft = { ...t, id: 'draft' };
        state.seed = t.id;
        state.decisions = {};
        for (const col of COLUMNS) {
            const b = col.bindings[t.id];
            if (b)
                state.decisions[col.id] = { ...b };
        }
        save();
        render();
    });
    return section('1 · Identity', 'What is one row of this type?', [
        seed,
        grid2([
            field('Label', input(d.label, (v) => (d.label = v), 'Movie')),
            field('Plural', input(d.plural, (v) => (d.plural = v), 'Movies')),
            field('Enum value', input(d.enumValue, (v) => (d.enumValue = v.toUpperCase()), 'MOVIE'), 'UPPERCASE in Go/GraphQL, lowercased in the DB by the mapper.'),
            field('Type icon', input(d.icon, (v) => (d.icon = v), 'film')),
            field('Accent colour', input(d.accent, (v) => (d.accent = v), '#0F9D8C')),
            field('Thumbnail strategy', input(d.thumbnail, (v) => (d.thumbnail = v), 'poster image, or a text tile')),
            field('One row is…', input(d.gist, (v) => (d.gist = v), 'A feature film, independent of where it is watched.'))
        ])
    ]);
}
function renderIngestion() {
    const d = state.draft;
    return section('2 · Ingestion & enrichment', 'Where do the values come from, and what makes two rows the same row?', [
        grid2([
            field('Ingestion method', select(d.ingestion, ['api', 'scrape', 'manual', 'url-only', 'internal'], (v) => (d.ingestion = v), {
                api: 'External API',
                scrape: 'Scrape the page',
                manual: 'Manual entry only',
                'url-only': 'URL only, no enrichment',
                internal: 'References existing content'
            })),
            field('Enrichment source', input(d.enrichment, (v) => (d.enrichment = v), 'TMDB /movie/{id}'), 'Name the exact endpoint — it decides the adapter and the API key.'),
            field('Accepted URL shapes', input(d.urlPattern, (v) => (d.urlPattern = v), 'optional: themoviedb.org/movie/<id>')),
            field('Identity / dedup key', input(d.identity, (v) => (d.identity = v), 'tmdbId (fallback: title + year)'), 'Types without a URL still need a natural key, or duplicates pile up.')
        ]),
        grid2([
            field('Link hosts for auto-detect', input((d.detect?.hosts ?? []).join(', '), (v) => {
                const hosts = v.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
                d.detect = { hosts, path: d.detect?.path ?? '', examples: d.detect?.examples ?? [] };
            }, 'metmuseum.org, www.metmuseum.org'), 'Comma-separated. Leave blank and the Add Content card never guesses this type.'),
            field('Link path pattern', input(d.detect?.path ?? '', (v) => {
                d.detect = { hosts: d.detect?.hosts ?? [], path: v, examples: d.detect?.examples ?? [] };
            }, '^/art/collection/search/(\\d+)/?$'), 'Regular expression over the URL path. Group 1 is the external id. Try it in section 6.')
        ]),
        checkbox(d.urlRequired, (v) => (d.urlRequired = v), 'A URL is required to create this type'),
        checkbox(d.sharesUrlSpace, (v) => (d.sharesUrlSpace = v), 'The same URL may exist under another content type (relaxes the global UNIQUE(url) constraint — migration)')
    ]);
}
function applicabilityBadge(a) {
    return el('span', { class: `badge badge-${a}` }, [a]);
}
function renderColumns() {
    const body = [];
    let lastGroup = '';
    for (const col of COLUMNS) {
        if (col.pinned)
            continue;
        if (col.group !== lastGroup) {
            lastGroup = col.group;
            body.push(el('h3', { class: 'group' }, [GROUP_LABELS[col.group]]));
        }
        body.push(renderColumnRow(col));
    }
    return section('3 · Fields & columns', 'Every column is generic with a per-type label. Bind the ones this type genuinely has; leave the rest off rather than inventing a value.', body);
}
function renderColumnRow(col) {
    const current = state.decisions[col.id] ?? null;
    const others = TYPES.filter((t) => col.bindings[t.id]);
    const on = el('input', { type: 'checkbox', checked: current !== null });
    on.addEventListener('change', () => {
        state.decisions[col.id] = on.checked
            ? { label: col.generic, applicability: 'typical', source: 'user', path: `response->>'${col.id}'`, defaultVisible: true }
            : null;
        if (!on.checked)
            delete state.decisions[col.id];
        save();
        render();
    });
    const head = el('div', { class: 'col-head' }, [
        el('label', { class: 'checkline' }, [on, el('strong', {}, [col.generic || col.id])]),
        el('span', { class: 'muted' }, [col.tooltip]),
        el('span', { class: 'muted small' }, [
            others.length ? `Used by ${others.map((t) => `${t.label} → ${col.bindings[t.id].label}`).join(' · ')}` : 'Not used by any seeded type yet'
        ])
    ]);
    if (!current)
        return el('div', { class: 'col-row off' }, [head]);
    const b = current;
    const detail = grid2([
        field('Label for this type', input(b.label, (v) => (b.label = v), col.generic)),
        field('Applicability', select(b.applicability, ['required', 'typical', 'optional'], (v) => (b.applicability = v))),
        field('Source', select(b.source, ['api', 'scrape', 'user', 'derived', 'internal'], (v) => (b.source = v))),
        field('Value path', input(b.path, (v) => (b.path = v), "response->>'field'")),
        field('Unit / format', input(b.unit ?? '', (v) => (b.unit = v || undefined), 'minutes, pages, minor units…')),
        field('Tooltip override', input(b.tooltip ?? '', (v) => (b.tooltip = v || undefined), col.tooltip)),
        field('Cell appearance', input(b.appearance ?? '', (v) => (b.appearance = v || undefined), 'font, icon, subtitle, alignment, sort comparator…'), 'How the cell renders for this type — carried into the spec.')
    ]);
    const flags = el('div', { class: 'flags' }, [
        checkbox(b.defaultVisible, (v) => (b.defaultVisible = v), 'Visible by default'),
        el('span', { class: 'muted small' }, [
            `Storage: ${col.storage}${col.storage === 'promoted-column' ? ' (migration)' : ''} · ${col.sortable ? 'sortable' : 'not sortable'} · gap renders "${col.gapFallback}"`
        ]),
        applicabilityBadge(b.applicability)
    ]);
    return el('div', { class: 'col-row' }, [head, detail, flags]);
}
function renderPreview() {
    const picks = el('div', { class: 'chips' });
    const ids = [state.draft.id, ...TYPES.map((t) => t.id)];
    for (const id of ids) {
        const active = state.selected.includes(id);
        const label = id === state.draft.id ? `${typeLabel(id, state.draft)} (draft)` : typeLabel(id, state.draft);
        const chip = el('button', { class: `chip${active ? ' on' : ''}`, type: 'button' }, [label]);
        chip.addEventListener('click', () => {
            state.selected = active ? state.selected.filter((x) => x !== id) : [...state.selected, id];
            save();
            render();
        });
        picks.append(chip);
    }
    const grid = resolveGrid(state);
    const headerStrip = el('div', { class: 'grid-preview' });
    for (const rc of grid.visible) {
        headerStrip.append(el('div', { class: `gcell${rc.unbound.length ? ' sparse' : ''}`, title: rc.tooltip }, [
            el('span', { class: 'gh' }, [rc.header || '◎']),
            el('span', { class: 'gm' }, [
                rc.unbound.length
                    ? `${Math.round(rc.coverage * 100)}% filled · ${rc.col.gapFallback}`
                    : 'all selected types'
            ])
        ]));
    }
    const samples = renderSamples(state, grid);
    const warn = el('ul', { class: 'warnings' });
    for (const w of grid.warnings) {
        warn.append(el('li', { class: `w-${w.severity}` }, [w.message]));
    }
    if (grid.warnings.length === 0)
        warn.append(el('li', { class: 'w-ok' }, ['No gaps flagged for this selection.']));
    const hidden = grid.columns.filter((rc) => !rc.visible && rc.bound.length > 0);
    const hiddenList = el('p', { class: 'muted small' }, [
        hidden.length ? `Off by default (column picker): ${hidden.map((rc) => rc.col.generic || rc.col.id).join(', ')}` : 'Every bound column is on by default.'
    ]);
    return section('4 · Cross-type grid preview', 'Select the types a user might have in view at once and check the header row still reads as one table.', [
        picks,
        field('Default-visibility rule', select(state.rule, ['any', 'majority', 'all'], (v) => (state.rule = v), {
            any: 'any selected type wants it',
            majority: 'a majority want it',
            all: 'every selected type wants it'
        })),
        headerStrip,
        ...(samples ? [samples] : []),
        hiddenList,
        warn
    ]);
}
function sampleCell(value, tooltip) {
    if (value === undefined)
        return el('td', { class: 'unset', title: 'No sample value' }, ['·']);
    if (typeof value === 'string')
        return el('td', { title: tooltip }, [value]);
    return el('td', { title: tooltip }, [
        el('span', { class: 'cell-title' }, [value.text]),
        ...(value.sub ? [el('span', { class: 'cell-sub' }, [value.sub])] : [])
    ]);
}
function cellText(value) {
    return value === undefined ? undefined : typeof value === 'string' ? value : value.text;
}
/** Cycle one column through asc → desc → off, keeping any other keys as lower priorities. */
function toggleSort(colId) {
    const keys = state.sort ?? [];
    const existing = keys.find((k) => k.colId === colId);
    let next;
    if (!existing)
        next = [{ colId, dir: 'asc' }];
    else if (existing.dir === 'asc')
        next = keys.map((k) => (k.colId === colId ? { colId, dir: 'desc' } : k));
    else
        next = keys.filter((k) => k.colId !== colId);
    state.sort = next;
    save();
    render();
}
/** The alert raised when a sort would order numbers that mean different things. */
function renderSortAlert(current, grid) {
    const conflicted = sortConflict(current.sort, grid);
    if (!conflicted)
        return null;
    const header = conflicted.header || conflicted.col.generic;
    const units = unitsFor(conflicted);
    const key = current.sort[0];
    const actions = [];
    const typeCol = grid.visible.find((rc) => rc.col.id === 'type');
    if (typeCol) {
        const multi = el('button', { type: 'button', class: 'primary' }, [`Sort by Type, then ${header}`]);
        multi.addEventListener('click', () => {
            state.sort = [{ colId: 'type', dir: 'asc' }, key];
            save();
            render();
        });
        actions.push(multi);
    }
    for (const typeId of conflicted.bound) {
        const unit = conflicted.aliases.find((a) => a.typeId === typeId)?.unit;
        const only = el('button', { type: 'button' }, [`Only ${typeLabel(typeId, current.draft)}${unit ? ` (${unit})` : ''}`]);
        only.addEventListener('click', () => {
            state.selected = [typeId];
            save();
            render();
        });
        actions.push(only);
    }
    const cancel = el('button', { type: 'button' }, ['Cancel sort']);
    cancel.addEventListener('click', () => {
        state.sort = [];
        save();
        render();
    });
    actions.push(cancel);
    return el('div', { class: 'sort-alert', role: 'alert' }, [
        el('strong', {}, [`"${header}" mixes units: ${units.join(' · ')}.`]),
        el('span', {}, [
            ' Sorting it on its own would put 453 words next to 453 seconds as if they were the same number. Rows stay unsorted until you pick one:'
        ]),
        el('div', { class: 'row' }, actions)
    ]);
}
/** Illustrative rows for the selected types that ship samples; null when none do. */
function renderSamples(current, grid) {
    const visible = grid.visible;
    const fullness = current.fullness ?? 'usual';
    const rows = [];
    for (const id of current.selected)
        rows.push(...previewRowsFor(id, current, fullness));
    if (rows.length === 0)
        return null;
    const valueOf = (row, colId) => {
        if (colId === 'type')
            return typeLabel(row.typeId, current.draft);
        const pc = row.cells[colId];
        return pc && (pc.state === 'value' || pc.state === 'placeholder') ? cellText(pc.cell) : undefined;
    };
    const keys = (current.sort ?? []).filter((k) => visible.some((rc) => rc.col.id === k.colId && rc.col.sortable));
    const alert = renderSortAlert(current, grid);
    if (keys.length && !alert) {
        rows.sort((a, b) => {
            for (const k of keys) {
                const va = sortValue(valueOf(a, k.colId));
                const vb = sortValue(valueOf(b, k.colId));
                if (va === vb)
                    continue;
                if (va === null)
                    return 1; // blanks last in either direction
                if (vb === null)
                    return -1;
                const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
                if (cmp !== 0)
                    return k.dir === 'asc' ? cmp : -cmp;
            }
            return 0;
        });
    }
    const head = el('tr', {}, visible.map((rc) => {
        const idx = keys.findIndex((k) => k.colId === rc.col.id);
        const key = keys[idx];
        const units = unitsFor(rc);
        const label = [
            rc.header || '◎',
            ...(key ? [` ${key.dir === 'asc' ? '▲' : '▼'}`] : []),
            ...(key && keys.length > 1 ? [el('sup', {}, [String(idx + 1)])] : [])
        ];
        const th = el('th', { title: units.length > 1 ? `${rc.tooltip} — mixed units: ${units.join(' · ')}` : rc.tooltip }, label);
        if (rc.col.sortable) {
            th.classList.add('sortable');
            if (units.length > 1)
                th.classList.add('mixed');
            th.addEventListener('click', () => toggleSort(rc.col.id));
        }
        return th;
    }));
    const focus = current.focus;
    const body = rows.map((row) => {
        const tr = el('tr', {}, visible.map((rc) => {
            if (rc.col.id === 'perspectize') {
                const btn = el('button', { type: 'button', class: 'cell-btn', title: 'Add perspective — shows the form in section 5' }, ['◎']);
                btn.addEventListener('click', () => focusRow(row, 'perspective'));
                return el('td', { class: 'center' }, [btn]);
            }
            if (rc.col.id === 'type')
                return el('td', { class: 'muted' }, [typeLabel(row.typeId, current.draft)]);
            const binding = bindingFor(rc.col, row.typeId, current);
            if (!binding)
                return el('td', { class: 'gap', title: `Not bound for this type — renders "${rc.col.gapFallback}"` }, [gapText(rc.col)]);
            const pc = row.cells[rc.col.id] ?? { state: 'allowed-empty' };
            const tooltip = binding.tooltip ?? rc.col.tooltip;
            const td = rc.col.id === 'item' ? itemCell(row, pc, tooltip, binding.appearance) : stateCell(pc, tooltip, binding.label || rc.col.generic, binding.applicability);
            if (rc.col.align)
                td.classList.add(rc.col.align);
            return td;
        }));
        if (focus && focus.typeId === row.typeId && focus.index === row.index)
            tr.classList.add('focused');
        return tr;
    });
    const modes = [
        ['full', 'Full'],
        ['usual', 'Usual'],
        ['minimum', 'Minimum']
    ];
    const seg = el('div', { class: 'seg', role: 'group' });
    for (const [mode, label] of modes) {
        const b = el('button', { type: 'button', class: mode === fullness ? 'on' : '' }, [label]);
        b.setAttribute('aria-pressed', String(mode === fullness));
        b.addEventListener('click', () => {
            state.fullness = mode;
            save();
            render();
        });
        seg.append(b);
    }
    const legend = el('div', { class: 'legend' }, [
        el('span', {}, [el('i', { class: 'sw ph' }, ['‹a›']), ' made-up value to show a full row']),
        el('span', {}, [el('i', { class: 'sw ok' }, ['—']), ' empty, and allowed']),
        el('span', {}, [el('i', { class: 'sw bad' }, ['!']), ' empty, but required']),
        el('span', {}, [el('i', { class: 'sw gap' }, ['—']), ' column not used by this type'])
    ]);
    return el('div', { class: 'samples' }, [
        el('div', { class: 'samples-bar' }, [
            el('span', { class: 'field-label' }, ['Row fill']),
            seg,
            el('span', { class: 'muted small' }, [
                fullness === 'full'
                    ? 'Every field the type declares, filled in.'
                    : fullness === 'minimum'
                        ? 'Only required fields — what the sparsest allowed row looks like.'
                        : 'Rows as they typically arrive from the source.'
            ])
        ]),
        legend,
        el('p', { class: 'muted small' }, [
            'Click a title to see its details view and the add-perspective form below. The thumbnail opens the source page. Hover any cell for its tooltip; click a header to sort.'
        ]),
        ...(alert ? [alert] : []),
        el('div', { class: 'sample-scroll' }, [el('table', {}, [el('thead', {}, [head]), el('tbody', {}, body)])])
    ]);
}
/* ------------------------------------------------------ cells & app mocks */
const ICONS = {
    'play-badge': '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="7 4 20 12 7 20"/></svg>',
    'book-cross': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M12 8v6M9.5 10.5h5"/></svg>',
    palette: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.3 1.6-2.3H17a4 4 0 0 0 4-4c0-5.2-4-9.8-9-9.8z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/></svg>',
    default: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>'
};
function iconFor(typeId) {
    return ICONS[profileFor(typeId, state.draft)?.icon ?? ''] ?? ICONS.default;
}
function thumbBox(typeId, cell, size, contain) {
    const img = typeof cell === 'object' ? cell.img : undefined;
    const href = typeof cell === 'object' ? cell.href : undefined;
    const box = el('span', { class: `thumb thumb-${size}${contain ? ' contain' : ''}` });
    if (img) {
        box.append(el('img', { src: THUMBS[img] ?? img, alt: '', loading: 'lazy' }));
    }
    else {
        box.classList.add('icon');
        box.innerHTML = iconFor(typeId);
    }
    if (!href)
        return box;
    const a = el('a', { href, target: '_blank', rel: 'noopener noreferrer', title: `Open ${hostOf(href)} in a new tab` }, [box]);
    a.className = 'thumb-link';
    return a;
}
function hostOf(href) {
    try {
        return new URL(href).hostname.replace(/^www\./, '');
    }
    catch {
        return href;
    }
}
function itemCell(row, pc, tooltip, appearance) {
    const contain = /object-fit:\s*contain/.test(appearance ?? '');
    const cell = pc.cell;
    const title = el('button', { type: 'button', class: 'item-title', title: tooltip }, [cellText(cell) ?? '—']);
    title.addEventListener('click', () => focusRow(row, 'details'));
    const sub = typeof cell === 'object' && cell.sub ? [el('span', { class: 'cell-sub' }, [cell.sub])] : [];
    return el('td', { class: `item-td${pc.state === 'placeholder' ? ' ph' : ''}` }, [
        el('div', { class: 'item' }, [thumbBox(row.typeId, cell, 'cell', contain), el('div', { class: 'item-text' }, [title, ...sub])])
    ]);
}
function stateCell(pc, tooltip, label, applicability) {
    if (pc.state === 'allowed-empty') {
        return el('td', { class: 'empty-ok', title: `Empty is allowed — "${label}" is ${applicability}` }, ['—']);
    }
    if (pc.state === 'missing-required') {
        return el('td', { class: 'empty-bad', title: `"${label}" is required, but this sample has no value` }, ['!']);
    }
    const td = sampleCell(pc.cell, pc.state === 'placeholder' ? `Made-up value — ${tooltip}` : tooltip);
    if (pc.state === 'placeholder')
        td.classList.add('ph');
    return td;
}
function focusRow(row, target) {
    state.focus = { typeId: row.typeId, index: row.index };
    save();
    render();
    document.getElementById(target === 'details' ? 'mock-details' : 'mock-perspective')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
/** The row the mocks show: the focused one if it is still in view, else the first row. */
function focusedRow() {
    const fullness = state.fullness ?? 'usual';
    const rows = state.selected.flatMap((id) => previewRowsFor(id, state, fullness));
    const f = state.focus;
    return rows.find((r) => f && r.typeId === f.typeId && r.index === f.index) ?? rows[0] ?? null;
}
const MOCK_SKIP = new Set(['perspectize', 'item', 'type', 'creator', 'description', 'tags', 'identifier', 'updatedAt', 'id']);
function mockValue(pc) {
    if (!pc || pc.state === 'allowed-empty')
        return el('span', { class: 'm-empty', title: 'Empty is allowed' }, ['—']);
    if (pc.state === 'missing-required')
        return el('span', { class: 'm-bad', title: 'Required, but missing' }, ['missing']);
    const cell = pc.cell;
    const text = cellText(cell) ?? '';
    const sub = typeof cell === 'object' && cell.sub ? cell.sub : '';
    return el('span', { class: pc.state === 'placeholder' ? 'm-ph' : '' }, [text, ...(sub ? [el('span', { class: 'm-sub' }, [sub])] : [])]);
}
function renderDetailsMock(row) {
    const profile = profileFor(row.typeId, state.draft);
    const itemPc = row.cells.item;
    const itemCellVal = itemPc?.cell;
    const itemBinding = bindingFor(COLUMNS.find((c) => c.id === 'item'), row.typeId, state);
    const contain = /object-fit:\s*contain/.test(itemBinding?.appearance ?? '');
    const href = typeof itemCellVal === 'object' ? itemCellVal.href : undefined;
    const creatorPc = row.cells.creator;
    const tiles = [
        el('div', { class: 'm-tile', title: 'Illustrative count' }, [el('div', { class: 'm-lbl' }, ['Perspectives']), el('div', { class: 'm-big' }, ['3'])]),
        el('div', { class: 'm-tile', title: 'Illustrative average' }, [el('div', { class: 'm-lbl' }, ['Avg. Rating']), el('div', { class: 'm-big' }, ['4.3'])])
    ];
    for (const col of COLUMNS) {
        if (MOCK_SKIP.has(col.id))
            continue;
        const binding = bindingFor(col, row.typeId, state);
        if (!binding)
            continue;
        tiles.push(el('div', { class: 'm-tile', title: binding.tooltip ?? col.tooltip }, [el('div', { class: 'm-lbl' }, [binding.label || col.generic]), el('div', { class: 'm-val' }, [mockValue(row.cells[col.id])])]));
    }
    const detailOnly = profile?.detailOnly ?? [];
    const minimum = (state.fullness ?? 'usual') === 'minimum';
    const detailList = detailOnly.length
        ? [
            el('div', { class: 'm-section' }, [
                el('div', { class: 'm-lbl' }, ['Details']),
                el('dl', { class: 'm-dl' }, detailOnly.flatMap((f) => {
                    const v = minimum ? undefined : row.row[`detail:${f.label}`];
                    return [el('dt', {}, [f.label]), el('dd', {}, [v === undefined ? el('span', { class: 'm-empty', title: 'Empty is allowed' }, ['—']) : cellText(v) ?? ''])];
                }))
            ])
        ]
        : [];
    const textSection = (colId, heading) => {
        const binding = bindingFor(COLUMNS.find((c) => c.id === colId), row.typeId, state);
        if (!binding)
            return [];
        return [el('div', { class: 'm-section' }, [el('div', { class: 'm-lbl' }, [binding.label || heading]), el('div', { class: 'm-serif' }, [mockValue(row.cells[colId])])])];
    };
    const refresh = profile && (profile.ingestion === 'api' || profile.ingestion === 'scrape');
    return el('div', { class: 'appmock m-dialog', id: 'mock-details' }, [
        el('div', { class: 'm-head' }, [el('span', {}, [(profile?.label ?? 'Content').toUpperCase()]), el('span', { class: 'm-x' }, ['✕'])]),
        el('div', { class: 'm-body' }, [
            el('div', { class: 'm-hero' }, [
                thumbBox(row.typeId, itemCellVal, 'modal', contain),
                el('div', { class: 'm-hero-text' }, [
                    el('div', { class: 'm-title' }, [cellText(itemCellVal) ?? '—']),
                    ...(creatorPc ? [el('div', { class: 'm-creator' }, [mockValue(creatorPc)])] : [])
                ])
            ]),
            ...(href ? [el('a', { class: 'm-open', href, target: '_blank', rel: 'noopener noreferrer' }, [`Open on ${hostOf(href)} ↗`])] : []),
            el('div', { class: 'm-grid' }, tiles),
            ...detailList,
            ...textSection('description', 'Description'),
            ...textSection('tags', 'Tags'),
            el('div', { class: 'm-foot' }, [
                el('div', {}, [el('div', { class: 'm-lbl' }, ['Last updated in Perspectize']), el('div', { class: 'm-serif' }, [cellText(row.row.updatedAt) ?? cellText(row.row.createdAt) ?? '—'])]),
                ...(refresh ? [el('span', { class: 'm-btn' }, ['Refresh from source'])] : [])
            ])
        ])
    ]);
}
const THUMB_UP = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 10v11H3V10zM7 10l4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8a2 2 0 0 1-2 1.7H7"/></svg>';
function renderPerspectiveMock(row) {
    const name = cellText(row.cells.item?.cell) ?? 'Untitled';
    const up = el('span', { class: 'm-thumb' });
    up.innerHTML = THUMB_UP;
    const down = el('span', { class: 'm-thumb down' });
    down.innerHTML = THUMB_UP;
    const rating = (label) => el('div', { class: 'm-rating' }, [
        el('div', { class: 'm-rating-head' }, [el('span', {}, [label]), el('span', { class: 'm-muted' }, ['×'])]),
        el('div', { class: 'm-track' }, [el('span', {}), el('span', {}), el('span', {}), el('span', {}), el('span', {})])
    ]);
    return el('div', { class: 'appmock m-dialog', id: 'mock-perspective' }, [
        el('div', { class: 'm-p-head' }, [el('div', { class: 'm-p-title' }, ['Add perspective ', el('span', { class: 'm-muted', title: 'Add as much or as little as you like' }, ['ⓘ'])]), el('div', { class: 'm-p-name' }, [name])]),
        el('div', { class: 'm-p-row' }, [
            el('div', { class: 'm-overall' }, [el('span', { class: 'm-lbl' }, ['Overall']), el('div', { class: 'm-thumbs' }, [up, down])]),
            el('div', { class: 'm-editor' }, ['Add a comment'])
        ]),
        el('div', { class: 'm-body' }, [
            el('div', { class: 'm-ratings' }, [rating('Quality'), rating('Agreement'), rating('Importance'), rating('Confidence')]),
            el('div', { class: 'm-input' }, ['Add a field — e.g. clarity']),
            el('div', { class: 'm-private' }, [el('div', {}, [el('div', {}, ['Private']), el('div', { class: 'm-muted small' }, ['Only you can see private perspectives'])]), el('span', { class: 'm-switch' })]),
            el('div', { class: 'm-actions' }, [el('span', { class: 'm-btn' }, ['Cancel']), el('span', { class: 'm-btn primary' }, ['Save'])])
        ])
    ]);
}
function renderSurfaces() {
    const row = focusedRow();
    const blurb = 'What a row opens into. Pick a row by clicking its title in the preview above, or choose one here. These are mockups of ActivityDetailsModal.svelte and PerspectivePopover.svelte, drawn from the bindings, not the real components.';
    if (!row)
        return el('section', { id: 'surfaces' }, [el('h2', {}, ['5 · Row details & perspective']), el('p', { class: 'blurb' }, [blurb]), el('p', { class: 'muted' }, ['Select a type with sample rows in section 4.'])]);
    const fullness = state.fullness ?? 'usual';
    const pick = el('select', { id: 'focus-row' });
    for (const id of state.selected) {
        for (const r of previewRowsFor(id, state, fullness)) {
            const v = `${r.typeId}|${r.index}`;
            pick.append(el('option', { value: v, selected: r.typeId === row.typeId && r.index === row.index }, [`${typeLabel(r.typeId, state.draft)} — ${cellText(r.cells.item?.cell) ?? 'row'}`]));
        }
    }
    pick.addEventListener('change', () => {
        const [typeId, index] = pick.value.split('|');
        state.focus = { typeId, index: Number(index) };
        save();
        render();
    });
    const note = 'The form is the same for every type; only the title line comes from the content. Check that the standard fields (Quality, Agreement, Importance, Confidence) make sense for this type.';
    return el('section', { id: 'surfaces' }, [
        el('h2', {}, ['5 · Row details & perspective']),
        el('p', { class: 'blurb' }, [blurb]),
        field('Showing', pick, `Fill state follows the preview: ${fullness}.`),
        el('div', { class: 'mock-pair' }, [
            el('figure', {}, [renderDetailsMock(row), el('figcaption', {}, ['Details view — opens from the row title'])]),
            el('figure', {}, [renderPerspectiveMock(row), el('figcaption', {}, ['Add perspective — opens from ◎. ', note])])
        ])
    ]);
}
/* ---------------------------------------------------------- add content */
const FIXED_EXAMPLES = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'John 3:16-18',
    'https://www.biblegateway.com/passage/?search=Micah+6%3A8',
    'https://en.wikipedia.org/wiki/Wheat_Field_with_Cypresses',
    'Painting is only worth it for the story it tells'
];
function renderAddCard() {
    const d = state.draft;
    const detectable = !!(d.detect && d.detect.hosts.length && d.detect.path);
    const inputEl = el('input', { id: 'add-input', type: 'text', value: state.addInput ?? '', placeholder: 'Paste a link or type a reference', autocomplete: 'off' });
    const chipSlot = el('div', { class: 'm-chiprow' });
    const resultSlot = el('div', {});
    const traceSlot = el('div', {});
    const addBtn = el('span', { class: 'm-btn primary' }, ['Add']);
    const paint = () => {
        const r = detect(inputEl.value, state);
        const menu = el('select');
        menu.setAttribute('aria-label', 'Change type (mockup)');
        menu.append(el('option', { value: '', disabled: true, selected: r.type === null }, ['Select a type']));
        const options = [
            ['YOUTUBE', 'YouTube'],
            ['BIBLE_PASSAGE', 'Bible passage'],
            ...(d.enumValue ? [[d.enumValue, `${d.label || 'New type'} (new)`]] : [])
        ];
        for (const [v, label] of options)
            menu.append(el('option', { value: v, selected: v === r.type }, [label]));
        chipSlot.replaceChildren(el('span', { class: `m-chip${r.type ? ' on' : ''}` }, [r.type ? `Detected: ${r.label}` : 'Select a type']), menu);
        addBtn.classList.toggle('disabled', !r.type || r.type === 'CLAIM');
        const extras = [];
        if (r.type === 'CLAIM')
            extras.push(el('p', { class: 'm-muted small' }, ["Claims can't be added from here yet. Pick a type above to continue."]));
        if (r.type && r.type === d.enumValue && r.externalId) {
            extras.push(el('p', { class: 'm-muted small' }, [`On Add, the backend fetches ${r.externalId} from: ${d.enrichment.split(' — ')[0]}.`]));
            const match = samplesFor(d.id, state).find((row) => (cellText(row.identifier) ?? '').includes(r.externalId));
            if (match) {
                extras.push(el('div', { class: 'm-found' }, [
                    thumbBox(d.id, match.item, 'cell', /object-fit:\s*contain/.test(bindingFor(COLUMNS.find((c) => c.id === 'item'), d.id, state)?.appearance ?? '')),
                    el('div', {}, [el('div', { class: 'm-serif' }, [cellText(match.item) ?? '']), el('div', { class: 'm-muted small' }, [cellText(match.creator) ?? ''])])
                ]));
            }
        }
        resultSlot.replaceChildren(...extras);
        const table = el('table', { class: 'trace' }, [
            el('thead', {}, [el('tr', {}, [el('th', {}, ['Step']), el('th', {}, ['Result']), el('th', {}, ['Detail']), el('th', {}, ['Where'])])]),
            el('tbody', {}, r.steps.map((st) => el('tr', { class: `t-${st.outcome}` }, [
                el('td', {}, [st.rule]),
                el('td', {}, [st.outcome === 'match' ? 'match' : st.outcome === 'skipped' ? 'skipped' : 'no']),
                el('td', { class: 'muted' }, [st.note ?? '']),
                el('td', { class: `muted small${st.source.startsWith('NEW') ? ' new' : ''}` }, [st.source])
            ])))
        ]);
        traceSlot.replaceChildren(el('div', { class: 'sample-scroll' }, [table]));
    };
    inputEl.addEventListener('input', () => {
        state.addInput = inputEl.value;
        save();
        paint();
    });
    const exampleList = [...(d.detect?.examples ?? []), ...FIXED_EXAMPLES];
    const examples = el('div', { class: 'chips' }, exampleList.map((ex) => {
        // Drop the scheme and keep the tail: three Met links differ only at the end.
        const short = ex.replace(/^https?:\/\/(www\.)?/, '');
        const b = el('button', { type: 'button', class: 'chip', title: ex }, [short.length > 44 ? `${short.slice(0, 14)}…${short.slice(-28)}` : short]);
        b.addEventListener('click', () => {
            inputEl.value = ex;
            state.addInput = ex;
            save();
            paint();
        });
        return b;
    }));
    paint();
    const description = detectable
        ? `Paste a YouTube link, a ${d.label || 'new type'} link, or type a Bible reference like John 3:16-18.`
        : 'Paste a YouTube link, or type a Bible reference like John 3:16-18.';
    return el('section', { id: 'addcard' }, [
        el('h2', {}, ['6 · Add Content card']),
        el('p', { class: 'blurb' }, [
            'Type or paste into the card to see what it detects, step by step, in the same order as detectContentType.ts. The new type’s rule comes from the link fields in section 2.'
        ]),
        ...(detectable ? [] : [el('p', { class: 'w-warn' }, ['No link rule yet: this type is never auto-detected. Fill in the link hosts and path pattern in section 2.'])]),
        el('div', { class: 'add-pair' }, [
            el('figure', {}, [
                el('div', { class: 'appmock m-dialog m-pop' }, [
                    el('div', { class: 'm-body' }, [
                        el('div', { class: 'm-pop-title' }, ['Add Content']),
                        el('p', { class: 'm-muted small' }, [description]),
                        el('label', { class: 'm-label', htmlFor: 'add-input' }, ['Link or reference']),
                        el('div', { class: 'm-inputwrap' }, [inputEl, el('span', { class: 'm-paste', title: 'Paste from clipboard' }, ['⎘'])]),
                        chipSlot,
                        resultSlot,
                        el('div', { class: 'm-actions' }, [el('span', { class: 'm-btn' }, ['Cancel']), addBtn])
                    ])
                ]),
                el('figcaption', {}, ['Mockup of AddContentPopover.svelte — the input is live.'])
            ]),
            el('div', { class: 'trace-wrap' }, [el('span', { class: 'field-label' }, ['Try an example']), examples, el('span', { class: 'field-label' }, ['How it was detected']), traceSlot])
        ])
    ]);
}
function renderNotes() {
    const testing = el('textarea', { rows: 3, value: state.testingNotes, placeholder: 'Follow codebase instructions, then patterns, then judgment; stop and ask if really unsure.' });
    testing.addEventListener('input', () => {
        state.testingNotes = testing.value;
        save();
        renderDerived();
    });
    const dev = el('textarea', { rows: 3, value: state.deviations, placeholder: 'e.g. skip the AG Grid column-picker persistence for this pass' });
    dev.addEventListener('input', () => {
        state.deviations = dev.value;
        save();
        renderDerived();
    });
    return section('7 · Process notes', 'Carried into the emitted spec verbatim.', [
        field('Testing approach', testing),
        field('Conventions to ignore for this work only', dev)
    ]);
}
function renderOutput() {
    const pre = el('pre', { class: 'output', id: 'output' });
    const copy = el('button', { type: 'button', class: 'primary' }, ['Copy']);
    const download = el('button', { type: 'button' }, ['Download .md']);
    const tabs = el('div', { class: 'tabs' });
    let mode = 'spec';
    const paint = () => {
        pre.textContent = mode === 'spec' ? buildSpec(state) : buildMatrix(state);
    };
    for (const [key, label] of [['spec', 'Spec + checklist'], ['matrix', 'Column × type matrix']]) {
        const tab = el('button', { type: 'button', class: `tab${mode === key ? ' on' : ''}` }, [label]);
        tab.addEventListener('click', () => {
            mode = key;
            for (const t of Array.from(tabs.children))
                t.classList.toggle('on', t === tab);
            paint();
        });
        tabs.append(tab);
    }
    copy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(pre.textContent ?? '');
            copy.textContent = 'Copied';
        }
        catch {
            // Clipboard refused (embedded frame, older app view): select the text for a manual copy.
            getSelection()?.selectAllChildren(pre);
            copy.textContent = 'Selected — press Ctrl/⌘ C';
        }
        setTimeout(() => (copy.textContent = 'Copy'), 1600);
    });
    // Script-started downloads are blocked inside embedded frames (e.g. a claude.ai artifact).
    download.hidden = window.self !== window.top;
    download.addEventListener('click', () => {
        const blob = new Blob([pre.textContent ?? ''], { type: 'text/markdown' });
        const a = el('a', {
            href: URL.createObjectURL(blob),
            download: `${(state.draft.enumValue || 'content-type').toLowerCase()}-${mode}.md`
        });
        a.click();
        URL.revokeObjectURL(a.href);
    });
    paint();
    renderOutput.repaint = paint;
    return section('8 · Output', 'Deterministic — the same answers always produce the same text. No model is called.', [
        tabs,
        el('div', { class: 'row' }, [copy, download]),
        pre
    ]);
}
/* ------------------------------------------------------------------ layout */
function grid2(children) {
    return el('div', { class: 'grid2' }, children);
}
function section(title, blurb, children) {
    return el('section', {}, [el('h2', {}, [title]), el('p', { class: 'blurb' }, [blurb]), ...children]);
}
function render() {
    const root = document.getElementById('app');
    if (!root)
        return;
    root.replaceChildren(renderIdentity(), renderIngestion(), renderColumns(), renderPreview(), renderSurfaces(), renderAddCard(), renderNotes(), renderOutput());
}
/** Text-only inputs do not change layout, so they just repaint the output. */
function renderDerived() {
    const repaint = renderOutput.repaint;
    repaint?.();
    const preview = document.querySelector('.grid-preview')?.parentElement;
    if (preview)
        preview.replaceWith(renderPreview());
    document.getElementById('surfaces')?.replaceWith(renderSurfaces());
    document.getElementById('addcard')?.replaceWith(renderAddCard());
}
const reset = document.getElementById('reset');
reset?.addEventListener('click', () => {
    state = seededState(DEFAULT_SEED);
    save();
    render();
});
render();
//# sourceMappingURL=main.js.map