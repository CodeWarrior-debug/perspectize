# Neon preview branches (per PR)

Each open PR from this repo gets its own Neon database branch, `pr-<number>`, copied from `production`. The PR's migrations are applied to that branch, and the branch is deleted when the PR closes. This lets a PR's migrations run against production-shaped data before anything reaches `production`.

The workflow is `.github/workflows/neon-preview-branch.yml`. It uses Neon's own actions: `neondatabase/create-branch-action@v6` and `neondatabase/delete-branch-action@v3`.

**This does not apply migrations to production.** The rollout is still manual; see [MIGRATION_ROLLOUT.md](MIGRATION_ROLLOUT.md).

## What happens on each PR event

| PR event | Job | Result |
|---|---|---|
| `opened`, `reopened`, `synchronize` | `create` | Creates `pr-<n>` from `production` (or reuses it if it exists). Logs the schema version before and after `migrate up`. |
| `closed` (merged or not) | `delete` | Deletes `pr-<n>`. |

Forks are skipped: `pull_request` events from a fork get no repository secrets, so both jobs are guarded to same-repo PRs.

The connection string is masked in the logs. Read the version lines in the job log to see what was applied.

## One-time setup (repo owner)

The workflow needs two values in the GitHub repo settings:

| Name | Kind | Value |
|---|---|---|
| `NEON_API_KEY` | secret | A Neon API key for project `lively-fog-94104513` |
| `NEON_PROJECT_ID` | variable | `lively-fog-94104513` |

There are two ways to set them:

1. **Neon GitHub integration (recommended by Neon).** In the Neon console, connect the project to `CodeWarrior-debug/perspectize`. This installs the Neon GitHub app on the repo and sets both values for you. Install it only on this repo.
2. **Manual.** Create an API key in the Neon console, then:
   ```
   gh secret set NEON_API_KEY        # paste the key when prompted
   gh variable set NEON_PROJECT_ID --body lively-fog-94104513
   ```
   Don't put the key in a file in the repo or in chat.

Either way, the Neon role `neondb_owner` and database `neondb` must exist on the project. They do for `production` today.

## Checking it works

1. Open or push to a same-repo PR. The **Neon preview branch** workflow runs in the Checks tab.
2. In the Neon console (or `neon branches list`), `pr-<n>` appears with state `ready`.
3. Close the PR. The `delete` job removes the branch.

## Limits and decisions

- **Real data is copied.** A preview branch is a copy-on-write copy of `production`, so it holds real user rows. Only same-repo PRs get the secret. If a schema-only branch is needed for sensitive work, change `parent_branch` and add `--schema-only` through the Neon CLI by hand; the action has no schema-only input.
- **Migrations come from the PR.** The job runs the `backend/migrations` in the PR's branch. If `production` is behind the latest migration, `migrate up` also applies the older pending ones to the preview. That is a test, not a rollout.
- **Leftover branches.** If a `delete` job fails, the branch stays and keeps counting toward the Neon plan's branch limit. Delete it by hand with `neon branches delete pr-<n>`.
- **Concurrency.** Pushes to the same PR run one at a time, so a sync can't race a delete.

## Related

- [MIGRATION_ROLLOUT.md](MIGRATION_ROLLOUT.md): applying a migration to production (manual, one at a time)
- [PR_WORKFLOW.md](PR_WORKFLOW.md): migration labels
- `backend/CLAUDE.md` → Migrations
