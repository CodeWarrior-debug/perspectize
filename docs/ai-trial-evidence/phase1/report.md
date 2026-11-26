# Phase 1 report: baseline, ticket only (A) vs ticket plus key files and interfaces (B)

18 attempts: 9 past commits (4 backend Go, 5 frontend SvelteKit), each attempted twice by a fresh subagent in its own
worktree at the commit's parent. A is the ticket alone. B adds the key files and the interfaces the real fix introduced.
Condition C was dropped at your request. Per-attempt detail, with every note, is in
`/tmp/claude-0/-home-user-perspectize/b4e8a1bc-45a6-543a-9d0b-379630c02c02/scratchpad/phase1/results.md`.

## Result per task

"Loads" means the real commit's tests compile or import against the attempt as delivered. "Hidden" is what those
real tests do once the cause is named. Cost is tool calls / tokens / seconds, A then B.

| Task | A loads? | A hidden | B loads? | B hidden | Calls | Tokens | Secs |
|---|---|---|---|---|---|---|---|
| T1 stat count casts (Go) | no (name) | 2 subtests fail on SQL parenthesisation | yes | same 2 subtests | 45 / 39 | 160,312 / 147,679 | 168 / 158 |
| T2 like-count sort (Go) | yes | 2 fail on exact SQL text | yes | same 2 | 38 / 52 | 155,482 / 171,851 | 147 / 199 |
| T3 hub idle cap (Go) | no (3 names) | with names shimmed, 2 hub tests fail (live ticker counted idle) | no (1 name) | same 2 | 49 / 40 | 147,777 / 159,688 | 286 / 191 |
| T4 fail queued rows (Go) | no (1 name) | with name shimmed, 1 fails (failed-write rows stay queued) | yes | same 1 | 54 / 64 | 199,558 / 229,483 | 254 / 271 |
| T5 keep row order (TS) | no (module path) | with adapter, 6 of 6 | yes | 6 of 6 fail on a method name; with alias 6 of 6 | 79 / 42 | 210,752 / 150,569 | 527 / 483 |
| T6 omitted verses (TS) | yes | 15 of 16 (copy text) | yes | 15 of 16 | 49 / 27 | 158,873 / 129,676 | 316 / 194 |
| T7 type switches (TS) | no (name, file) | unit 5 of 5 with adapter; component not separable | yes | unit 5 of 5; component 4 of 4 fail (props, label) | 58 / 60 | 176,708 / 176,738 | 439 / 468 |
| T8 plan grid floor (TS) | yes | 48 of 48 | yes | 48 of 48 | 46 / 57 | 151,996 / 166,887 | 313 / 456 |
| T9 claim icon (TS) | yes | 102 of 104 (hook name), 104 with it | yes | same | 36 / 38 | 158,001 / 152,556 | 371 / 257 |

Every attempt built, passed the repo's full suite (including its own new tests) and was judged acceptable on its diff
(18 of 18; four with a note: T3 and T4 in both conditions).

## Totals, A vs B

| | A | B |
|---|---|---|
| Real tests load or compile as delivered | 4 of 9 | 8 of 9 |
| All real tests pass as delivered | 1 of 9 (T8) | 1 of 9 (T8) |
| Tool calls | 454 | 419 |
| Tokens | 1,519,459 | 1,485,127 |
| Seconds | 2,821 | 2,677 |
| Tasks where B cost fewer tokens | 4 (T1, T5, T6, T9) | B cost more in 4 (T2, T3, T4, T8); T7 tied |

## What the first failure was (18 attempts)

- 10: a name the ticket did not give (a function, module path, prop, method or test hook).
- 5: exact copy or SQL text the ticket could not specify.
- 1: behaviour (T4-B compiles, then fails one edge case).
- 2: none (T8, both conditions).

Behaviour, once names and text are set aside: in 6 tasks (T1, T2, T5, T6, T8, T9) both conditions match the real
fix. In 2 (T3, T4) both conditions diverge from it the same way, on a point the ticket left open. T7's component
behaviour could not be measured for A.

## Reading A vs B

- **Context gap.** The hint closed the compile-level part of it: real tests load for 8 of 9 tasks instead of 4 of 9.
  It did not close the parts it did not name: component props and button labels (T7), a method name (T5), a test hook
  (T9), copy (T6). So a ticket that names files and signatures helps, but only for names it actually lists.
- **Feedback gap.** The agents always had a build, a typecheck and the full suite, and used them. The T3 and T4
  divergences survived that, because the open question was in the ticket's wording, not in the tooling.
  This is my interpretation: a lint or architecture rule would not have caught either.
- **Inherent difficulty and ticket concreteness.** T8, where the ticket named both columns, both widths and the
  existing mechanism, passed 48 of 48 with no hint in both conditions. T7, a one-sentence ticket, failed the most.
  The frontend `CLAUDE.md` already described the T8 mechanism, so part of A's T8 result is the repo's docs doing the
  hint's job. Cost tracked the task more than the condition.
- **Cost.** B was 2% fewer tokens, 8% fewer calls and 5% less time in total, and costlier in 4 of 9 tasks. I ran each
  cell once and cannot size the run-to-run noise, so I would not claim B saves anything.

## Caveats

- One run per cell. No repeats, so differences of about 10% on cost or a single pass or fail are not established.
- I wrote the tickets and the B hints after reading the real commit. B is therefore the best case for a key-files
  hint; a template filled in before the work would carry less.
- The real commit's tests are one valid design, not the only one. Name and copy failures do not mean wrong behaviour;
  I separated them with temporary shims, adapters or aliases (always backed up first and restored byte-identical,
  checked with `cmp`) and judged "would accept" on the diff.
- DB-backed tests skip here (no `DATABASE_URL`, by rule), so the real DB tests for T1, T2 and T4 could not run.
- Shallow clone (50 commits) and a prompt rule against reading history; I checked this from each agent's own report of
  its git commands, not from a log of every command.
- Agents see the repo's `CLAUDE.md` files, as an agent in normal use would; the T8 result shows how much that can matter.
- Two agents chained commands with `&&` against the run rules (T3-A, T4-A, read-only or test-file writes).
- A slot reused across checkouts left a generated svelte-check file that failed one typecheck (T8-B). I deleted that
  one gitignored file and `prep.sh` now clears the cache; no other attempt was affected.
- Phase 1 did not score architecture-rule violations, so it says nothing about how often the rules chosen for
  Phase 3 would have fired. Phase 4 measures that.
