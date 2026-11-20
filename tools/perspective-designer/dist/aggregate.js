/**
 * Client-side stand-in for the proposed `contentMetrics` query: one cell per (content, metric,
 * aggregator), with the contributor count, the privacy mask and the contested flag. The order of
 * operations is the contract the backend has to keep:
 *
 *   eligible rows (scope + privacy) -> one vote per user -> rated values -> aggregate
 *   -> mask below the minimum n -> THEN sort and filter on the masked value.
 *
 * Masking before sort/filter matters: a hidden MIN that still sorted into its true position (or
 * matched a range filter) would leak the value it hides.
 */
import { CONTENT, PERSPECTIVES, VIEWER } from './fixture.js';
import { COMPARE_DIVERGES, CONTESTED_STDDEV, METRICS, aggregator, aggregatorsFor, fmtValue, minNFor, spreadMinN, } from './registry.js';
function eligible(rows, scope) {
    if (scope === 'mine')
        return rows.filter((p) => p.owner === VIEWER);
    if (scope === 'public')
        return rows.filter((p) => p.privacy === 'PUBLIC');
    return rows.filter((p) => p.privacy === 'PUBLIC' || p.allowInAggregates);
}
/** ADR 0002 section 7: at most one vote per user per content; the public row wins, else the newest. */
function oneVotePerUser(rows) {
    const byOwner = new Map();
    for (const p of rows) {
        const cur = byOwner.get(p.owner);
        if (!cur)
            byOwner.set(p.owner, p);
        else if (cur.privacy !== 'PUBLIC' && (p.privacy === 'PUBLIC' || p.updatedAt > cur.updatedAt))
            byOwner.set(p.owner, p);
    }
    return [...byOwner.values()];
}
function stats(values) {
    const n = values.length;
    if (n === 0)
        return { mean: null, sd: null, min: null, max: null, sum: 0 };
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    // Sample standard deviation (Postgres stddev / stddev_samp): undefined for a single value.
    const sd = n < 2 ? null : Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
    return { mean, sd, min: Math.min(...values), max: Math.max(...values), sum };
}
function band(stored) {
    const v = stored / 1000;
    if (v < 4)
        return '0–4';
    if (v < 7)
        return '4–7';
    return '7–10';
}
export function computeCell(rows, metricId, aggId, scope, policy) {
    const m = METRICS.find((x) => x.id === metricId);
    const agg = aggregator(aggId);
    const values = rows.map((p) => m.read(p)).filter((v) => v !== null);
    const n = values.length;
    const s = stats(values);
    const mask = scope !== 'mine';
    const minN = mask ? minNFor(agg, policy) : 1;
    const sdN = mask ? minNFor(aggregator('stddev'), policy) : 2;
    const meanN = mask ? minNFor(aggregator('avg'), policy) : 1;
    const spread = n >= 2 && (!mask || n >= spreadMinN(policy));
    const contestedSpread = policy.contested === 'stddev' ? (s.sd ?? 0) >= CONTESTED_STDDEV * 1000 : (s.max ?? 0) - (s.min ?? 0) > COMPARE_DIVERGES * 1000;
    const contested = n >= 3 && n >= sdN && contestedSpread;
    const base = {
        metric: metricId,
        agg: aggId,
        state: 'value',
        display: '',
        n,
        minN,
        mean: n >= meanN ? s.mean : null,
        sd: n >= Math.max(sdN, 2) ? s.sd : null,
        min: spread ? s.min : null,
        max: spread ? s.max : null,
        spread,
        contested,
        sortValue: null,
        mine: null,
    };
    if (aggId === 'count')
        return { ...base, display: String(n), sortValue: n };
    if (n === 0)
        return { ...base, state: 'empty' };
    if (n < minN) {
        if (policy.below === 'coarsen' && aggId === 'avg' && n >= 2) {
            const b = band(s.mean);
            const mid = b === '0–4' ? 2 : b === '4–7' ? 5.5 : 8.5;
            return { ...base, state: 'coarse', display: b, sortValue: mid };
        }
        return { ...base, state: 'hidden' };
    }
    const raw = aggId === 'avg' ? s.mean : aggId === 'min' ? s.min : aggId === 'max' ? s.max : aggId === 'sum' ? s.sum : s.sd;
    if (raw === null)
        return { ...base, state: 'needs2' };
    return { ...base, display: fmtValue(agg, raw), sortValue: raw / 1000 };
}
export function contentRows(scope, policy, aggs) {
    return CONTENT.map((content) => {
        const all = PERSPECTIVES.filter((p) => p.contentId === content.id);
        const counted = oneVotePerUser(eligible(all, scope));
        const own = oneVotePerUser(all.filter((p) => p.owner === VIEWER))[0];
        const cells = {};
        for (const m of METRICS) {
            const cell = computeCell(counted, m.id, aggs[m.id], scope, policy);
            cell.mine = own ? m.read(own) : null;
            if (policy.gatherAll) {
                cell.all = aggregatorsFor(m, policy)
                    .filter((a) => a.id !== aggs[m.id])
                    .map((a) => {
                    const c = computeCell(counted, m.id, a.id, scope, policy);
                    const text = c.state === 'value' ? c.display : c.state === 'hidden' ? `hidden (needs ${c.minN})` : c.state === 'coarse' ? `≈ ${c.display}` : '—';
                    return { agg: a.id, text };
                });
            }
            cells[m.id] = cell;
        }
        const lastRated = counted.length ? counted.map((p) => p.updatedAt).sort().at(-1) : null;
        return {
            content,
            counted: counted.length,
            total: all.length,
            visible: all.filter((p) => p.privacy === 'PUBLIC' || p.owner === VIEWER).length,
            cells,
            lastRated,
        };
    });
}
/** Perspectives the viewer may read in a scope: their own (mine), or public plus their own (public). */
export function readablePerspectives(scope) {
    return PERSPECTIVES.filter((p) => p.owner === VIEWER || (scope === 'public' && p.privacy === 'PUBLIC'));
}
//# sourceMappingURL=aggregate.js.map