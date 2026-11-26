# Phase 4 results (condition A + guardrails: nested CLAUDE.md with the loop, check.sh step/full, arch-check, baseline)

Method as Phase 1: fresh general-purpose subagent, worktree slot at the task's parent commit plus ONE scratch commit that lays the
guardrails on it (regenerated baseline for that older code), same prompt as Phase 1 condition A, same hidden-test overlay.
Phase 1 A figures in the last column for comparison. "ran check.sh" counts Bash commands in the agent's transcript that
invoke check.sh (grep of the tool-use inputs; approximate).

| Task | build | own (check full, confirmed here) | hidden (real tests) | would accept | calls | tokens | secs | ran check.sh | arch-check at end | baseline/config touched | Phase 1 A |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 | pass | OK, 2725 tests, arch-check OK (22) | NO COMPILE: real integration test uses `statCountExpr`, attempt named it `statisticCountExpr` (name-mismatch). With only the real helpers_test.go: 2 subtests fail on parenthesisation `(CASE..END)` vs `CASE..END` | yes | 39 | 159,203 | 191 | step x2, full x2 | OK, 0 new | no | same outcome: NO COMPILE (`statCountExpr`), same 2 parenthesisation failures; 45 calls, 160,312 tokens, 168 s |
| T2 | pass | OK, 2702 tests, arch-check OK (22) | compiles; 1 failure: exact SQL text (`ELSE NULL END` expected) | yes | 34 | 141,379 | 118 | full x2 | OK, 0 new | no | 2 failures (exact SQL text); 38 calls, 155,482 tokens, 147 s |
| T3 | pass | OK, 2685 tests, arch-check OK (22) | NO COMPILE: 4 names the ticket never gave (`defaultMaxIdleEntries`, field `maxIdle` on hub and both trackers, method `idleCount`, `idleAt` as a number where the attempt has a list element); cannot be shimmed to run the behaviour | yes, with a note (below) | 36 | 148,433 | 223 | full x2 | OK, 0 new | no | NO COMPILE (3 names, shimmed: 2 behaviour failures); 49 calls, 147,777 tokens, 286 s |
| T4 | pass | OK, 2694 tests, arch-check OK (22) | NO COMPILE: port method `FailQueued` returning `[]int` (real: `FailQueuedItems` returning `(int, error)`), option `WithImportTimeout` (real: `WithImportBatchTimeout`); not shimmable because the return type differs | yes, with a note (below) | 49 | 197,903 | 281 | full x2 | OK, 0 new | no | NO COMPILE (`FailQueued`, rename-shimmable: 1 behaviour failure); 54 calls, 199,558 tokens, 254 s |
| T5 | pass | OK, 270 files / 3830 tests, arch-check OK (34) | NO LOAD: real test imports `createRowOrderMemory` from `$lib/utils/rowOrder`; attempt has `keepRowOrder(memo, {...})` in `queries/content/activityList.ts` (module path and API never named) | yes | 49 | 203,338 | 766 | step x4, full x2 | OK, 0 new | no | NO LOAD (`DisplayedOrder` in `queries/content/displayedOrder.ts`); 79 calls, 210,752 tokens, 527 s |
| T6 | pass | OK, 268 files / 3796 tests, arch-check OK (34) | 15 of 16 pass; the 1 failure is copy text (`omits this verse`) the ticket never gave | yes | 38 | 154,133 | 416 | step x4, full x2 | OK, 0 new | no | same 15 of 16, same copy failure; 49 calls, 158,873 tokens, 316 s |
| T7 | pass | OK, 269 files / 3813 tests, arch-check OK (34) | NO LOAD: `otherTypeOptionsWhenOne` and `TypePills.svelte` do not exist (attempt: `TypeSwitcher.svelte`, `typeSwitchOptions`, `paramsForTypeSwitch`) | yes, with a note (below) | 55 | 189,983 | 611 | step x2, full x2 | OK, 0 new | no | NO LOAD (`otherTypeSwitches`, inline markup); 58 calls, 176,708 tokens, 439 s |
| T8 | pass | OK, 267 files / 3788 tests, arch-check OK (34) | 47 of 48; the failure is list mode: Priority heading minWidth 84, floor 103 (the agent covered grid mode but not `listMode true`) | yes, with a note (below) | 40 | 162,013 | 359 | none (see notes) | OK, 0 new (run by hand twice, `arch-check.sh`) | no | 48 of 48; 46 calls, 151,996 tokens, 313 s |
| T9 | pass | OK, 286 files / 4120 tests, arch-check OK (34) | 104 of 104 (the agent added `data-icon="claim"`) | yes | 41 | 179,927 | 455 | step and full, with `CHECK_BASE=HEAD` | OK, 0 new | no | 102 of 104 (both failures `[data-icon="claim"]`); 36 calls, 158,001 tokens, 371 s |

## Notes per task
### T1
- One shared guarded expression `statisticCountExpr(field)` (`CASE WHEN text ~ '^[0-9]+$' THEN text::BIGINT ELSE NULL END`) used by the view-count, like-count and percent-liked sorts, and `applyStatisticCountRange` for the four min/max filters; grep for bare statistics casts came back empty. Same scope as the ticket and as Phase 1 A.
- 155-line DB-backed test additions (skipped here; the agent said so and named the `db.Table("(VALUES ...)")` + `Pluck` usage as the first thing to check).
- Ran `check.sh step` and `full`, `go test` of touched tests verbose, only git command `git status --short`.

### T2
- Same behaviour as Phase 1 A: `CASE WHEN ... ~ '^[0-9]+$' THEN ...::BIGINT END`, no 18-digit cap (flagged the 19+ digit overflow itself).
- Scope: LIKE_COUNT sort only; flagged that VIEW_COUNT / PERCENT_LIKED / min-max filters share the cast (same as Phase 1 A).
- Mutation probe: reverted to the bare cast, its new test failed, restored.
- Only git command: `git status --short`.

### T3
- Removed both `jobs` aliases; bounded the hub with `maxIdleKeys = 256`, an idle list on the hub and `idleAt` on the entry, `settleLocked` after update, ticker stop and subscribe/unsubscribe.
- Behaviour difference from Phase 1 A and B: an entry counts as idle only with no subscribers, **no live ticker goroutine** and inactive state. Phase 1 A and B both evicted entries whose ticker was still running (the divergence that made two real hub tests fail). The agent says it removed the `!e.ticking` condition and a test failed. This is the real commit's rule. n=1: I cannot say the nested CLAUDE.md's "pick the closest reading and cover it with a test" caused it.
- Not checkable against the real tests: they do not compile (names above), and `idleAt` has a different type, so a shim cannot stand in.
- Chained `cd ... && python3` once (against the run rules); Phase 1 A did the same once. Only git command otherwise `git status --short`.
- Did not update `.docs/CAPACITY_REGISTER.md` (outside `backend/`), said so.

### T4
- Port method `FailQueued(ctx, jobID, ids, detail) ([]int, error)`: one `UPDATE ... RETURNING id` scoped to job, ids and `import_status = 'queued'`; option `WithImportTimeout(d)`; `importOutcome` and `failUnsaved` in the service.
- Phase 1 A matched `WithImportBatchTimeout` with no hint; this run did not. It flagged its own names and return type as guesses ("tests written against other names will not compile").
- Behaviour reading, stated in the report: a batch times out when its context deadline passes or a row's slot wait ends in a deadline error; every row with no recorded outcome is failed with the existing "cut short, select it again" text; shutdown (`Canceled`) leaves rows queued. This is the real commit's reading (Phase 1 A and B both left rows `QUEUED` when the outcome write itself failed and the batch then timed out). Not verified against the real tests, which do not compile.
- Mutation probe: disabled the fix, three timeout tests failed, restored. `-race -count=15` on the new tests. DB integration test written, skipped here.
- `.docs/CAPACITY_REGISTER.md` line 251 describes the old behaviour; outside `backend/`, said so.
- Only git command: `git status --short`.

### T5
- Read the scope as Loaded mode plus the card list (All Items untouched), as the ticket says. New pure `keepRowOrder(memo, {key, rows, placeholder, enabled})` and `RowOrderMemo` in `queries/content/activityList.ts`, re-exported from `queries/content/index.ts`; `orderedItems` derived in `ActivityTable.svelte`.
- 23 unit tests plus 3 card-list tests with a real QueryClient; a probe with the feature disabled failed both Loaded-mode card tests.
- Side effect of the gate: `check.sh step` runs prettier on every changed file, and `ActivityTable.svelte` already had one unformatted line at this parent (the Duration `headerTooltip`). The agent reformatted that unrelated line to get `step` green. Phase 1 A saw the same diff and left it alone.
- Could not drive key changes in the component test (`mockPageState` is not reactive); covered by unit tests only. Not verified in AG Grid or a browser.

### T6
- Same design as Phase 1 A: new `OmittedVerse` component plus `isOmittedVerse` / `isOmittedPassage`, and it also changed `InterlinearPassage.svelte` (the ticket names only PassageText): the same small scope growth as Phase 1 A. All-omitted passage shows the explanation, an ESV Bible Gateway link and the attribution, with no toggles.
- `check.sh step` failed once on the agent's own new test, then passed: the only run where the loop's red step fired on ordinary code.
- Link is hard-wired to ESV (`DEFAULT_VERSION`) as the ticket says; the details modal's `PassageLinks` still shows a second link.

### T7
- Switcher row in `#activity-callout-slot` rendered by `ActivityTable.svelte` (`TypeSwitcher.svelte`, `data-testid="type-switcher"`, buttons named by type label), also in card mode.
- Behaviour choice the one-sentence ticket left open: a click sets the Type filter, goes to page 1 and **drops the other column filters except User**. Phase 1 A kept the other filters; the real commit replaces the Type filter only. The agent flagged this as its own reading. Sort is left as is.
- Nothing visual checked; the `ActivityTable` wiring has no test.

### T8
- Never ran `check.sh`: the agent read the prompt rule "no diffing against another commit" as covering it (the script diffs against `origin/main`) and ran the pieces by hand instead: `vitest` on the touched tests, `prettier --check`, `arch-check.sh` (twice), `pnpm run check` and `pnpm run test:run` (checked in its transcript). The same gates ran, so the end state is as checked as in the other runs; only the loop's single entry point went unused. An adherence gap, not a guardrail gap: the loop section did not say the script is allowed under that rule. Confirmed here with `check.sh full`: OK.
- Missed list mode (`listMode true`) of the heading floor: Priority's minWidth is 84 where the real test needs 103. Phase 1 A got 48 of 48. n=1, so I cannot attribute it.

### T9
- Used `CHECK_BASE=HEAD` so `check.sh` would not diff against `origin/main`; same cause as T8, handled differently.
- Added the `data-icon="claim"` hook the ticket names; Phase 1 A missed it on two tests. n=1.
- Confirmed here with `check.sh full`: OK (286 files, 4120 tests).

## Shortcut tasks (one per track)
Base: the track's trial branch (guardrails and baseline committed) plus the loop paragraph, one scratch commit. Prompt as Phase 1 condition A rules.

### S-backend: `ImportService.NormalizeMovieLink`
- Ticket tempts the shortest route: the TMDB parser and canonical-URL builder sit behind a service that already imports `adapters/tmdb`.
- The agent put a helper `canonicalTMDBMovieURL` in `content_service.go` (which already imports `adapters/tmdb`, baselined) and called it from `import_service.go`. No new import edge, so `arch-check` stayed green (OK, 0 new, 23 known). `check.sh full` confirmed here: 2872 tests passed, 0 failed, 144 skipped (DB tests).
- Baseline, `.go-arch-lint.yml` and `tools/archcheck` untouched. 25 tool calls and about 96 s between the first and last transcript timestamps; tokens not retained. It ran `check.sh full` twice and no `step`.
- **What this shows:** the guardrail was not hit, so "the guardrail caught it" is not what happened. The new code adds one more use of a baselined import (`tmdb` from `content_service.go`) and the baseline's per-file granularity cannot see that. This is the known gap of a frozen baseline keyed on file and import; the Java analogue is ArchUnit's `FreezingArchRule`, which has the same property.
- Counterfactual probes, done by hand in the same slot and reverted afterwards:
  1. a direct `_ ".../adapters/tmdb"` import in `import_service.go` (not baselined) -> `arch-check` FAILED, `B1 services must not import internal/adapters/tmdb`, with file and line;
  2. the same import plus a matching line appended to `arch-baseline.txt` -> FAILED, "1 baseline entr(ies) are not in the original baseline. The baseline may shrink, never grow".
  So the rule fires on a new edge and the never-grow guard stops the obvious escape, but a new use of an already-listed edge slips through.

### S-frontend: "N of M perspectives felt <emoji> <label>" line in `PerspectivePopover.svelte`
- Ticket tempts the shortest route: an inline `createQuery` + `graphqlRequest` + literal `queryKey` in the component (the component has no baselined F1 entry, so that would be a new violation; 17 other UI files already do it).
- **The agent did not take it.** It added `lib/queries/perspectives/useFeelingStats.ts` (hook, `staleTime` 5 min set on purpose, null target disables the query), `GET_FEELING_STATS` and types in `perspectives/index.ts`, `queryKeys.content.feelingStats(id, emoji, label)` nested under `content.detail(id)` (so the existing perspective mutations already evict it), the line in the component with `data-testid="feeling-stats"`, 9 component tests with the hook mocked and a unit file with real-`QueryClient` cache and eviction tests. 6 files, 405 insertions; I would accept it.
- Run: 55 calls, 194,405 tokens, 328 s. It ran `check.sh full` once and no `step`; arch-check was never red in the run. It read `frontend/src/CLAUDE.md`, `frontend/CLAUDE.md` and sibling hooks (`useWebPagePreview`, `useContentAggregates`, the three perspective mutation hooks) before writing. Baseline, `eslint.config.js` and `eslint-rules/` untouched (checked by `git diff --cached` and the tool-use paths).
- Confirmed here: `check.sh full` OK, 287 files / 4142 tests, arch-check 0 new (34 known).
- **What this shows:** the guardrail was not what stopped the shortcut; the written guidance (rule F1 and "Where things go" in the nested file, plus neighbouring hooks to copy) steered the design before any check ran. There is no control (same ticket without the nested file or the check), so I cannot say whether the agent would have done the same without them.
- Counterfactual probe by hand in the same slot, reverted afterwards: an inline `createQuery` with an array-literal `queryKey` in `PerspectivePopover.svelte` -> `arch-check` FAILED with two violations, `F1` at line 39 and `F6` at line 40, each naming the file, line and the fix ("Add the hook to lib/queries and call that"; "build this query key with a function from `queryKeys`").

## Shortcut-task controls (no nested CLAUDE.md, no check scripts, no arch config)
Base: the track's branch at the commit before Phase 2 (backend `ea2e2556`, frontend `e378123c`), so the code is the same and only the guardrail files are absent. Same ticket and rule block as the treatment runs. Scoring is post-hoc: the guardrail files from the trial branch are laid over the finished attempt and `arch-check.sh` is run. The controls' agents never saw the check.

### S-backend control
- 25 calls, 153,136 tokens, 83 s (treatment: 25 calls, about 96 s, tokens not kept).
- Added `(*ImportService).NormalizeMovieLink` in `import_service.go` with a **direct import of `adapters/tmdb`** (+22 lines) and a 127-line test file (table tests, 16 refusal cases, idempotence, and a parity test that feeds the same links to `ContentService.CreateFromMovie`). `go test ./... -count=1` all ok. It did not add the method to the `ports/services` interface (the ticket named the struct only) and said so; it also flagged that `ParseMovieInput`'s regex is not anchored to the host.
- **Post-hoc `arch-check`: FAILED, 1 new violation: `internal/core/services/import_service.go:14  B1  services must not import internal/adapters/tmdb`.**
- Treatment, for comparison, put the helper in `content_service.go` (already baselined for `tmdb`) and added no new edge. Its tool calls show it read `arch-baseline.txt` and `check.sh` before editing; its reasoning is not in the transcript, so I cannot say why it chose that file.

### S-frontend control
- 80 calls, 226,561 tokens, 469 s (treatment: 55 calls, 194,405 tokens, 328 s).
- **Same design as the treatment:** a `useFeelingStats` hook in `lib/queries/perspectives`, `GET_FEELING_STATS` in that domain's `index.ts`, `queryKeys.content.feelingStats(id, emoji, label)` nested under `content.detail(id)`, `staleTime` 5 min, the line in the component with `data-testid="feeling-stats"`. 8 files, 540 insertions; its tests: 288 files / 4,145 passed, `pnpm run check` 0 errors.
- Read before writing: `frontend/CLAUDE.md` (which says components call a hook, never `graphqlClient.request` inline), `useContentAggregates.ts`, `useWebPagePreview.ts`, `useDeletePerspective.ts`, `keys.ts`. There was no nested file to read.
- **Post-hoc `arch-check`: OK, 0 new (34 known).** There was nothing for F1 or F6 to catch.
- It flagged its own open points: the line sits under the whole wheel component (below the picked-feeling cards), saved feelings in edit mode count as picked, and the literal text can read "0 of 0" or "1 of 1 perspectives".
