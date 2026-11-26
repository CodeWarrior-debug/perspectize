# Ticket template: frontend (SvelteKit / TypeScript)

Copy this into the ticket. Every field closes a failure seen in the Phase 1 baseline (table at the end). A field you cannot fill is an open decision: write it under "Open decisions" with the default you want, rather than leaving it out.

---

## Title

One sentence: what the user sees or can do after this change that they cannot now.

## Behaviour

Observable behaviour, as short bullets, in the order a reader would check them.

- Normal case:
- Edge cases (nothing to show, one item, many items, loading, error, the narrowest layout):
- What does not change (a view or state that must stay as it is):

Define every word a reasonable engineer could read two ways. Say what it means here, with the prop, state or condition that decides it.

## Where it goes

| What | File:line | Notes |
|---|---|---|
| The component, hook or helper to change or add | `frontend/src/lib/...` | |
| The nearest existing thing to copy the shape from | `frontend/src/lib/...` | the sibling component, hook or test |
| The existing mechanism to reuse | `frontend/src/lib/...` | for example `headerMinWidth`, `queryKeys`, `COLUMNS` in `grid-config.ts` |

If it adds data fetching: the hook name and file (`lib/queries/<domain>/use<Verb><Noun>.ts`), the `queryKeys` entry, the `staleTime`, and what each mutation evicts.

## Names the tests will use

The real tests were written against these. Match them exactly. A name not listed here is free to choose.

| Kind | Name | Must match exactly? |
|---|---|---|
| Module path and exports | | yes |
| Methods on a returned object | | yes |
| Component file and props (including callbacks) | | yes |
| Test hook (`data-testid`, `data-icon`, other `data-*`) | | yes |
| Accessible name or label (role + name, aria-label) | | yes |
| Visible text and link text | quote it, same case and punctuation | yes |

## Open decisions

For each point the description above leaves open: the question, the choice to make, and why.

1. Question: ... Default: ... Reason: ...

## Out of scope

Things next to this change that look related and should be left alone.

## Verify

- `bash frontend/scripts/check.sh step` while working, `full` before finishing. Quote the summary line.
- Tests to add: ... Which of them mock a hook (`vi.mock` by module path), and which use a real `QueryClient`.
- Cannot be verified here: nothing renders in a cloud session and AG Grid does not render in jsdom. List what only a browser would show (colour, spacing, truncation), so the report can say it was not seen.

## Report back

1. The reading you chose for each open decision.
2. Every new module path, export, prop, test hook and piece of visible text.
3. What you could not verify.

---

## Which Phase 1 failure each field closes

| Failure in the baseline | Where | Field |
|---|---|---|
| Real test did not load or call: module path, export, or a method name on the returned object | T5 (A and B), T7 (A) | Names the tests will use |
| Props or accessible names differed (`options` vs `filters` + `onSelect`; "Movie" vs "Show only Movie") | T7 (B; for A the component cases could not be separated from the missing component) | Names: component props, accessible name |
| Test hook never mentioned (`data-icon="claim"`) | T9 (A and B) | Names: test hook |
| Exact copy differed (`omits this verse`, link text) | T6 (A and B) | Names: visible text |
| Passed with no failures: the ticket named both columns, the widths and the existing mechanism | T8 (A and B) | Where it goes: the mechanism to reuse |
