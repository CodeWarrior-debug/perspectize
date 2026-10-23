# Release approaches

Named ways of getting large, multi-PR features to users without exposing unfinished work. Refer to them by name in intents, specs, plans and PR descriptions.

Perspectize has **no feature-flag mechanism** today, so the default for big features is the first approach below.

---

## Dark backend, merge-gated frontend

**Short name:** *dark backend*. **Status:** the default for multi-PR features.

The backend ships to production early but unused. The frontend reaches users only when its PR merges to `main`.

### How it works

1. **Backend slices are dark-launched.**
   - They merge to `main` and deploy to production while nothing calls them yet.
   - Each slice must be purely additive: a new table or column, optional new GraphQL arguments or fields, new queries or mutations.
   - Existing clients never send the new arguments, so users see no change.
   - Test through backend tests and the GraphQL endpoint.
2. **Frontend slices are merge-gated.**
   - They stay on the feature's long-running integration branch, with no flag.
   - Test them from local, demo or preview builds against the already-deployed backend.
   - They reach users only when merged to `main`.
3. **PRs split by stack**, typically migration → backend → frontend. Each PR links back to its intent.
4. **Migrations** still follow [Migration Rollout](MIGRATION_ROLLOUT.md): applied by hand per environment, never during development.

### Rules for a dark slice

- **Additive only.** No renamed or removed fields, and no changed defaults or behaviour for existing arguments.
- **Safe if called.** Auth and owner guards and the [query budget](QUERY_BUDGET.md) apply, as if the feature were live.
- **Nothing user-visible.** If a change shows up in the current UI, it isn't dark; it ships as a normal PR.

### Trade-offs

- **Pro:** no flag code to write or later remove, and the backend is exercised in production early.
- **Pro:** backend changes reach `main` early, so the long-running branch stays mostly frontend.
- **Con:** frontend PRs waiting on the integration branch drift from `main`. Rebase the branch on `origin/main` regularly.
- **Con:** you can't test the new UI in production with real data before release.

**First used by:** [calculated columns intent](../project-management/intents/calculated-columns.md).

---

## Role-gated release (planned)

**Status:** not available. It needs RBAC, which doesn't exist yet.

Once roles or permissions exist, unfinished UI can merge to `main` and stay hidden behind a role or permission check. The frontend hides it, and the resolvers enforce it. This replaces "merge-gated" for features that need production testing with real data, or that are only ever for certain users.

Also known as entitlement-based rollout, or permission-gated features.
