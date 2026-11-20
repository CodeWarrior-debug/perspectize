export const METRICS = [
    { id: 'quality', label: 'Quality', kind: 'STANDARD', key: 'QUALITY', gloss: 'How good the content is.', read: (p) => p.quality },
    { id: 'agreement', label: 'Agreement', kind: 'STANDARD', key: 'AGREEMENT', gloss: 'How far the owner agrees with the content.', read: (p) => p.agreement },
    { id: 'importance', label: 'Importance', kind: 'STANDARD', key: 'IMPORTANCE', gloss: 'How much the content matters.', read: (p) => p.importance },
    { id: 'confidence', label: 'Confidence', kind: 'STANDARD', key: 'CONFIDENCE', gloss: 'How sure the owner is of their own view.', read: (p) => p.confidence },
    {
        id: 'clarity',
        label: 'Clarity',
        kind: 'CUSTOM',
        key: 'clarity',
        gloss: 'Optional dimension (a numeric custom field): how clearly the content makes its case.',
        read: (p) => p.custom.clarity ?? null,
    },
    {
        id: 'hopeful',
        label: 'Hopeful',
        kind: 'FEELING',
        key: 'Hopeful',
        gloss: 'Intensity of the 🤞 Hopeful feeling, on the rating scale. Perspectives without the feeling are not rated, not zero.',
        read: (p) => p.feelings.find((f) => f.label === 'Hopeful')?.intensity ?? null,
    },
];
export function metric(id) {
    return METRICS.find((m) => m.id === id);
}
export const AGGREGATORS = [
    { id: 'avg', label: 'Average', chip: 'avg', gql: 'AVG', describe: 'Mean of the ratings given.', unit: 'rating', proposedMinN: 3 },
    { id: 'count', label: 'Count', chip: 'count', gql: 'COUNT', describe: 'How many people rated it (rated values, not perspectives).', unit: 'count', proposedMinN: 1 },
    { id: 'stddev', label: 'Std dev', chip: 'std dev', gql: 'STDDEV', describe: 'How far ratings spread (sample standard deviation, 0-10 scale). Needs at least 2.', unit: 'rating', proposedMinN: 3 },
    { id: 'min', label: 'Minimum', chip: 'min', gql: 'MIN', describe: 'Lowest rating given. One person’s value, so it needs the most contributors.', unit: 'rating', proposedMinN: 5 },
    { id: 'max', label: 'Maximum', chip: 'max', gql: 'MAX', describe: 'Highest rating given. One person’s value, so it needs the most contributors.', unit: 'rating', proposedMinN: 5 },
    { id: 'sum', label: 'Sum', chip: 'sum', gql: 'SUM', describe: 'Total of the ratings. Mostly useful for feeling intensity and custom numeric fields.', unit: 'sum', proposedMinN: 3 },
];
export function aggregator(id) {
    return AGGREGATORS.find((a) => a.id === id);
}
export const DEFAULT_POLICY = {
    minN: 'proposed',
    below: 'hide',
    gatherAll: false,
    contested: 'stddev',
    sumOnRatings: false,
};
export function minNFor(agg, policy) {
    if (agg.id === 'count')
        return 1;
    switch (policy.minN) {
        case 'proposed':
            return agg.proposedMinN;
        case 'flat1':
            return 1;
        case 'flat2':
            return 2;
        case 'flat3':
            return 3;
        case 'flat5':
            return 5;
    }
}
/** The spread bar draws the lowest and highest rating, so it is gated like MIN/MAX. */
export function spreadMinN(policy) {
    return Math.max(minNFor(aggregator('min'), policy), minNFor(aggregator('max'), policy), 2);
}
/** Aggregators offered on a metric's chip menu under the current policy. */
export function aggregatorsFor(m, policy) {
    return AGGREGATORS.filter((a) => a.id !== 'sum' || m.kind !== 'STANDARD' || policy.sumOnRatings);
}
export const CONTESTED_STDDEV = 2.5;
/** Compare's DIVERGES_THRESHOLD (comparePerspectives.ts): a gap above it is a "conflict". */
export const COMPARE_DIVERGES = 3.0;
// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
/** Stored 0-10,000 -> "7.5". */
export function fmtRating(stored) {
    return (stored / 1000).toFixed(1);
}
export function fmtValue(agg, stored) {
    if (agg.unit === 'count')
        return String(Math.round(stored));
    if (agg.unit === 'sum')
        return (stored / 1000).toFixed(1);
    return (stored / 1000).toFixed(agg.id === 'stddev' ? 2 : 1);
}
/** Header text "Quality · avg". */
export function columnTitle(m, agg) {
    return `${m.label} · ${agg.chip}`;
}
//# sourceMappingURL=registry.js.map