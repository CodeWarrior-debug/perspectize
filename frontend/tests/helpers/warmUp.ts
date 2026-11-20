/**
 * Move one-time cold costs out of the timed test and into a `beforeAll` (#728).
 *
 * Under full-suite load (every worker busy, coverage instrumentation on) two
 * costs grow 10x or more, and were the cause of every load-only failure:
 *
 * 1. A `{#await import('...')}` in a component makes Vite transform that module
 *    graph the first time it renders. A `findBy*` / `waitFor` (Testing Library's
 *    1000 ms `asyncUtilTimeout`) then waits on the transform, not on the UI.
 *    `preloadLazy` loads the module first, so the `{#await}` resolves at once.
 * 2. The first render of a component in a worker costs seconds (measured:
 *    ThemeCustomizePanel 2.5 s cold vs 0.08 s warm, idle machine), and a
 *    trivial component rendered first does not absorb it. The first test in a
 *    file then hits the 5 s `testTimeout`. `warmUpRender` renders and unmounts
 *    the component once before any test.
 *
 * Hooks get WARM_UP_TIMEOUT_MS instead of the 10 s default hook timeout, as the
 * cost they absorb is the one that balloons under load. See .docs/CI_STABLE_TESTS.md.
 */
import { beforeAll } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import type { Component } from 'svelte';

export const WARM_UP_TIMEOUT_MS = 60_000;

/** Load the targets of a component's `{#await import(...)}` blocks before any test runs. */
export function preloadLazy(...loaders: Array<() => Promise<unknown>>): void {
	beforeAll(async () => {
		await Promise.all(loaders.map((load) => load()));
	}, WARM_UP_TIMEOUT_MS);
}

/**
 * Render `component` with `props` and unmount it once before any test, so no
 * test pays its first-render cost. Use props that render what the tests render
 * (an open dialog, not a closed one). Mocks it calls during the warm-up must be
 * reset in `beforeEach` (most files already do).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function warmUpRender(component: Component<any>, props: Record<string, unknown> = {}): void {
	warmUp(() => render(component, { props }));
}

/**
 * Like `warmUpRender`, for a file that renders through its own helper (e.g. a
 * `renderPanel()` that wraps the component in a QueryClient): run it once, then
 * unmount everything.
 */
export function warmUp(renderOnce: () => unknown): void {
	beforeAll(async () => {
		await renderOnce();
		cleanup();
	}, WARM_UP_TIMEOUT_MS);
}
