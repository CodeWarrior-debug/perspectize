import { el } from './dom.js';
import { TYPE_META } from './fixture.js';
import { CONTESTED_STDDEV, COMPARE_DIVERGES, aggregator, fmtRating, metric, minNFor, spreadMinN, } from './registry.js';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Nov 3, 2026" in UTC, so the preview renders the same everywhere. */
export function fmtDate(iso) {
    if (!iso)
        return '';
    const d = new Date(iso);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
/** "Movie · Denis Villeneuve"; a claim has no creator, so just "Claim". */
export function subline(c) {
    return [TYPE_META[c.type].label, c.creator].filter(Boolean).join(' · ');
}
export function typeTile(c, cls = 'thumb') {
    const meta = TYPE_META[c.type];
    const tile = el('span', { class: cls, title: meta.label }, [meta.short]);
    tile.style.setProperty('--type-accent', meta.color);
    return tile;
}
/** 0-10 track with the min-max band and a mean tick. The band only draws when min/max may show. */
export function spreadBar(cell) {
    if (cell.n === 0 || (cell.mean === null && !cell.spread))
        return null;
    const bar = el('span', { class: `spread${cell.contested ? ' contested' : ''}`, 'aria-hidden': 'true' });
    if (cell.spread && cell.min !== null && cell.max !== null) {
        const band = el('span', { class: 'spread-band' });
        band.style.left = `${cell.min / 100}%`;
        band.style.width = `${Math.max(2, (cell.max - cell.min) / 100)}%`;
        bar.append(band);
    }
    if (cell.mean !== null) {
        const tick = el('span', { class: 'spread-mean' });
        tick.style.left = `${cell.mean / 100}%`;
        bar.append(tick);
    }
    return bar;
}
export function contestedMark() {
    return el('span', { class: 'contested-mark', 'aria-label': 'Contested', title: '' }, ['⚑']);
}
/** The value line: number, empty dash, lock or band. */
export function valueNode(cell) {
    switch (cell.state) {
        case 'empty':
            return el('span', { class: 'empty-marker' }, ['—']);
        case 'needs2':
            return el('span', { class: 'empty-marker' }, ['—']);
        case 'hidden':
            return el('span', { class: 'masked' }, [`🔒 n<${cell.minN}`]);
        case 'coarse':
            return el('span', { class: 'coarse' }, [`≈ ${cell.display}`]);
        default:
            return el('span', { class: 'num' }, [cell.display]);
    }
}
export function metricCellBody(cell, showN) {
    const top = el('div', { class: 'mc-top' }, [cell.contested ? contestedMark() : null, valueNode(cell)]);
    const bottom = el('div', { class: 'mc-bottom' }, [
        spreadBar(cell),
        showN && cell.agg !== 'count' ? el('span', { class: 'n' }, [cell.n ? `n ${cell.n}` : '']) : null,
    ]);
    return el('div', { class: 'mc' }, [top, bottom]);
}
function unitWord(policy, scope) {
    if (scope === 'mine')
        return 'of your perspectives';
    void policy;
    return 'people';
}
export const SCOPE_LABEL = {
    public: 'everyone’s public perspectives',
    mine: 'your own perspectives',
};
export function headerTip(id, policy, scope, aggId = aggregator('avg').id) {
    const m = metric(id);
    const agg = aggregator(aggId);
    const min = minNFor(agg, policy);
    return {
        title: `${m.label} · ${agg.label}`,
        body: [
            m.gloss,
            `${agg.describe}`,
            scope === 'mine'
                ? 'Only your own perspectives: nothing is hidden.'
                : agg.id === 'count'
                    ? 'Counts are always shown.'
                    : `Hidden below ${min} people, so a value can’t be traced to one person.`,
            `From ${SCOPE_LABEL[scope]}; one vote per person, the public perspective wins.`,
            `Sorts and filters by ${agg.label.toLowerCase()} only: a hidden value counts as empty and sorts last.`,
        ],
        meta: [`metric: { kind: ${m.kind}, key: "${m.key}" }`, `aggregator: ${agg.gql}`],
    };
}
export function cellTip(row, cell, policy, scope, drill) {
    const m = metric(cell.metric);
    const agg = aggregator(cell.agg);
    const who = unitWord(policy, scope);
    const rows = [];
    const title = cell.state === 'empty'
        ? `No one has rated ${m.label} yet`
        : cell.state === 'needs2'
            ? 'Std dev needs at least 2 ratings'
            : cell.state === 'hidden'
                ? `Hidden: ${cell.n} ${who}, needs ${cell.minN}`
                : cell.state === 'coarse'
                    ? `Average ${cell.display} (coarsened: ${cell.n} ${who})`
                    : `${agg.label} ${m.label}: ${cell.display}`;
    rows.push(['Rated by', `${cell.n} ${who}`]);
    if (cell.all) {
        // Gather all: the other aggregators, tooltip only (not columns, not sortable, not filterable).
        for (const a of cell.all)
            rows.push([aggregator(a.agg).label, a.text]);
    }
    else {
        if (cell.min !== null && cell.max !== null)
            rows.push(['Range', `${fmtRating(cell.min)} – ${fmtRating(cell.max)}`]);
        else if (cell.n >= 2 && scope !== 'mine')
            rows.push(['Range', `shown from ${spreadMinN(policy)} ${who}`]);
    }
    if (scope !== 'mine')
        rows.push(['Mine', cell.mine === null ? '—' : fmtRating(cell.mine)]);
    if (row.visible < row.total)
        rows.push(['You can open', `${row.visible} of ${row.total} perspectives`]);
    const body = [];
    if (cell.contested)
        body.push(policy.contested === 'stddev'
            ? `Contested: ratings spread ${CONTESTED_STDDEV}+ (std dev) across ${cell.n} ${who}.`
            : `Contested: lowest and highest differ by more than ${COMPARE_DIVERGES} (Compare’s “conflict”).`);
    if (cell.state === 'hidden')
        body.push('A value from so few people could be traced back to one of them.');
    return {
        title,
        body,
        rows,
        copy: cell.state === 'value' ? cell.display : undefined,
        meta: [
            `cell: { value, n: ${cell.n}, hidden: ${cell.state === 'hidden'} }`,
            cell.all ? 'gatherAll: other aggregators shown here only' : `sorted / filtered by ${agg.gql} only`,
        ],
        action: drill && row.visible ? { label: `See the ${row.visible} perspective${row.visible === 1 ? '' : 's'} you can open →`, run: drill } : undefined,
    };
}
export function rawValueNode(p, id) {
    const v = metric(id).read(p);
    return v === null ? el('span', { class: 'empty-marker' }, ['—']) : el('span', { class: 'num' }, [fmtRating(v)]);
}
export function rawTip(p, id) {
    const m = metric(id);
    const v = m.read(p);
    return v === null
        ? { title: `${m.label}: not rated`, body: ['Missing is not zero: this perspective left it blank.'] }
        : { title: `${m.label}: ${fmtRating(v)}`, body: [`Stored ${v} of 10,000.`], copy: fmtRating(v) };
}
export function feelingsNode(p) {
    if (!p.feelings.length)
        return el('span', { class: 'empty-marker' }, ['—']);
    return el('span', { class: 'feelings' }, p.feelings.map((f) => el('span', { class: 'feeling', title: `${f.label} · intensity ${fmtRating(f.intensity)}` }, [f.emoji])));
}
//# sourceMappingURL=cells.js.map