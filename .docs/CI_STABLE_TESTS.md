# CI-stable frontend tests

How to write Vitest tests (`frontend/tests/`) that pass under full-suite load, not only on their own. Background and measurements: issue #728.

## Why tests fail only in the full run

The full unit run is about 250 files and 3,500 tests, spread over every core, and CI adds v8 coverage instrumentation. Under that load, **one-time cold costs grow 10x or more**. A test fails when one of them lands inside a timed wait:

| Timed wait                                                 | Limit    | What overran it                                                                                                                                                                               |
| ---------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findBy*` / `waitFor` (Testing Library `asyncUtilTimeout`) | 1,000 ms | Vite transforming a module the first time a `{#await import()}` block renders it                                                                                                              |
| The test itself (Vitest `testTimeout`)                     | 5,000 ms | The **first render** of a component in a worker. Measured on an idle machine: ThemeCustomizePanel 2.5 s cold, 0.08 s warm. Rendering a different, trivial component first does not absorb it. |
| The test itself                                            | 5,000 ms | `await import('$lib/...')` of a real module inside the test body                                                                                                                              |

In each case the test logic is fine: the wait covers a cost the test never meant to measure. The fix is to **pay the cost in a `beforeAll`**, which has its own generous timeout, so the timed test measures only the behaviour.

## The rules

1. **A component that renders `{#await import('X')}`: preload `X`.**

   ```ts
   import { preloadLazy } from "../helpers/warmUp";

   preloadLazy(() => import("$lib/components/ActivityDetailsModal.svelte"));
   ```

   Find them with `grep -rn "{#await import(" src/lib`. Every test file that renders one of those components needs the preload, even when it only sometimes reaches the lazy branch.

2. **A component whose render is heavy (a dialog, editor, popover, a long list): warm it up once.**

   ```ts
   import { warmUpRender, warmUp } from "../helpers/warmUp";

   warmUpRender(TodoDialog, { open: true, lists: LISTS }); // the props the tests use
   warmUp(() => renderPanel()); // or the file's own render helper
   ```

   Warm up the _same_ state the tests render (an open dialog, not a closed one). Place the call after the `vi.mock`s and before the first `describe`. Any mock the warm-up calls must be reset in `beforeEach`.

3. **Don't `await import()` a real module inside a test body.** Use a static top-level import: `vi.mock` is hoisted, so you still get the mocked module. If the file needs in-test imports (it calls `vi.resetModules()` or `vi.stubEnv()` between tests to get fresh module state), keep them, and preload the module with `preloadLazy` only when that doesn't change what the test checks.

4. **Don't raise a global timeout or add retries.** A global `testTimeout`, `asyncUtilTimeout` or `retry` hides real hangs everywhere to cover one cold cost. When a single test does genuinely heavy work on every run, not just the first (e.g. rendering all 28 theme presets), give that test its own timeout with a comment saying why: `it(name, fn, 15_000)`.

5. **Prefer cheap queries in large DOMs.** `getByRole(role, { name })` computes accessible names across the whole tree on every poll, which is slow in jsdom and slower under load. Inside a big dialog, scope it (`within(listbox).getByRole(...)`) or use `getByText` / `getByLabelText`.

## Proving a fix (red/green without luck)

Load is hard to reproduce on demand, so shrink the wait instead. Temporarily add this at the top of the file:

```ts
import { configure } from "@testing-library/svelte";
configure({ asyncUtilTimeout: 50 }); // TEMP probe, remove before commit
```

Then run the file alone. The test should fail without the fix and pass with it. For a `testTimeout` overrun, compare the first test's duration with and without the warm-up:

```bash
pnpm exec vitest run --project unit <file> --reporter=json --outputFile.json=/tmp/r.json
```

```bash
jq '.testResults[].assertionResults[] | {title, duration}' /tmp/r.json
```

## Finding load-only failures

Run the whole suite with the default worker count and save the results:

```bash
pnpm exec vitest run --project unit --reporter=dot --reporter=json --outputFile.json=/tmp/full.json
```

Note `uptime` before and after. **Don't oversubscribe hard** (e.g. `--maxWorkers=12 --coverage` on 8 cores while other work runs): at a load average around 5x the core count, every test slows past its limit, mid-file ones too, and the run says nothing about cold costs. One such run took 1,047 s and failed 26 tests across 20 files, against 442 s for a normal run. A useful run fails a few tests, mostly the first test in a file or a `findBy*` after a lazy import. To compare a fix, run the branch and `origin/main` under the same load.

List the failures, and the files whose slowest test came within half of a limit (the next ones to fail):

```bash
jq -r '.testResults[] | select(.status=="failed") | .name' /tmp/full.json
```

```bash
jq -r '.testResults[] | select([.assertionResults[].duration // 0] | max > 2500) | .name' /tmp/full.json
```

A file that fails here but passes alone is a cold-cost problem: apply rule 1, 2 or 3 to it. Don't skip it.

## CI configuration

- `frontend-test.yml` runs three jobs in parallel, so each failure shows on its own and none stops the others:
  - `check`: `pnpm run check` (svelte-check)
  - `unit`: `pnpm run test:coverage`
  - `browser`: `pnpm run test:browser`, with the Playwright Chromium download cached, keyed on the Playwright version
- A newer push to a PR cancels that PR's older run. Pushes to `main` are never cancelled.
- Vitest picks its worker count from the runner's cores; the config doesn't pin it.
- With `CI` set, `vite.config.ts` adds the `json` reporter (plus `github-actions`, which keeps inline PR annotations) and writes `frontend/test-results/vitest-results.json`. The browser run writes `vitest-browser-results.json`.
- In both test jobs, the **List failed test files** step (`.github/scripts/list-failed-tests.sh`) writes every failed file to the job summary. **Upload test results** keeps the JSON as the `vitest-results-unit` / `vitest-results-browser` artifact. When several files fail at once, none of them scrolls off the log.
- No global retries and no raised global timeouts, on purpose (rule 4).
