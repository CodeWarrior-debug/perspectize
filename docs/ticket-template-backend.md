# Ticket template: backend (Go)

Copy this into the ticket. Every field closes a failure seen in the Phase 1 baseline (table at the end). A field you cannot fill is an open decision: write it under "Open decisions" with the default you want, rather than leaving it out.

---

## Title

One sentence: what is true after this change that is not true now.

## Behaviour

Observable behaviour, as short bullets, in the order a reader would check them.

- Normal case:
- Edge cases (empty input, one item, the limit exactly reached, an item that is half-done):
- Failure case (what happens when a dependency errors, times out or returns nothing, and **what state the data is left in**):

Define every word a reasonable engineer could read two ways ("running", "idle", "failed", "saved", "queued"). Say what it means in this code, with the field or condition that decides it.

## Where it goes

| What | File:line | Notes |
|---|---|---|
| The code to change | `backend/internal/...` | |
| The nearest existing thing to copy the shape from | `backend/internal/...` | the sibling method, repository, service or test |
| The port / interface that changes | `backend/internal/core/ports/...` | list every implementer, including `_test.go` mocks (`grep` for them) |

Reuse, do not rebuild: name the existing helper or mechanism that already does part of this.

## Names the tests will use

The real tests were written against these. Match them exactly. A name not listed here is free to choose.

| Kind | Name | Must match exactly? |
|---|---|---|
| Function / method | | yes |
| Struct field / option func | | yes |
| Port method | | yes |
| Error sentinel | | yes |
| Constant / default | | yes |
| Text a test compares (SQL fragment, log or error message) | quote it | only if a test compares it |

## Open decisions

For each point the description above leaves open: the question, the choice to make, and why.

1. Question: ... Default: ... Reason: ...

## Out of scope

Things next to this change that look related and should be left alone, and where to note them instead (for example the sibling sorts that share the same bug).

## Verify

- `bash backend/scripts/check.sh step` while working, `full` before finishing. Quote the summary line.
- Tests to add: ...
- Cannot be verified here: DB-backed tests skip without `DATABASE_URL`. List which behaviour only a database test would show, so the report can say it is untested.
- Query budget (if the change touches the database): the expected statement count, `querycount` assertion required.

## Report back

1. The reading you chose for each open decision.
2. Every new exported name and every new or changed port method.
3. What you could not verify.

---

## Which Phase 1 failure each field closes

| Failure in the baseline | Where | Field |
|---|---|---|
| Real test did not compile: a function, method or field named differently | T1, T3, T4 (3 of 4 tasks in A; T3 still in B) | Names the tests will use |
| Exact SQL text or parenthesisation differed | T1, T2 | the "text a test compares" row. Only worth quoting where behaviour depends on it; a test that pins whole SQL strings is brittle |
| The same behaviour divergence in A and B, on a point the ticket left open | T3 ("running"), T4 (rows left `QUEUED` when the outcome write fails) | Behaviour (definitions, failure case) and Open decisions |
| Agent fixed one sort and noticed three more with the same bug | T2 | Out of scope |
