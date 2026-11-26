# AI-coding workflow trial: summary

A rehearsal on this repo (Go backend, SvelteKit frontend) for a later recommendation on a brownfield Java codebase. Two independent tracks, each with its own log:

- **Backend (Go):** `docs/ai-trial-backend.md`.
- **Frontend (SvelteKit / TypeScript):** `docs/ai-trial-frontend.md`.
- **Raw material:** `docs/ai-trial-evidence/` (patches, prompts, notes, harness scripts, and the Phase 2 and 3 guardrail code as two patches).

The trial ran on local branches that were never pushed, and no database was touched. Only these documents are proposed for `main`. The guardrail code is not, because `main` gained its own enforcement of the same ground in #861 and #862 while the trial ran. Paths in the logs such as `backend/scripts/check.sh` therefore exist in the trial's patches, not on `main`.

Read the logs for method, evidence and caveats per phase. This file says what the whole trial showed, and how much of it I would trust.

## What was tried

| Phase | What | Result |
|---|---|---|
| 0 | Map the architecture, rank candidate rules, compare tools | 8 backend and 8 frontend candidate rules; you chose B1, B2, B3, B7 and F1, F2, F5, F6 |
| 1 | Baseline: 9 past commits (4 Go, 5 SvelteKit), each attempted from its parent by a fresh agent, **A** = the ticket alone, **B** = the ticket plus key files and the names the real fix introduced | Scored against the real commit's tests ("hidden tests") overlaid on each attempt |
| 2 | Feedback loop and guidance: `check.sh` with `fast`, `step` and `full` tiers, a PostToolUse hook, a lean nested `CLAUDE.md` per track, a ticket template per track | Built and timed; the hook and the template were never used by an agent |
| 3 | The chosen rules as checks, with a baseline of what already breaks and a never-grow guard | Go: `go-arch-lint` plus a custom `go/types` checker. TypeScript: four local ESLint rules with bulk suppressions |
| 4 | Rerun the nine tasks as **A + guardrails** (Phase 2 and 3 files plus a documented red-green loop), and one "tempting shortcut" task per track, each with a control run afterwards | See below |

Condition C (a third prompt variant) was dropped at your request. Wall-clock time is not reported, at your request.

## Before and after

Real-test outcome per task. "No compile" and "no load" mean the real test file could not run against the attempt, for a name the ticket never gave.

| Task | Phase 1 A | Phase 1 B | Phase 4 (A + guardrails) |
|---|---|---|---|
| T1 stat count casts | no compile (`statCountExpr`); with the real unit file, 2 parenthesisation failures | loads; the same 2 | no compile (`statisticCountExpr`); the same 2 |
| T2 like-count sort | loads; 2 fail on exact SQL text | loads; the same 2 | loads; 1 fails on exact SQL text |
| T3 hub idle cap | no compile (3 names); shimmed, 2 behaviour failures | no compile (1 name); the same 2 | no compile (4 names, not shimmable); behaviour reading differs, unchecked |
| T4 fail queued rows on timeout | no compile (`FailQueued`); renamed, 1 behaviour failure | loads; the same 1 | no compile (return type and option name differ); reading matches the real commit, unchecked |
| T5 keep row order | no load; 6 of 6 with an adapter | loads; 6 of 6 fail on method names | no load |
| T6 BSB omitted verses | 15 of 16 (copy text) | 15 of 16 | 15 of 16 (copy text) |
| T7 type switches | no load | loads; unit 5 of 5, component 4 fail | no load |
| T8 Plan grid header floor | 48 of 48 | 48 of 48 | 47 of 48 (list mode) |
| T9 claim icon | 102 of 104 (a `data-icon` hook) | 102 of 104 | 104 of 104 |

Totals:

| | A | B | A + guardrails |
|---|---|---|---|
| Real tests load: backend | 1 of 4 | 3 of 4 | 1 of 4 |
| Real tests load: frontend | 3 of 5 | 5 of 5 | 3 of 5 |
| **Real tests load: both** | **4 of 9** | **8 of 9** | **4 of 9** |
| **All real tests pass as delivered** | **1 of 9** | **1 of 9** | **1 of 9** |
| Tool calls (backend / frontend / both) | 186 / 268 / 454 | 195 / 224 / 419 | 158 / 223 / 381 |
| Tokens (both) | 1,519,459 | 1,485,127 | 1,536,312 |

Every A + guardrails attempt passed its own tests and ended with `arch-check` green (0 new violations); I confirmed each with `check.sh full` in its own slot. No agent edited a baseline or an arch config, in the nine reruns or the two shortcut tasks.

## What helped most

In order of how much evidence there is for it:

1. **Names, supplied up front.** The B hint is the only change that moved a hidden-test outcome: real tests loaded for 8 of 9 tasks instead of 4 of 9. It did not move "all pass" (1 of 9 either way), because what remained was behaviour the ticket left open, exact SQL or copy text, and names the hint did not carry. B is a best case: its hint was written from the real fix, which a person writing a ticket does not have. The ticket template (Phase 2) is the practical stand-in, and it is **untested**: Phase 4 reused the Phase 1 A prompts, and you are re-testing it separately.
2. **The nested `CLAUDE.md`, the check tiers and the loop.** Real-test outcomes did not change (4 of 9 load, 1 of 9 pass, both before and after). Tool calls fell in 8 of 9 tasks, 16% overall; tokens are flat (+1.1%; fell in 5 of 9 tasks). Eight of the nine agents ran `check.sh`; the ninth ran the same gates by hand. So the loop was followed, and it did not hurt, but I have no evidence that it changed results.
3. **The architecture rules.** They work as designed under deliberate probes (below). In the 11 runs that had them, none ended with a new violation, but no agent was seen reading a red check and fixing its code, so their effect on agent behaviour is **mostly unmeasured**. The one hint of an effect is the backend shortcut pair (below): the control created a new import edge the rule flags and the treatment did not. The frontend pair went the other way, and each side is one run.

If I had to name one thing from this trial to carry over, it is the first: put the names a test will use into the ticket. Everything else is plausible and cheap to build, but this trial gives no outcome evidence for it.

### The two shortcut tasks, each with a control

One ticket per track that tempts a violation. The treatment had the nested `CLAUDE.md` and the checks; the control ran on the commit before Phase 2 (same code, no guardrail files), and I laid the guardrails over its diff afterwards to score it.

| | Treatment (guardrails in view) | Control (no guardrails) | Control, scored by `arch-check` afterwards |
|---|---|---|---|
| Backend: `ImportService.NormalizeMovieLink` | Helper in `content_service.go`, where the `tmdb` import was already tolerated: no new edge. 25 calls | Direct `adapters/tmdb` import in `import_service.go`. 25 calls, 153,136 tokens | **FAILED**, 1 new B1 violation |
| Frontend: "N of M felt" line in `PerspectivePopover.svelte` | `useFeelingStats` hook plus a `queryKeys` entry. 55 calls, 194,405 tokens | The same design. 80 calls, 226,561 tokens | OK, 0 new |

The pairs point in opposite directions, one run per side. On the backend the guardrail files were in view and the new edge was not created; the treatment agent had read the baseline before choosing where to put the code, though its reasoning is not in the transcript. On the frontend the repo's existing `frontend/CLAUDE.md` and the neighbouring hooks were enough, with no guardrail. The backend treatment also avoided the new edge by putting the code where the same import was already tolerated, which is the gap described below.

### What the checks did when I tested them directly

These are deterministic probes, so they are stronger evidence than the agent runs:

- A new import edge from a file with no baseline entry fails (B1, file and line named). Growing the baseline to hide it fails ("may shrink, never grow"). Fixing a baselined violation without running `shrink` fails.
- An inline `createQuery` with an array-literal `queryKey` in a component fails F1 and F6, each with file, line and the fix. An `eslint-disable` comment has no effect.
- **A gap:** a new *use* of an import the baseline already lists for that file is invisible. The backend shortcut agent added a second caller of a baselined adapter import and the check stayed green. Whether that design is right is a review question the check does not ask.

## Cost

- **Building it.** Backend: `go-arch-lint` config (107 lines), a custom checker (312 lines, its own Go module), a wrapper (173 lines), a 23-line baseline, the check script and a test-summary script. Frontend: `eslint.config.js` (61 lines), four local rules (126 lines), a wrapper (148 lines), a 34-violation baseline and three devDependencies (72 packages added). ESLint 9 crashed in this repo because of a `brace-expansion` override, so it runs on ESLint 10. I did not measure my own build time or tokens.
- **Running it.** Backend: `step` about 8 s (3.6 s with test results cached), `full` 12 to 14 s, +15 to 18 s on a cold build cache. Frontend: `step` 23 to 42 s plus about 6 s for the arch rules, `full` 123 to 130 s. Database-backed tests (144 on the backend) skip by design, so a green run does not cover them.
- **Agent tokens.** Flat against Phase 1 A (+1.1%); B was 2.3% cheaper than A. Every frontend agent ran the full test suite (about 2 minutes) at least once.
- **Keeping it alive.** The baselines and off-limits files need an owner. Go tools are fetched from the network on first use. The nested files carry counts that go stale (the backend one said 23 baseline lines where old parents had 22).
- **People.** Not measured.

## Noise versus signal

**Signal** (repeated across conditions, or deterministic):

- **Names decide whether real tests run.** Across A, B and A + guardrails the same tickets fail the same way. Phase 1: 3 of 4 backend A attempts did not compile against the real tests, and 6 of 10 frontend attempts failed first on a name, path, prop or hook (2 more on copy text). Phase 4: 5 of 9 did not load.
- **Ambiguity in the ticket produces the same wrong behaviour in A and B** (T3's live ticker, T4's queued rows), which no build, vet or test can reveal.
- **The probes above.**

**Noise** (one run per cell; a single pass or fail, or about 10% in cost, is not established):

- T8 48 → 47, T9 102 → 104, T2 2 → 1 failures. They cancel, and I cannot attribute any of them.
- T3 and T4 matched the real commit's behaviour in Phase 4 where both Phase 1 conditions missed. The nested file asks agents to state their reading and test it, but one run each cannot show that this caused it, and neither could be checked (the real tests do not compile).
- Per-task token differences in either direction.
- The two shortcut pairs, which disagree: the control violated the rule on the backend and not on the frontend.
- The 16% drop in tool calls is the steadiest movement (8 of 9 tasks), and I would still call it suggestive.

## What transfers to brownfield Java

1. **The method.** Take a past fix, check out its parent, give an agent the ticket, overlay the real commit's tests, and score name mismatches, spec-text mismatches and behaviour divergences separately. It needs only git history that has tests, so a Java repo can use it unchanged. Use more than one run per cell (this trial ran one).
2. **Ticket quality first.** The lever that worked was names. In Java that is package, class and method names, exception types, annotations, test class names, and any exact message text. Use the template: fields for behaviour, where it goes, the names the tests will use, open decisions with a default, out of scope, verify, report back.
3. **ArchUnit rules map directly** (details in the logs, Phase 0 section 0.5): `onionArchitecture()` or `layeredArchitecture()` for core isolation; `slices().should().notDependOnEachOther()` for adapter isolation; `noClasses()...callMethod(Instant.class, "now")` for an injected clock; annotation presence for an auth chain (`methods().that().areAnnotatedWith(...)`), with a custom `ArchCondition` for "the actor is derived in the body"; `beFreeOfCycles()` for cycles. Not expressible in ArchUnit: string literals, statement order, SQL scoping.
4. **Baseline with `FreezingArchRule`.** It stores known violations as text and fails only on new ones, and ignores line numbers by default, which should avoid the count-swap weakness ESLint's suppressions have (this is from the ArchUnit user guide; I did not run ArchUnit). Two things I did here and ArchUnit does not do for you: a **never-grow guard** (here, comparing the baseline with the commit that first added it), and keeping the agent away from the store. ArchUnit has settings that control whether the store may be created or updated; check the exact property names in the version you use. Whether a new violation whose text matches a stored one is hidden in ArchUnit the way the Go baseline hides a new use of a listed edge, I have not tested.
5. **Use an allow-list for layers.** In Go it flagged 7 violations where a deny-list tool flagged 5; the two it caught are the kind of edge an agent adds without being told it is forbidden. ArchUnit's `mayOnlyAccessLayers` is the allow-list form.
6. **One check entry point with tiers, silent on success.** `fast` after each edit, `step` after each logical change, `full` before reporting. Output is a few lines on success and only the findings on failure, with what a green run does *not* cover stated in the summary. In Java the tiers become: compile and format the module, then the module's tests plus the ArchUnit tests (they are ordinary JUnit tests, so they ride on the build the team already runs), then the full build.
7. **Keep the rules out of the agent's reach.** Here only the nested `CLAUDE.md` forbids editing the baseline and config, and no agent tried. In a real repo I would enforce it (CODEOWNERS on those paths, or permission deny rules) and not rely on the sentence. Untested.
8. **Lean nested guidance with every claim checked against the code.** Checking each sentence caught errors in this repo's docs (the default `staleTime` is documented as 0 and the code sets 60 s) and in my own first draft (a clock convention that only some code follows). A brownfield repo's docs are likelier to be stale, so a short "docs that are out of date" list is worth having.
9. **Plan for the tests that cannot run.** The loop here cleared `DATABASE_URL` and every DB-backed test skipped. Brownfield Java integration tests (containers, shared databases) will have the same problem, and the check must say so every time.
10. **Verify code intelligence before trusting it.** In the SvelteKit case a TypeScript language server alone missed every use inside `.svelte` files (0 of 25), and only the server plus the Svelte plugin matched text search. For Java, compare find-references against grep on one symbol first. Cloud sessions do not run language servers, so I tested the servers but never an agent using one.

## What this repo cannot tell us

- **It is not Java, and not brownfield.** It is a small monorepo with a heavily documented, AI-assisted history, one build per track, fast tests and no framework magic. Brownfield Java brings much larger modules, Spring-style wiring and reflection, slower builds, legacy patterns that dwarf any baseline, thinner docs and an established review process. I would expect the baseline to be large and the check times to be longer.
- **The task set is small and from one repo's history.** Nine tasks, one run per cell, one model, one scorer. "Would accept" is my judgement and the hidden tests are one valid design. Differences of about 10% are not established.
- **The agents were one-shot and autonomous.** No one was in the loop, no one reviewed the diffs, and nothing was seen rendered (no browser or Clerk sign-in in a cloud session). A developer working interactively changes both the failures and the value of the checks.
- **The hook never ran with an agent**, and the nested file's sentence about it was wrong for the reruns. The PostToolUse hook, the ticket template and code intelligence are built and probed, not exercised.
- **The shortcut tasks have one control run each.** The two pairs disagree (above), and a single pair cannot separate an effect from chance. The frontend ticket may simply not have pulled hard enough toward a violation. No agent has been seen reading a red `arch-check` and fixing its code.
- **The run rules touched the loop.** The Phase 1 prompts forbid diffing against another commit, and `check.sh` diffs against `origin/main`. One agent skipped the script and one worked around it, which a real user would not have to do.
- **Cost to a team** (setup effort, maintenance, review time) is not measured.

## Open, in the order I would do them

1. Re-test the ticket template on a few tasks (you are doing this).
2. Repeat each shortcut pair several times, and add tickets that pull harder toward a violation (the frontend one did not), to learn whether any agent reads a red check and fixes its code.
3. Repeat the nine tasks two or three times each, so the 10% question has an answer.
4. Try the hook with an agent in a worktree.
5. For Java: pilot on one module with three or four ArchUnit rules and a frozen store, the ticket template, and five to ten past commits as oracle tasks, run as A and A + guardrails. Add the never-guard and a path restriction on the rule files before the first agent run.

## Where the evidence is

- Per-task numbers, method and caveats: the two track logs (Phase 1 sections 1.1 to 1.5, Phase 4 sections 4.1 to 4.6).
- Check design and probes: Phase 2 and Phase 3 sections of the logs.
- Raw material is vendored in `docs/ai-trial-evidence/` on this branch: per-attempt patches (Phase 1, Phase 4 and the two shortcut controls), the exact prompts, the per-task results notes and the harness scripts. Its `README.md` lists the layout and what is left out. Agent transcripts are not included, so the counts of `check.sh` runs and tool calls cannot be re-derived from the repo.
