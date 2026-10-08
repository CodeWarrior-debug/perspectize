import { COLUMNS, GROUP_LABELS, TYPES } from './catalog.js';
import { detailsFor } from './details.js';
import { bindingFor, gapText, resolveGrid, samplesFor, typeLabel, unitsFor } from './model.js';
const YES = 'yes';
const NO = 'no';
function esc(v) {
    return v.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}
function table(headers, rows) {
    if (rows.length === 0)
        return '_none_\n';
    const head = `| ${headers.join(' | ')} |`;
    const sep = `| ${headers.map(() => '---').join(' | ')} |`;
    const body = rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n');
    return [head, sep, body].join('\n') + '\n';
}
function storageNote(col) {
    switch (col.storage) {
        case 'universal-column':
            return 'existing column on `content` — no migration';
        case 'jsonb':
            return '`response` JSONB — no migration';
        case 'promoted-column':
            return 'promote to a dedicated column — migration required';
        case 'derived':
            return 'computed at read time — not stored';
    }
}
function filterKindFor(col) {
    switch (col.valueType) {
        case 'number':
        case 'money':
        case 'duration':
        case 'rating':
        case 'percent':
            return 'number';
        case 'date':
            return 'date';
        case 'enum':
        case 'boolean':
            return 'set';
        default:
            return 'text';
    }
}
function cap(id) {
    return id[0].toUpperCase() + id.slice(1);
}
/** Proposed ContentFilter field name(s) for a column of the given kind. */
function filterFieldsFor(col, kind) {
    const id = col.id;
    switch (kind) {
        case 'number':
            return `\`min${cap(id)}\`, \`max${cap(id)}\` (Int/Float)`;
        case 'date':
            return `\`${id}After\`, \`${id}Before\` (ISO 8601 String)`;
        case 'set':
            return `\`${id}: [String!]\``;
        case 'text':
            return `\`${id}Contains: String\``;
    }
}
function filterRows(state, chosen) {
    const rows = [];
    const none = [];
    for (const col of chosen) {
        if (!col.filterable)
            continue;
        const b = state.decisions[col.id];
        if (col.storage === 'derived') {
            none.push(col.id);
            continue;
        }
        const kind = filterKindFor(col);
        rows.push([
            col.id,
            b.label || col.generic,
            kind,
            col.storage === 'universal-column' ? `existing field if any (verify); else ${filterFieldsFor(col, kind)}` : filterFieldsFor(col, kind),
            `\`${col.id}\``,
            b.label || col.generic,
            col.storage === 'jsonb' ? 'JSONB expression — consider an index' : 'dedicated column'
        ]);
    }
    return { rows, none };
}
/** Checklist rows (see .claude/docs/ADDING_CONTENT_TYPE.md) that the form state does not answer. */
function undecidedSurfaces(state) {
    const d = state.draft;
    const out = [];
    const empty = (v) => !v || !v.trim() || v.trim().toUpperCase() === 'TBD';
    if (empty(d.searchFields))
        out.push({ surface: 'Search', question: 'Which fields does the search box cover for this type (scope picker)?' });
    if (empty(d.mobileCardFields))
        out.push({ surface: 'Mobile card list', question: 'Which facts replace views / likes / channel on the card?' });
    if (empty(d.duplicateFeedback))
        out.push({ surface: 'Add form: duplicate feedback', question: 'What does the form show when the item already exists (already-existed flag)?' });
    if (empty(d.contentPolicy))
        out.push({ surface: 'Content policy', question: 'Is there an adult / rating gate, and what is the exact rejection message?' });
    if (!layoutOf(state, d.id).attribution)
        out.push({ surface: 'Licensing / attribution', question: 'Required attribution text, logo and API terms?' });
    out.push({ surface: 'Sort: computed keys', question: 'Are computed sort keys scanned so cursor pagination encodes the real value (page 2 must differ from page 1)?' }, { surface: 'Data modes', question: 'Does the Type filter reach the server in Loaded mode (100-row cap), and does the footer total reflect it?' }, { surface: 'Add form: errors and close', question: 'Specific error messages per failure, and does the popover close on success?' }, { surface: 'Formatting edge values', question: 'null, 0, huge ($1T, not $1000B) and tiny (<1%, not 0%) values?' }, { surface: 'Rollout', question: 'API token per environment, backend before frontend, migration number collisions, indexes, evidence on a throwaway Neon branch with a clip?' });
    return out;
}
export function buildSpec(state) {
    const d = state.draft;
    const grid = resolveGrid(state);
    const chosen = COLUMNS.filter((c) => state.decisions[c.id]);
    const rejected = COLUMNS.filter((c) => !state.decisions[c.id] && !c.pinned);
    const out = [];
    out.push(`# Content type spec: ${d.label || '(unnamed)'}`);
    out.push('');
    out.push(`Generated by \`tools/content-type-designer\`. Every line below is a decision that was made in the form — nothing here was inferred by a model.`);
    out.push('');
    out.push('## 1. Identity');
    out.push('');
    out.push(table(['Decision', 'Value'], [
        ['Label', d.label],
        ['Plural', d.plural],
        ['GraphQL / domain enum', `\`${d.enumValue}\``],
        ['DB value (lowercased by the mapper)', `\`${d.enumValue.toLowerCase()}\``],
        ['What one row is', d.gist],
        ['Type icon', d.icon],
        ['Accent colour', d.accent]
    ]));
    out.push('## 2. Ingestion & enrichment');
    out.push('');
    out.push(table(['Decision', 'Value'], [
        ['Ingestion method', d.ingestion],
        ['Enrichment source', d.enrichment],
        ['URL required', d.urlRequired ? YES : NO],
        ['Accepted URL shapes', d.urlPattern],
        ['Natural identity / dedup key', d.identity],
        [
            'Cross-type URL uniqueness',
            d.sharesUrlSpace
                ? 'MUST relax the global `UNIQUE(url)` constraint — this type can share a URL with another type. Migration required: replace with `UNIQUE(url, content_type)` or a partial index.'
                : 'Keep the existing global `UNIQUE(url)` constraint.'
        ],
        ['Thumbnail strategy', d.thumbnail]
    ]));
    if (d.ingestion === 'api' || d.ingestion === 'scrape') {
        out.push(`Adapter to build: \`backend/internal/adapters/${d.id}/\` (\`client.go\`, \`parser.go\`) behind a port interface in \`backend/internal/core/ports/services/\`, wired in \`cmd/server/main.go\`.`);
    }
    else if (d.ingestion === 'manual' || d.ingestion === 'url-only') {
        out.push('No external adapter. All fields come from the create form, so form validation is the only guard on data quality.');
    }
    else {
        out.push('No external adapter. The service resolves an existing `content` row (and a person record) instead of fetching.');
    }
    out.push('');
    out.push('## 3. Fields for this type');
    out.push('');
    out.push(table(['Column', 'Label for this type', 'Applicability', 'Source', 'Value path', 'Unit', 'Storage', 'Sortable', 'Default on'], chosen.map((col) => {
        const b = state.decisions[col.id];
        return [
            col.id,
            b.label || col.generic,
            b.applicability,
            b.source,
            b.path,
            b.unit ?? '—',
            storageNote(col),
            col.sortable ? YES : NO,
            b.defaultVisible ? YES : NO
        ];
    })));
    const styled = chosen.filter((col) => state.decisions[col.id].tooltip || state.decisions[col.id].appearance);
    if (styled.length > 0) {
        out.push('### Tooltips & cell appearance');
        out.push('');
        out.push(table(['Column', 'Label', 'Tooltip', 'Appearance'], styled.map((col) => {
            const b = state.decisions[col.id];
            return [col.id, b.label || col.generic, b.tooltip ?? col.tooltip, b.appearance ?? '—'];
        })));
    }
    const migrations = chosen.filter((c) => c.storage === 'promoted-column');
    out.push(migrations.length > 0
        ? `**Migration needed** for: ${migrations.map((c) => `\`${c.id}\``).join(', ')} — these are shared with other types and queried, so they earn a dedicated column rather than a JSONB path.`
        : '**No migration needed** — every field lands in an existing column or in `response` JSONB.');
    out.push('');
    const sortables = chosen.filter((c) => c.sortable && c.storage === 'jsonb');
    if (sortables.length > 0) {
        out.push('Sortable JSONB fields need a SQL extraction rule in `backend/internal/adapters/repositories/postgres/helpers.go` and a virtual GORM field in `gorm_models.go`:');
        out.push('');
        out.push(table(['Sort enum', 'SQLRepr'], sortables.map((c) => {
            const b = state.decisions[c.id];
            return [`ContentSortBy${c.id[0].toUpperCase()}${c.id.slice(1)}`, `\`${b.path}\``];
        })));
    }
    const filt = filterRows(state, chosen);
    out.push('### Filters');
    out.push('');
    out.push('Every filterable column needs server and client filtering with identical results: All Items mode sends the `ContentFilter` fields to the backend; Loaded mode runs `filterContentRows` over the loaded rows. Kind comes from the column value type (number and date are ranges; set is a checkbox list; text is contains).');
    out.push('');
    out.push(table(['Column', 'Label', 'Kind', 'Proposed ContentFilter field(s)', 'URL key (`f.<key>=`)', 'Chip label', 'Index'], filt.rows));
    out.push('Loaded / All parity: for each row above, `filterContentRows` (client) and the repository condition (server) must return the same rows for the same input, and a test must pin that.');
    out.push('');
    if (filt.none.length) {
        out.push(`No filter (derived, no backend field): ${filt.none.map((c) => `\`${c}\``).join(', ')} — do not ship a Loaded-only filter.`);
        out.push('');
    }
    out.push('## 4. Fields deliberately not carried');
    out.push('');
    out.push(table(['Column', 'Meaning elsewhere', 'Why not here'], rejected.map((col) => [
        col.generic || col.id,
        Object.entries(col.bindings)
            .slice(0, 3)
            .map(([t, b]) => `${typeLabel(t, d)}: ${b.label}`)
            .join('; ') || '—',
        `n/a for ${d.label} — cells render "${col.gapFallback}" when this type appears alongside types that do bind it.`
    ])));
    out.push('## 5. Default grid for the current selection');
    out.push('');
    out.push(`Selection: ${state.selected.map((t) => typeLabel(t, d)).join(', ') || '(none)'}`);
    out.push('');
    out.push(`Visibility rule: **${state.rule}** — a column is on by default when ${state.rule === 'any'
        ? 'any selected type defaults it on'
        : state.rule === 'all'
            ? 'every selected type defaults it on'
            : 'a majority of selected types default it on'}.`);
    out.push('');
    out.push(table(['Header shown', 'Column id', 'Group', 'Populated for', 'Blank for', 'Gap render', 'Tooltip'], grid.visible.map((rc) => [
        rc.header || '(icon)',
        rc.col.id,
        GROUP_LABELS[rc.col.group],
        rc.bound.map((t) => typeLabel(t, d)).join(', '),
        rc.unbound.map((t) => typeLabel(t, d)).join(', ') || '—',
        rc.unbound.length ? rc.col.gapFallback : '—',
        rc.tooltip
    ])));
    const mixedSorts = grid.visible.filter((rc) => rc.col.sortable && unitsFor(rc).length > 1);
    if (mixedSorts.length) {
        out.push('### Mixed-unit sort policy');
        out.push('');
        out.push('Sorting any of these columns on its own would order numbers that mean different things. The grid must not do it silently: when one becomes the *primary* sort key, show an alert and leave the order unchanged until the user picks one of:');
        out.push('');
        out.push('1. **Filter to one type** — one button per type, each named with its unit; the sort then applies within one unit.');
        out.push('2. **Sort by Type, then the column** — a multi-column sort with the unit-consistent Type column as priority 1, so each type is ordered within its own unit.');
        out.push('');
        out.push(table(['Column', 'Units in this selection'], mixedSorts.map((rc) => [rc.header || rc.col.generic, unitsFor(rc).join(' · ')])));
    }
    const multi = state.selected.length > 1;
    if (multi) {
        const aliased = grid.visible.filter((rc) => new Set(rc.aliases.map((a) => a.label)).size > 1);
        if (aliased.length) {
            out.push('### Per-type header aliases');
            out.push('');
            out.push('When exactly one type is filtered in, swap the generic header for the type-specific one:');
            out.push('');
            // Column-by-column alias rows, keyed off the full selection so every row
            // has the same arity even where a type has no binding.
            out.push(table(['Column', 'Generic header', ...state.selected.map((t) => typeLabel(t, d))], aliased.map((rc) => [
                rc.col.id,
                rc.col.generic,
                ...state.selected.map((t) => {
                    const a = rc.aliases.find((x) => x.typeId === t);
                    if (!a)
                        return '—';
                    return a.unit ? `${a.label} (${a.unit})` : a.label;
                })
            ])));
        }
    }
    const sampleRows = state.selected.flatMap((t) => samplesFor(t, state).map((cells) => ({ t, cells })));
    if (sampleRows.length > 0) {
        out.push('### Sample rows');
        out.push('');
        out.push(table(grid.visible.map((rc) => rc.header || '(icon)'), sampleRows.map(({ t, cells }) => grid.visible.map((rc) => {
            if (rc.col.id === 'perspectize')
                return '◎';
            if (rc.col.id === 'type')
                return typeLabel(t, d);
            if (!bindingFor(rc.col, t, state))
                return gapText(rc.col);
            const v = cells[rc.col.id];
            if (v === undefined)
                return '';
            return typeof v === 'string' ? v : v.sub ? `${v.text} / ${v.sub}` : v.text;
        }))));
    }
    out.push('## 6. Consistency review');
    out.push('');
    if (grid.warnings.length === 0) {
        out.push('No gaps flagged for this selection.');
    }
    else {
        for (const w of grid.warnings) {
            const tag = w.severity === 'error' ? 'MUST FIX' : w.severity === 'warn' ? 'GAP' : 'NOTE';
            out.push(`- **${tag}**${w.columnId ? ` (\`${w.columnId}\`)` : ''}: ${w.message}`);
        }
    }
    out.push('');
    out.push('## 7. Hidden-by-default columns (column picker)');
    out.push('');
    out.push(table(['Column', 'Why it is off by default'], grid.columns.filter((rc) => !rc.visible && rc.bound.length > 0).map((rc) => [rc.col.generic || rc.col.id, rc.reason])));
    out.push('## 7b. Details view');
    out.push('');
    out.push(...detailsSpec(state, d.id));
    out.push('## 8. Testing approach');
    out.push('');
    out.push(state.testingNotes.trim() || 'Follow the codebase instructions, then existing patterns, then judgment; stop and ask if genuinely unsure.');
    out.push('');
    if (state.deviations.trim()) {
        out.push('## 9. Conventions to ignore for this work only');
        out.push('');
        out.push(state.deviations.trim());
        out.push('');
    }
    const undecided = undecidedSurfaces(state);
    out.push('## Undecided surfaces');
    out.push('');
    out.push('Rows of the per-type surface checklist in `.claude/docs/ADDING_CONTENT_TYPE.md` that this form does not answer. Each is a blocker: answer it in the spec (or write "n/a because …") before implementation.');
    out.push('');
    out.push(table(['Surface', 'Question'], undecided.map((u) => [u.surface, u.question])));
    out.push('## Implementation checklist');
    out.push('');
    const steps = [
        `Domain: add \`ContentType${d.label.replace(/[^A-Za-z0-9]/g, '')} ContentType = "${d.enumValue}"\` in \`backend/internal/core/domain/content.go\`.`,
        sortables.length
            ? `Domain: add sort enums in \`domain/pagination.go\` for ${sortables.map((c) => c.id).join(', ')}.`
            : 'Domain: no new sort enums.',
        d.ingestion === 'api' || d.ingestion === 'scrape'
            ? `Adapter: \`backend/internal/adapters/${d.id}/\` against ${d.enrichment}.`
            : 'Adapter: none.',
        `Schema: add \`${d.enumValue}\` to the ContentType enum and a \`createContentFrom${d.label.replace(/[^A-Za-z0-9]/g, '')}\` mutation + input in \`backend/schema.graphql\`, then \`make graphql-gen\`.`,
        `Service: \`CreateFrom${d.label.replace(/[^A-Za-z0-9]/g, '')}\` in \`content_service.go\` — dedupe on ${d.identity}, validate, enrich, persist.`,
        migrations.length
            ? `Migration: promote ${migrations.map((c) => c.id).join(', ')} to columns (check \`ls backend/migrations/ | tail -5\` for the next number).`
            : 'Migration: none.',
        d.sharesUrlSpace ? 'Migration: relax `UNIQUE(url)` to be type-scoped.' : 'Constraint: `UNIQUE(url)` unchanged.',
        'Repository: sort rules in `helpers.go`, virtual fields in `gorm_models.go`.',
        ...(filt.rows.length
            ? [
                `Filters (backend): add ${filt.rows.map((r) => r[3]).join('; ')} to \`ContentFilter\` in \`schema.graphql\` and \`domain/pagination.go\`, the repository conditions in \`gorm_content_repository.go\`, and the mapping in \`content.resolvers.go\`; \`make graphql-gen\`.`,
                `Filters (frontend): \`filterKey\`/\`filterValue\`/\`filterRange\`/\`filterSet\` for ${filt.rows.map((r) => r[0]).join(', ')} in \`grid-config.ts\` COLUMNS, \`gridUrlState.ts\` mapping, \`filterContentRows\` client parity, FilterChips label.`
            ]
            : ['Filters: none.']),
        ...(mixedSorts.length
            ? [
                'Domain + repository: add `ContentSortByContentType` (`CONTENT_TYPE`) so `buildContentSortRulesMulti` can take Type as priority 1 ahead of a mixed-unit column.',
                `Frontend: in \`ActivityTable.svelte\` \`onSortChanged\`, when the primary sort column mixes units across the loaded types (${mixedSorts
                    .map((rc) => rc.header || rc.col.generic)
                    .join(', ')}), hold the sort and show the alert: filter to one type, or apply Type ▲ then the column via \`applyColumnState\` with \`sortIndex\` 0/1.`
            ]
            : []),
        'Resolver: mutation handler in `schema.resolvers.go`.',
        'Frontend: types + queries in `src/lib/queries/content.ts`; mutation hook alongside `useAddVideo.ts`.',
        d.urlRequired ? `Frontend: URL validation for ${d.urlPattern} in \`src/lib/utils/\`.` : 'Frontend: form validation for the manual fields (no URL rule).',
        `Frontend: \`typeCellRenderer\` icon (${d.icon}) and \`itemCellRenderer\` tile (${d.thumbnail}) in \`src/lib/utils/formatting.ts\`.`,
        `Frontend: column defs + tooltips in \`ActivityTable.svelte\` per section 5, with the alias swap from the per-type header table.`,
        'Tests: domain enum, service create paths, resolver mutation + filter-by-type, per-filter repo/resolver tests with Loaded/All parity, 2-page cursor pagination, formatting renderers, query definitions.',
        'Verify: `go build ./...`, `go test ./...`, `pnpm run test:run`.'
    ];
    for (const s of steps)
        out.push(`- [ ] ${s}`);
    out.push('');
    return out.join('\n');
}
/** Compact matrix of every seeded type against every column — the cross-type sanity check. */
export function buildMatrix(state) {
    const ids = [state.draft.id, ...TYPES.map((t) => t.id)];
    const rows = COLUMNS.map((col) => [
        col.generic || col.id,
        ...ids.map((id) => {
            const b = bindingFor(col, id, state);
            if (!b)
                return '—';
            return `${b.label || '·'}${b.defaultVisible ? ' ●' : ' ○'}`;
        })
    ]);
    return [
        '# Column × content type matrix',
        '',
        '● default-visible for that type, ○ available but off by default, — not applicable.',
        '',
        table(['Column', ...ids.map((id) => (id === state.draft.id ? `${typeLabel(id, state.draft)} (draft)` : typeLabel(id, state.draft)))], rows)
    ].join('\n');
}
function layoutOf(state, typeId) {
    const lookup = typeId === state.draft.id ? state.seed ?? typeId : typeId;
    return detailsFor(lookup, typeLabel(typeId, state.draft), (col) => bindingFor(col, typeId, state)?.defaultVisible === true);
}
/** The details-view part of a type's spec: header, hero, tiles, sections. */
function detailsSpec(state, typeId) {
    const layout = layoutOf(state, typeId);
    const col = (id) => (id ? COLUMNS.find((c) => c.id === id) : undefined);
    const out = [];
    const subtitle = layout.subtitle.map((s) => (typeof s === 'string' ? s : `${s.key} + " ${s.suffix}"`));
    out.push(table(['Part', 'Decision'], [
        ['Header band', layout.heading.toUpperCase()],
        ['Media', layout.media],
        ['Breadcrumb', layout.breadcrumb?.join(' › ') || '—'],
        ['Title / tagline', `item${layout.tagline ? ` / ${layout.tagline} (italic)` : ''}`],
        ['Subtitle', subtitle.join(' · ') || '—'],
        ['Links', [layout.link ?? 'url', ...(layout.links ?? []).map((l) => l.label)].join(', ')],
        ['Actions', layout.actions.join(', ')],
        ['Prev / next', layout.prevNext ? layout.prevNext.join(' / ') : '—'],
        ['Attribution', layout.attribution ?? '—']
    ]));
    out.push(table(['Tile', 'Value from', 'Tooltip'], layout.tiles.map((t) => {
        const b = t.col ? bindingFor(col(t.col), typeId, state) : undefined;
        return [
            t.label ?? b?.label ?? col(t.col)?.generic ?? t.key ?? '',
            t.source ?? b?.path ?? (t.col ? `(not bound for this type: ${t.col})` : ''),
            t.tooltip ?? b?.tooltip ?? col(t.col)?.tooltip ?? '—'
        ];
    })));
    out.push(table(['Section', 'Kind', 'Value from', 'Notes'], layout.sections.map((sec) => {
        const b = sec.col ? bindingFor(col(sec.col), typeId, state) : undefined;
        return [
            sec.label,
            sec.kind,
            sec.source ?? b?.path ?? sec.key ?? '',
            [sec.tooltip ?? b?.tooltip, sec.spoiler ? 'spoiler-blurred until hover' : ''].filter(Boolean).join(' — ') || '—'
        ];
    })));
    if (layout.notes?.length) {
        for (const n of layout.notes)
            out.push(`- ${n}`);
        out.push('');
    }
    return out;
}
/**
 * Per-type single-type views for every type selected in section 4: the
 * suggested default columns (with what-if overrides), header + cell tooltips,
 * what stays in the column picker, and the details view layout.
 */
export function buildSoloViews(state) {
    const out = ['# Single-type views', ''];
    out.push('What the Activity table shows when exactly one type is filtered in, and what its details modal shows. Generated by `tools/content-type-designer` from the types selected in section 4.');
    out.push('');
    for (const typeId of state.selected) {
        const label = typeLabel(typeId, state.draft);
        const solo = { ...state, selected: [typeId] };
        const overrides = state.soloOverrides?.[typeId];
        const grid = resolveGrid(solo, overrides);
        out.push(`## ${label}`);
        out.push('');
        out.push(`### Default columns (${grid.visible.length})`);
        out.push('');
        out.push(table(['#', 'Header', 'Column', 'Header tooltip', 'Cell popover', 'Cell appearance'], grid.visible.map((rc, i) => {
            const b = bindingFor(rc.col, typeId, solo);
            return [
                String(i + 1),
                rc.header || '(icon)',
                `${rc.col.id}${overrides?.[rc.col.id] !== undefined ? ' (what-if)' : ''}`,
                rc.tooltip,
                b?.cellTip ?? 'default — displayed text, copy copies the raw value',
                b?.appearance ?? '—'
            ];
        })));
        const off = grid.columns.filter((rc) => !rc.visible && rc.bound.length > 0);
        out.push('### In the column picker (off by default)');
        out.push('');
        out.push(table(['Header', 'Column', 'Why off'], off.map((rc) => [rc.header || rc.col.generic, rc.col.id, rc.reason])));
        const warnings = grid.warnings;
        if (warnings.length) {
            for (const w of warnings)
                out.push(`- **${w.severity.toUpperCase()}**: ${w.message}`);
            out.push('');
        }
        out.push('### Details view');
        out.push('');
        out.push(...detailsSpec(state, typeId));
    }
    return out.join('\n');
}
//# sourceMappingURL=emit.js.map