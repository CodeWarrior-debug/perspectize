# Custom columns and saved items: implementation plan

⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed

Spec: [2026-11-20-custom-columns-and-saved-items-design.md](../specs/2026-11-20-custom-columns-and-saved-items-design.md). Intent: [calculated-columns](../../../project-management/intents/calculated-columns.md).

## PR split (migration → backend → frontend, per the intent)

| PR | Branch | Contents | Ships |
|---|---|---|---|
| 1 | `feature/custom-columns-design` (#828) | spec, this plan, intent update, Decision 8 fix | docs only |
| 2 | `feature/saved-items-backend` | migration + domain + port + service + GORM repo + GraphQL + `UserService.Delete` reassign | dark: deploys unused; migration applied by hand per environment |
| 3 | `feature/custom-columns-frontend` | evaluator, builder, grid integration, hooks | merge-gated; user-visible, needs `needs-demo-video` |

Migration 000039 is **provisional**: open PRs #810 (000039–000042) and #825 (000043–000044) also claim numbers. Rename to the next free number on `main` as the last step before merging PR 2.

## PR 2: backend (dark), in order

Template: the user-todo feature (`user_todo.go`, `user_todo_repository.go`, `user_todo_service.go`, `gorm_user_todo_repository.go`, `user_todo.resolvers.go`, tests under `test/`).

1. **Migration `000039_add_user_saved_items`** up and down, idempotent, schema as in the spec. Written and reviewed only; never applied to Neon.
2. **Domain** `core/domain/saved_item.go`: `SavedItemType` (`FORMULA`, `THEME`, `VIEW`, `SETTING`), `SavedItemOrigin` (`OWN`, `COPY`, `LINK`), `SavedItem`, `SavedFormulaPayload` with expression-tree validation (node count and depth caps, whitelisted functions, finite numbers). Reuses `domain.Privacy`. Zero external imports.
3. **Port** `ports/repositories/saved_item_repository.go` and `ports/services/saved_item_service.go`.
4. **Service** `core/services/saved_item_service.go`: create, update, soft delete, restore, set privacy, copy (auto-suffix name), link (public source only, no chains), convert link to copy, list mine, list shared. Owner guard at the service; non-owner on a private row is "not found".
5. **Repository** `gorm_saved_item_repository.go`: one soft-delete scope used by every read; link payload resolved by a join in the same statement; ownership in the `WHERE`; `clause.Returning{}` on writes; name collisions mapped to `ErrAlreadyExists`. `ReassignByUser` per the spec.
6. **GraphQL** in `schema.graphql`: `interface SavedItem`, `SavedFormula`, per-type queries, typed formula inputs, shared id-based mutations, `@auth` on writes; bind enums in `gqlgen.yml`; resolvers in `saved_item.resolvers.go`; `make graphql-gen` then diff and delete the stray `schema.resolvers.go`. Wire in `cmd/server/main.go`; owner/credit fields through the list join or a dataloader, never per row.
7. **`UserService.Delete`** calls the new `ReassignByUser`.
8. **Tests:** domain validation tables; service tests (owner guard, copy rules, link rules, name collisions); repository tests with `querycount` (list: page only, plus count when asked; link read 1 statement; writes 1 statement); soft-delete scope on every read path; constraint tests against the demo-stack Postgres (`localhost:5434`, throwaway DB, never Neon), confirmed PASS not SKIP with `-v`; resolver tests; `test/roundtrips` counts for each new operation; update mocks.
9. **Verify** `go build ./...`, `gofmt -l .`, `go vet -tags perf ./internal/perf/...`, `go test ./...`; `code-reviewer` on the diff before pushing.

## PR 3: frontend

1. **Evaluator** (pure TypeScript, no UI): expression tree, functions, missing-is-blank, caps, `log10` rules, z-score over a supplied population. Table-driven tests first.
2. **Steps ⇄ formula**: steps model, formula parser and printer, round-trip tests, plain error messages with closest-column suggestions.
3. **Operand catalogue** (movies first; no YouTube statistics) with a step added to the Adding a Content Type guide.
4. **Hooks** per type over one generic saved-items hook; query keys include the viewer; delete and privacy changes evict.
5. **Builder UI** (steps first, "Edit as formula"), live preview, "Compress big gaps" and "Compare to the rest" steps, privacy, Undo toast.
6. **Grid integration** in Library: custom-columns group in the picker, ƒ header mark and tooltip, Loaded-mode sort and filter, All Items off-state with the reason, layout v2 migration for `perspectize:activityColumns`.
7. **Shared picker** per Decision 8 with Use a copy / Link instead.
8. **Component tests** for each state listed in the spec.

PR 3 is blocked on the TMDB terms check for movie operands (spec open question 1).

## Not in this plan

Plan grid, server-side evaluation, themes/views/settings payloads, trash page.
