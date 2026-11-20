/**
 * The metric registry: the one place a metric and an aggregator are defined. Both pages read
 * from it. The content page builds a column from (metric, aggregator); the perspectives page
 * builds a column from the same metric shown raw. Adding an aggregator is one AGGREGATORS entry,
 * adding a metric is one METRICS entry; neither adds columns per pair.
 */
import type { Perspective } from './fixture.js';

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export type MetricKind = 'STANDARD' | 'CUSTOM' | 'FEELING';
export type MetricId = 'quality' | 'agreement' | 'importance' | 'confidence' | 'clarity' | 'hopeful';

export interface Metric {
  id: MetricId;
  /** Header label (Title case; the grid uppercases it). */
  label: string;
  kind: MetricKind;
  /** What the backend is asked for: the enum value for a standard dimension, else the custom-field / feeling key. */
  key: string;
  /** Glossary definition, used in header tooltips. */
  gloss: string;
  /** Raw stored value on one perspective (0-10,000), or null when not rated. */
  read: (p: Perspective) => number | null;
}

export const METRICS: readonly Metric[] = [
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

export function metric(id: MetricId): Metric {
  return METRICS.find((m) => m.id === id)!;
}

// ---------------------------------------------------------------------------
// Aggregators
// ---------------------------------------------------------------------------

export type AggregatorId = 'avg' | 'count' | 'min' | 'max' | 'sum' | 'stddev';

export interface Aggregator {
  id: AggregatorId;
  /** Menu label. */
  label: string;
  /** Chip label in the header (lower case, short). */
  chip: string;
  /** Backend enum value. */
  gql: 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'SUM' | 'STDDEV';
  /** One line for the menu and the header tooltip. */
  describe: string;
  /** 'rating' values are formatted on the 0-10 scale, 'count' as whole numbers. */
  unit: 'rating' | 'count' | 'sum';
  /** Smallest n a value needs before it may be shown, under the proposed rule. */
  proposedMinN: number;
}

export const AGGREGATORS: readonly Aggregator[] = [
  { id: 'avg', label: 'Average', chip: 'avg', gql: 'AVG', describe: 'Mean of the ratings given.', unit: 'rating', proposedMinN: 3 },
  { id: 'count', label: 'Count', chip: 'count', gql: 'COUNT', describe: 'How many people rated it (rated values, not perspectives).', unit: 'count', proposedMinN: 1 },
  { id: 'stddev', label: 'Std dev', chip: 'std dev', gql: 'STDDEV', describe: 'How far ratings spread (sample standard deviation, 0-10 scale). Needs at least 2.', unit: 'rating', proposedMinN: 3 },
  { id: 'min', label: 'Minimum', chip: 'min', gql: 'MIN', describe: 'Lowest rating given. One person’s value, so it needs the most contributors.', unit: 'rating', proposedMinN: 5 },
  { id: 'max', label: 'Maximum', chip: 'max', gql: 'MAX', describe: 'Highest rating given. One person’s value, so it needs the most contributors.', unit: 'rating', proposedMinN: 5 },
  { id: 'sum', label: 'Sum', chip: 'sum', gql: 'SUM', describe: 'Total of the ratings. Mostly useful for feeling intensity and custom numeric fields.', unit: 'sum', proposedMinN: 3 },
];

export function aggregator(id: AggregatorId): Aggregator {
  return AGGREGATORS.find((a) => a.id === id)!;
}

// ---------------------------------------------------------------------------
// Privacy and counting policy (the switches on the Decisions panel)
// ---------------------------------------------------------------------------

export interface Policy {
  /** Minimum contributors before a value shows: per aggregator (proposed) or one flat number. */
  minN: 'proposed' | 'flat1' | 'flat2' | 'flat3' | 'flat5';
  /** Below the minimum: hide the value, or coarsen an average to a band (needs n >= 2). */
  below: 'hide' | 'coarsen';
  /**
   * Gather all: the request fetches every aggregator for each shown metric. The extra ones appear
   * only in the cell tooltip; the column still shows, sorts and filters by its one aggregator.
   */
  gatherAll: boolean;
  /** Contested: std dev >= 2.5, or range above Compare's diverges threshold (3.0). */
  contested: 'stddev' | 'range';
  /** Offer SUM on the four 0-10 rating dimensions (always offered on custom fields and feelings). */
  sumOnRatings: boolean;
}

export const DEFAULT_POLICY: Policy = {
  minN: 'proposed',
  below: 'hide',
  gatherAll: false,
  contested: 'stddev',
  sumOnRatings: false,
};

export function minNFor(agg: Aggregator, policy: Policy): number {
  if (agg.id === 'count') return 1;
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
export function spreadMinN(policy: Policy): number {
  return Math.max(minNFor(aggregator('min'), policy), minNFor(aggregator('max'), policy), 2);
}

/** Aggregators offered on a metric's chip menu under the current policy. */
export function aggregatorsFor(m: Metric, policy: Policy): Aggregator[] {
  return AGGREGATORS.filter((a) => a.id !== 'sum' || m.kind !== 'STANDARD' || policy.sumOnRatings);
}

export const CONTESTED_STDDEV = 2.5;
/** Compare's DIVERGES_THRESHOLD (comparePerspectives.ts): a gap above it is a "conflict". */
export const COMPARE_DIVERGES = 3.0;

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Stored 0-10,000 -> "7.5". */
export function fmtRating(stored: number): string {
  return (stored / 1000).toFixed(1);
}

export function fmtValue(agg: Aggregator, stored: number): string {
  if (agg.unit === 'count') return String(Math.round(stored));
  if (agg.unit === 'sum') return (stored / 1000).toFixed(1);
  return (stored / 1000).toFixed(agg.id === 'stddev' ? 2 : 1);
}

/** Header text "Quality · avg". */
export function columnTitle(m: Metric, agg: Aggregator): string {
  return `${m.label} · ${agg.chip}`;
}
