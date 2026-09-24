import { COLUMNS, GROUP_LABELS, TYPES } from './catalog.js';
import { buildMatrix, buildSpec } from './emit.js';
import { bindingFor, gapText, resolveGrid, samplesFor, sortConflict, sortValue, typeLabel, unitsFor } from './model.js';
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
        return cellText(row.cells[colId]);
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
    const body = rows.map(({ typeId, cells }) => el('tr', {}, visible.map((rc) => {
        if (rc.col.id === 'perspectize')
            return el('td', { class: 'center' }, ['◎']);
        if (rc.col.id === 'type')
            return el('td', { class: 'muted' }, [typeLabel(typeId, current.draft)]);
        const binding = bindingFor(rc.col, typeId, current);
        if (!binding)
            return el('td', { class: 'gap', title: `Not bound — ${rc.col.gapFallback}` }, [gapText(rc.col)]);
        const td = sampleCell(cells[rc.col.id], binding.tooltip ?? rc.col.tooltip);
        if (rc.col.align)
            td.classList.add(rc.col.align);
        return td;
    })));
    return el('div', { class: 'samples' }, [
        el('p', { class: 'muted small' }, [
            'Sample rows — click a header to sort (again to reverse, a third time to clear); hover for its tooltip. "·" means the sample has no value for a bound column; a dashed header mixes units.'
        ]),
        ...(alert ? [alert] : []),
        el('div', { class: 'sample-scroll' }, [el('table', {}, [el('thead', {}, [head]), el('tbody', {}, body)])])
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
function section(title, blurb, children) {
    return el('section', {}, [el('h2', {}, [title]), el('p', { class: 'blurb' }, [blurb]), ...children]);
}
function render() {
    const root = document.getElementById('app');
    if (!root)
        return;
    root.replaceChildren(renderIdentity(), renderIngestion(), renderColumns(), renderPreview(), renderNotes(), renderOutput());
}
/** Text-only inputs do not change layout, so they just repaint the output. */
function renderDerived() {
    const repaint = renderOutput.repaint;
    repaint?.();
    const preview = document.querySelector('.grid-preview')?.parentElement;
    if (preview)
        preview.replaceWith(renderPreview());
}
const reset = document.getElementById('reset');
reset?.addEventListener('click', () => {
    state = seededState(DEFAULT_SEED);
    save();
    render();
});
render();
//# sourceMappingURL=main.js.map