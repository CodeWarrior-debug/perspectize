Closes #<!-- issue number -->

## Root Cause

<!-- What was causing the bug? -->

## Fix

<!-- How does this PR fix it? -->

## Demo

<!-- Add screenshots or video showing the fix -->

| Before | After |
|--------|-------|
| <!-- screenshot showing bug --> | <!-- screenshot showing fix --> |

https://github.com/user-attachments/assets/<!-- video-id -->

## Regression Test

- [ ] <!-- How to verify the bug is fixed -->
- [ ] <!-- How to verify no regression introduced -->

## Query Budget

<!-- Delete this section only if the PR touches no DB access and no data fetching. See .docs/QUERY_BUDGET.md -->

- [ ] Backend: new/changed queries have a `querycount` test (batch = 1 query for any N; empty input = 0); per-row GraphQL fields use a dataloader
- [ ] Frontend: new `createQuery` has a deliberate `staleTime`, reuses the existing hook/key (no duplicate fetch), and its `queryKey` includes every variable `queryFn` sends
- [ ] Frontend: mutations evict exactly the affected keys — real-`QueryClient` test asserts what is invalidated **and** what is not
- [ ] Migration adds an index for any new filtered/sorted column (or says why not)

## QA Acceptance Criteria

<!-- For QA: one numbered row per actionable check, in the order to run them.
     When = the precondition + action; Then = the observable result to confirm.
     Result: ✅ pass · ❌ fail · blank = not tested yet. On ❌, say what actually happened in Notes.
     Author: fill When/Then, leave Result and Notes blank. -->

| # | When | Then | Result | Notes |
|---|------|------|--------|-------|
| 1 | <!-- e.g. signed in, I open my own perspective and click the trash icon --> | <!-- e.g. a "can't be undone" confirmation appears; nothing is deleted yet --> | | |
| 2 | <!-- --> | <!-- --> | | |

## Follow-up Steps

<!-- Manual actions needed after merge, in order if sequence matters. Delete section if none. -->

- [ ] DB migration: `migrate up` against `<!-- environment(s) -->` (manual per .docs — never automated)
- [ ] Task/script: <!-- e.g. backfill script, one-off command -->
- [ ] <!-- Additional step -->
