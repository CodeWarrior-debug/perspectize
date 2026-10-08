import { COLUMNS, GROUP_LABELS, TMDB_TYPES, TYPES } from './catalog.js';
import { detailsFor } from './details.js';
import { el } from './dom.js';
import { buildMatrix, buildSoloViews, buildSpec } from './emit.js';
import { openDetails } from './modal.js';
import { bindingFor, cellSortValue, cellText, gapText, profileFor, resolveGrid, samplesFor, sortConflict, typeLabel, unitsFor } from './model.js';
import { attachTip, cellTipContent } from './tip.js';
const STORAGE_KEY = 'perspectize.content-type-designer.v1';
/** Seed the type currently being designed, so a fresh open / reset lands on a filled-in form. */
const DEFAULT_SEED = 'movie';
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
            thumbnail: '',
            contentPolicy: '',
            duplicateFeedback: '',
            mobileCardFields: '',
            searchFields: ''
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
            field('Content policy', input(d.contentPolicy ?? '', (v) => (d.contentPolicy = v), 'Reject NC-17 and adult titles (CONTENT_NOT_ALLOWED)'), 'Adult / rating gate and the exact rejection message. Empty = undecided.'),
            field('Duplicate-add feedback', input(d.duplicateFeedback ?? '', (v) => (d.duplicateFeedback = v), 'toast: "Already in Perspectize"'), 'What the form shows when the item already exists. Empty = undecided.'),
            field('Mobile card facts', input(d.mobileCardFields ?? '', (v) => (d.mobileCardFields = v), 'year, rating, runtime'), 'Replaces views / likes / channel on the card list. Empty = undecided.'),
            field('Search fields', input(d.searchFields ?? '', (v) => (d.searchFields = v), 'title, cast, director'), 'Which fields the search box covers (scope picker). Empty = undecided.')
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
/* ------------------------------------------------------- shared grid bits */
/** The details layout for a type; the draft borrows its seed's layout. */
function layoutFor(typeId) {
    const lookup = typeId === state.draft.id ? state.seed ?? typeId : typeId;
    return detailsFor(lookup, typeLabel(typeId, state.draft), (col) => bindingFor(col, typeId, state)?.defaultVisible === true);
}
function accentFor(typeId) {
    return profileFor(typeId, state.draft)?.accent || '#3B6FD4';
}
function showDetails(typeId, row) {
    openDetails({
        layout: layoutFor(typeId),
        row,
        typeLabel: typeLabel(typeId, state.draft),
        accent: accentFor(typeId),
        binding: (colId) => {
            const col = COLUMNS.find((c) => c.id === colId);
            return col ? bindingFor(col, typeId, state) : undefined;
        }
    });
}
/** Sample rows, or one placeholder row so a type with no samples still has cells to hover. */
function rowsForSolo(typeId) {
    const rows = samplesFor(typeId, state);
    if (rows.length)
        return { rows, synthetic: false };
    const row = { item: `Example ${typeLabel(typeId, state.draft).toLowerCase()}` };
    for (const col of COLUMNS) {
        const b = bindingFor(col, typeId, state);
        if (b && col.id !== 'item')
            row[col.id] = `‹${b.label || col.generic}›`;
    }
    return { rows: [row], synthetic: true };
}
function headerTip(rc, current) {
    const meta = [];
    if (rc.aliases.length === 1) {
        const b = bindingFor(rc.col, rc.bound[0], current);
        if (b) {
            meta.push(`${b.source} · ${b.path}${b.unit ? ` · ${b.unit}` : ''}`);
            meta.push(`${b.applicability} · ${b.defaultVisible ? 'on' : 'off'} by default`);
            if (b.appearance)
                meta.push(`Cell: ${b.appearance}`);
        }
    }
    else if (rc.aliases.length > 1) {
        for (const a of rc.aliases)
            meta.push(`${typeLabel(a.typeId, current.draft)} → ${a.label}${a.unit ? ` (${a.unit})` : ''}`);
        const units = unitsFor(rc);
        if (units.length > 1)
            meta.push(`Mixed units: ${units.join(' · ')} — sorting it alone raises the alert`);
    }
    if (rc.unbound.length)
        meta.push(`Gap (${rc.col.gapFallback}) for ${rc.unbound.map((t) => typeLabel(t, current.draft)).join(', ')}`);
    return { title: rc.header || 'Perspectize', body: [rc.tooltip], meta };
}
/** Tiny media tile in the Item cell: poster (2:3), still/thumb (16:9) or nothing. */
function miniMedia(typeId, row) {
    const kind = layoutFor(typeId).media;
    if (kind === 'none' || kind === 'icon')
        return null;
    const tile = el('span', { class: `media mini media-${kind}` });
    tile.style.setProperty('--type-accent', accentFor(typeId));
    const url = cellText(row.tmdbUrl ?? row.url);
    attachTip(tile, () => ({
        body: [url ? `Opens ${url} in a new tab` : 'Opens the source in a new tab'],
        meta: [kind === 'poster' ? '2:3 poster tile (24×36)' : '16:9 tile (48×27)']
    }));
    return tile;
}
function bodyCell(rc, typeId, row, current) {
    if (rc.col.id === 'perspectize') {
        const td = el('td', { class: 'center perspectize' }, ['◎']);
        attachTip(td, () => ({ body: ['Perspectize — add or edit your perspective'] }));
        return td;
    }
    if (rc.col.id === 'type')
        return el('td', { class: 'muted' }, [typeLabel(typeId, current.draft)]);
    const binding = bindingFor(rc.col, typeId, current);
    if (!binding) {
        const td = el('td', { class: 'gap' }, [gapText(rc.col)]);
        attachTip(td, () => ({
            body: [`${typeLabel(typeId, current.draft)} has no ${rc.col.generic || rc.col.id}.`],
            meta: [`Gap policy: ${rc.col.gapFallback}`]
        }));
        return td;
    }
    const value = row[rc.col.id];
    const td = el('td');
    if (rc.col.align)
        td.classList.add(rc.col.align);
    if (value === undefined) {
        td.classList.add('unset');
        td.append('·');
    }
    else if (rc.col.id === 'item') {
        const title = el('span', { class: 'title-link' }, [cellText(value)]);
        title.addEventListener('click', () => showDetails(typeId, row));
        const sub = typeof value === 'string' ? undefined : value.sub;
        const media = miniMedia(typeId, row);
        td.append(el('div', { class: 'item-cell' }, [
            ...(media ? [media] : []),
            el('div', {}, [title, ...(sub ? [el('span', { class: 'cell-sub' }, [sub])] : [])])
        ]));
    }
    else {
        td.append(el('span', { class: 'cell-title' }, [cellText(value)]));
        if (typeof value !== 'string' && value.sub)
            td.append(el('span', { class: 'cell-sub' }, [value.sub]));
    }
    attachTip(td, () => ({
        ...cellTipContent(value, binding.label || rc.col.generic, [
            binding.cellTip ? `Spec: ${binding.cellTip}` : 'Spec: default — displayed text; copy copies the raw value',
            ...(binding.appearance ? [`Cell: ${binding.appearance}`] : [])
        ]),
        spoiler: /^Blurred/.test(binding.appearance ?? '')
    }), { pinOnClick: true });
    return td;
}
function sortRows(rows, keys, valueOf) {
    rows.sort((a, b) => {
        for (const k of keys) {
            const va = cellSortValue(valueOf(a, k.colId));
            const vb = cellSortValue(valueOf(b, k.colId));
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
/* ------------------------------------------------------- single-type view */
function soloTypeId() {
    const ids = [state.draft.id, ...TYPES.map((t) => t.id)];
    return state.soloType && ids.includes(state.soloType) ? state.soloType : 'movie';
}
function renderSolo() {
    const typeId = soloTypeId();
    const label = typeLabel(typeId, state.draft);
    const tabs = el('div', { class: 'solo-tabs' });
    const groups = [
        ['TMDB', TMDB_TYPES],
        ['Draft', [state.draft.id]],
        ['Other types', TYPES.map((t) => t.id).filter((id) => !TMDB_TYPES.includes(id))]
    ];
    for (const [name, ids] of groups) {
        const group = el('div', { class: 'tab-group' }, [el('span', { class: 'tab-group-label' }, [name])]);
        for (const id of ids) {
            const tab = el('button', { type: 'button', class: `chip${id === typeId ? ' on' : ''}` }, [
                id === state.draft.id ? `${typeLabel(id, state.draft)} (draft)` : typeLabel(id, state.draft)
            ]);
            tab.addEventListener('click', () => {
                state.soloType = id;
                state.soloSort = undefined;
                save();
                render();
            });
            group.append(tab);
        }
        tabs.append(group);
    }
    const soloState = { ...state, selected: [typeId] };
    const overrides = state.soloOverrides?.[typeId] ?? {};
    const suggested = resolveGrid(soloState);
    const grid = resolveGrid(soloState, overrides);
    const picker = el('div', { class: 'col-chips' });
    for (const rc of grid.columns) {
        if (rc.bound.length === 0 || rc.col.id === 'perspectize')
            continue;
        const locked = rc.col.pinned === true;
        const forced = overrides[rc.col.id] !== undefined;
        const chip = el('button', {
            type: 'button',
            class: `colchip${rc.visible ? ' on' : ''}${forced ? ' forced' : ''}${locked ? ' locked' : ''}`,
            disabled: locked
        }, [rc.header || rc.col.generic, ...(forced ? [el('sup', {}, ['what-if'])] : [])]);
        attachTip(chip, () => ({ ...headerTip(rc, soloState), meta: [...headerTip(rc, soloState).meta, rc.reason] }));
        chip.addEventListener('click', () => {
            const next = !rc.visible;
            const sugg = suggested.columns.find((c) => c.col.id === rc.col.id)?.visible;
            const all = (state.soloOverrides ??= {});
            const mine = (all[typeId] ??= {});
            if (next === sugg)
                delete mine[rc.col.id];
            else
                mine[rc.col.id] = next;
            save();
            render();
        });
        picker.append(chip);
    }
    const forcedCount = Object.keys(overrides).length;
    const resetBtn = el('button', { type: 'button' }, ['Reset to suggested']);
    resetBtn.disabled = forcedCount === 0;
    resetBtn.addEventListener('click', () => {
        if (state.soloOverrides)
            delete state.soloOverrides[typeId];
        save();
        render();
    });
    const { rows, synthetic } = rowsForSolo(typeId);
    const visible = grid.visible;
    const sort = state.soloSort && visible.some((rc) => rc.col.id === state.soloSort.colId) ? state.soloSort : undefined;
    const ordered = [...rows];
    if (sort)
        sortRows(ordered, [sort], (row, colId) => row[colId]);
    const head = el('tr', {}, visible.map((rc) => {
        const th = el('th', {}, [rc.header || '◎', ...(sort?.colId === rc.col.id ? [sort.dir === 'asc' ? ' ▲' : ' ▼'] : [])]);
        attachTip(th, () => headerTip(rc, soloState));
        if (rc.col.sortable) {
            th.classList.add('sortable');
            th.addEventListener('click', () => {
                const cur = state.soloSort;
                state.soloSort =
                    cur?.colId !== rc.col.id ? { colId: rc.col.id, dir: 'asc' } : cur.dir === 'asc' ? { colId: rc.col.id, dir: 'desc' } : undefined;
                save();
                render();
            });
        }
        return th;
    }));
    const body = ordered.map((row) => el('tr', {}, visible.map((rc) => bodyCell(rc, typeId, row, soloState))));
    const table = el('div', { class: 'app-grid' }, [el('table', {}, [el('thead', {}, [head]), el('tbody', {}, body)])]);
    const openFirst = el('button', { type: 'button', class: 'primary' }, [`Open ${label} details view`]);
    openFirst.addEventListener('click', () => showDetails(typeId, ordered[0]));
    const warn = el('ul', { class: 'warnings' });
    for (const w of grid.warnings)
        warn.append(el('li', { class: `w-${w.severity}` }, [w.message]));
    if (!grid.warnings.length)
        warn.append(el('li', { class: 'w-ok' }, ['No gaps flagged with this type alone.']));
    const offCount = grid.columns.filter((rc) => !rc.visible && rc.bound.length > 0 && !rc.col.hideWhenSolo).length;
    return section('Single-type view — suggested columns, tooltips, details', 'What the Activity table shows when this is the only type filtered in. Headers use the type’s own labels; Type is dropped because every row would repeat it.', [
        tabs,
        el('p', { class: 'solo-summary' }, [
            el('strong', {}, [`${visible.length} columns`]),
            ` on by default for ${label} alone · ${offCount} more in the column picker`,
            ...(forcedCount ? [` · ${forcedCount} what-if change${forcedCount > 1 ? 's' : ''}`] : [])
        ]),
        picker,
        el('div', { class: 'row' }, [openFirst, resetBtn]),
        el('p', { class: 'muted small' }, [
            synthetic
                ? 'No sample rows for this type — the placeholder row still carries every tooltip. '
                : '',
            'Hover a header or cell for its tooltip. Click a cell to pin its popover and try Copy. Click a title to open the details view. Click a chip above to try a column on or off.'
        ]),
        table,
        warn
    ], 'solo');
}
/* ------------------------------------------------------ cross-type preview */
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
    const family = el('button', { type: 'button' }, ['Select the TMDB family']);
    family.addEventListener('click', () => {
        state.selected = [...TMDB_TYPES];
        state.sort = [];
        save();
        render();
    });
    const mixed = el('button', { type: 'button' }, ['TMDB + YouTube + Bible']);
    mixed.addEventListener('click', () => {
        state.selected = [...TMDB_TYPES, 'youtube', 'bible'];
        state.sort = [];
        save();
        render();
    });
    const grid = resolveGrid(state);
    const headerStrip = el('div', { class: 'grid-preview' });
    for (const rc of grid.visible) {
        const cell = el('div', { class: `gcell${rc.unbound.length ? ' sparse' : ''}` }, [
            el('span', { class: 'gh' }, [rc.header || '◎']),
            el('span', { class: 'gm' }, [
                rc.unbound.length ? `${Math.round(rc.coverage * 100)}% filled · ${rc.col.gapFallback}` : 'all selected types'
            ])
        ]);
        attachTip(cell, () => headerTip(rc, state));
        headerStrip.append(cell);
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
        el('div', { class: 'row' }, [family, mixed]),
        field('Default-visibility rule', select(state.rule, ['any', 'majority', 'all'], (v) => (state.rule = v), {
            any: 'any selected type wants it',
            majority: 'a majority want it',
            all: 'every selected type wants it'
        })),
        headerStrip,
        ...(samples ? [samples] : []),
        hiddenList,
        warn
    ], 'cross');
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
    const rows = [];
    for (const id of current.selected) {
        for (const cells of samplesFor(id, current))
            rows.push({ typeId: id, cells });
    }
    if (rows.length === 0)
        return null;
    const valueOf = (row, colId) => {
        if (colId === 'type')
            return typeLabel(row.typeId, current.draft);
        const col = visible.find((rc) => rc.col.id === colId)?.col;
        if (!col || !bindingFor(col, row.typeId, current))
            return undefined;
        return row.cells[colId];
    };
    const keys = (current.sort ?? []).filter((k) => visible.some((rc) => rc.col.id === k.colId && rc.col.sortable));
    const alert = renderSortAlert(current, grid);
    if (keys.length && !alert)
        sortRows(rows, keys, valueOf);
    const head = el('tr', {}, visible.map((rc) => {
        const idx = keys.findIndex((k) => k.colId === rc.col.id);
        const key = keys[idx];
        const units = unitsFor(rc);
        const label = [
            rc.header || '◎',
            ...(key ? [` ${key.dir === 'asc' ? '▲' : '▼'}`] : []),
            ...(key && keys.length > 1 ? [el('sup', {}, [String(idx + 1)])] : [])
        ];
        const th = el('th', {}, label);
        attachTip(th, () => headerTip(rc, current));
        if (rc.col.sortable) {
            th.classList.add('sortable');
            if (units.length > 1)
                th.classList.add('mixed');
            th.addEventListener('click', () => toggleSort(rc.col.id));
        }
        return th;
    }));
    const body = rows.map(({ typeId, cells }) => el('tr', {}, visible.map((rc) => bodyCell(rc, typeId, cells, current))));
    return el('div', { class: 'samples' }, [
        el('p', { class: 'muted small' }, [
            'Sample rows — click a header to sort (again to reverse, a third time to clear); hover for its tooltip; click a title for the details view. "·" means the sample has no value for a bound column; a dashed header mixes units.'
        ]),
        ...(alert ? [alert] : []),
        el('div', { class: 'sample-scroll app-grid' }, [el('table', {}, [el('thead', {}, [head]), el('tbody', {}, body)])])
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
    return section('5 · Process notes', 'Carried into the emitted spec verbatim.', [
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
        pre.textContent = mode === 'spec' ? buildSpec(state) : mode === 'matrix' ? buildMatrix(state) : buildSoloViews(state);
    };
    for (const [key, label] of [
        ['spec', 'Spec + checklist'],
        ['matrix', 'Column × type matrix'],
        ['solo', 'Single-type views (section 4 selection)']
    ]) {
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
        await navigator.clipboard.writeText(pre.textContent ?? '');
        copy.textContent = 'Copied';
        setTimeout(() => (copy.textContent = 'Copy'), 1200);
    });
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
    return section('6 · Output', 'Deterministic — the same answers always produce the same text. No model is called.', [
        tabs,
        el('div', { class: 'row' }, [copy, download]),
        pre
    ]);
}
/* ------------------------------------------------------------------ layout */
function grid2(children) {
    return el('div', { class: 'grid2' }, children);
}
function section(title, blurb, children, id) {
    return el('section', id ? { id } : {}, [el('h2', {}, [title]), el('p', { class: 'blurb' }, [blurb]), ...children]);
}
function render() {
    const root = document.getElementById('app');
    if (!root)
        return;
    root.replaceChildren(renderSolo(), renderIdentity(), renderIngestion(), renderColumns(), renderPreview(), renderNotes(), renderOutput());
}
/** Text-only inputs do not change layout, so they just repaint the output. */
function renderDerived() {
    const repaint = renderOutput.repaint;
    repaint?.();
    document.getElementById('cross')?.replaceWith(renderPreview());
    document.getElementById('solo')?.replaceWith(renderSolo());
}
const reset = document.getElementById('reset');
reset?.addEventListener('click', () => {
    state = seededState(DEFAULT_SEED);
    save();
    render();
});
render();
//# sourceMappingURL=main.js.map