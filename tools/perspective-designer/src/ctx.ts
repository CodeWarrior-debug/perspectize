/** What every renderer gets: the state, a way to change it, and the open overlay (menu, dialog or sheet). */
import type { MetricId } from './registry.js';
import type { Page, State } from './state.js';

export type Host = 'desktop' | 'mobile';

export type Overlay =
  | { kind: 'aggMenu'; host: Host; metric: MetricId }
  | { kind: 'filter'; host: Host; page: Page; metric: MetricId }
  | { kind: 'columns'; host: Host; page: Page }
  | { kind: 'sort'; host: Host; page: Page }
  | { kind: 'metricsSheet'; host: Host }
  | { kind: 'filterSheet'; host: Host; page: Page }
  | { kind: 'cellSheet'; host: Host; contentId: number; metric: MetricId }
  | { kind: 'details'; host: Host; contentId: number }
  | { kind: 'perspective'; host: Host; id: number };

export interface Ctx {
  s: State;
  overlay: Overlay | null;
  /** Mutate the state and re-render everything. */
  set(fn: (s: State) => void): void;
  open(o: Overlay | null): void;
  /** Drill from a content row into its perspectives. */
  drill(contentId: number): void;
}
