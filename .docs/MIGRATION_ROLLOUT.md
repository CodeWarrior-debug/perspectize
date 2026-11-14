# Migration rollout (applying a migration to a real database)

Writing a migration is covered in `backend/CLAUDE.md` → Migrations and `.claude/agents/db-migration.md`. This page is the other half: **applying** one to the shared Neon database. It is a manual, human step. Nothing on Sevalla or in CI runs migrations. Production is the Neon `production` branch (the database moved from Sevalla to Neon on 2026-10-06, #540), so every apply is a production apply.

**Do not trust the backend's local env file to say where you are pointing.** It can be stale: after the cutover it still held the old Sevalla database's address (a `*.sevalla.app` host, kept only as a temporary rollback). Always fetch the production connection string explicitly (step 2) and pass it to `make` as `DB_URL`, so the target is the one you just checked.

**Who runs it:** a person in a local session. Agents never run any step here (`migrate-version` included; it reads the production database). The agent's job is to explain, check output you paste, and swap the PR label afterwards. The `neon` CLI (installed as `neon`, not `neonctl`) is assumed present locally; cloud and CI sessions never roll out.

## Default: apply one migration at a time

Use `make -s migrate-up-n N=1`. It applies exactly the next migration and stops, so an unreviewed migration someone else queued cannot ride along. `up 1` needs no justification.

Applying more than one (`make -s migrate-up`, or `N` above 1) is the exception and needs a stated reason: **every** pending migration is part of this rollout, each has been reviewed, and you have read the list (`ls backend/migrations | tail`) against the current version. Write the reason in the PR's Follow-up Steps (for example "000031 and 000032 both ship in #576").

## Steps (from `backend/`)

Use `make -s` (silent) for every `migrate-*` target. Without `-s`, make echoes the full `migrate ... -database "<url>"` line, **including the password**, to your terminal. Never paste unredacted output.

1. **Number check.** `git fetch origin main`, then `git ls-tree origin/main backend/migrations/ --name-only | tail`. The migration's number must be the next free one on `main`. If not, rename it first (the label `check-migration-number-before-apply` means this is due; see `PR_WORKFLOW.md`).
2. **Production connection string, into a file.** It never goes into chat or the shell history. The `neon` CLI needs the project id the first time (`lively-fog-94104513`):
   ```
   neon connection-string production --project-id lively-fog-94104513 --pooled=false --role-name neondb_owner --database-name neondb > ~/.perspectize-neon-prod.url
   chmod 600 ~/.perspectize-neon-prod.url
   grep -oE '@[^/?:]+' ~/.perspectize-neon-prod.url
   ```
   The host printed must be a Neon endpoint (`ep-...neon.tech`) and must **not** contain `-pooler` (direct endpoint, as the app and the db-migration agent use). A `*.sevalla.app` host is the pre-cutover database: stop.
3. **Current version.** `make -s migrate-version DB_URL="$(cat ~/.perspectize-neon-prod.url)"`. Expect the number just below the one you are applying, not dirty. If it is dirty, stop (a previous run failed half-way; read `migrate force` in `LOCAL_DEVELOPMENT.md` before touching it). If it is lower than expected, an earlier migration is still pending: apply with `N=1` one at a time, or justify applying more than one.
4. **Restore point.** Snapshot production first (copy-on-write, effectively free):
   ```
   neon branches list
   neon branches create --name pre-<migration-number>-<short-name> --parent production
   ```
   Add `--project-id lively-fog-94104513` if the CLI asks. Check the new branch shows `ready`.
5. **Apply one.** `make -s migrate-up-n N=1 DB_URL="$(cat ~/.perspectize-neon-prod.url)"`. Expect `<n>/u <name>`.
6. **Verify.** `make -s migrate-version DB_URL="$(cat ~/.perspectize-neon-prod.url)"` shows the new number, clean. Then check what the migration created (counts, seeded rows) with a few `SELECT`s in the Neon SQL editor. The PR body should list the exact queries and expected values.
7. **Label.** Swap `migrations-unapplied` for `migrations-applied` on the PR (`.docs/PR_WORKFLOW.md` → Migration labels) once every environment is done. There is one live database (Neon `production`), so that is after this run.
8. **Clean up.** After a day or so of the change running cleanly: `neon branches delete pre-<migration-number>-<short-name>`. Also delete any leftover `*-verify` branch. Connection-string files (`~/.perspectize-neon-prod.url`, `~/.perspectize-neon-branch.url`) stay on a personal machine (they are `chmod 600`); re-run step 2 to refresh the production one after the database password is rotated.

## Verifying on a Neon branch first (for a migration or user-visible change)

Before production, prove the migration and the UI it serves on a throwaway branch. For a migration or a user-visible change, don't label the PR `needs-demo-video` and leave verification as a follow-up: create the branch, apply the migration to it only, seed demo data, run the stack locally, and record the clip (`~/.claude/tools/video-capture`, see [VERIFICATION.md](VERIFICATION.md)).

**Auth and branch handoff.** The user approved this split, and it keeps the connection string out of the chat:

1. The user runs `neon auth` if `neon projects list` fails as signed out.
2. The agent runs the read and create steps: `neon projects list`, `neon branches list --project-id lively-fog-94104513`, and `neon branches create --project-id lively-fog-94104513 --name <task>-verify --parent production`.
3. The user runs only the connection-string step, redirected to a file: `neon connection-string <branch> --project-id lively-fog-94104513 --pooled=false --role-name neondb_owner --database-name neondb > ~/.perspectize-neon-branch.url`, then `chmod 600` it.
4. The agent uses the file inline and masks the URL in any output, for example `migrate -path migrations -database "$(cat ~/.perspectize-neon-branch.url)" up 2>&1 | sed -E 's#postgres(ql)?://[^ ]+#<branch-url>#g'`. Check the version before, backfill counts, and `down 1` then `up` for reversibility.

Keep the connection-string file in place (`chmod 600`), as with the production file in step 2 above.

**Gotchas:**

- A branch off `production` holds a copy of production rows. Schema-only branches are not available on this project, so UI that lists content will show real titles in a recorded clip. Filter the recording to the new type, and never run an unfiltered `select` on `content` in chat.
- Ask before deleting a branch, and before any bulk delete on it (such as `TRUNCATE`). Clean up is listed in step 8 above.
- Never apply a migration to production while its number is provisional. Another open PR may claim the same number, and golang-migrate would silently skip the second file. Apply after the number is final.
- Local backend: `SERVER_PORT` moves the listen port, so a verification backend can run beside the usual `:8080`. A plain `DATABASE_URL` set inline beats `backend/.env`, because `godotenv.Load()` does not override existing env vars. A worktree has no `backend/.env`.
- Read the captured frames yourself (extract them with the venv's ffmpeg) before calling a clip evidence. A script's own "pass" log can be a false positive.

## Order relative to the deploy

Apply **before** the PR that needs it merges, when the migration is additive (new tables, nullable columns) so the already-live backend ignores it. The backend deploys when `backend/` reaches `main`, and a new backend against a missing table fails at the first query. For a change the live backend cannot tolerate (a rename, a dropped column), split it into an additive migration, a deploy, then a cleanup migration.

## Rollback

- `make -s migrate-down-n N=1` reverses the last migration. It is safe only while the new tables hold no user data. For user todos (000031) that means before anyone creates a todo; afterwards `down` deletes their data.
- After data exists, fix forward with a new migration, or rewind with the snapshot: `neon branches restore production pre-<migration-number>-<short-name>`. That discards every write since the snapshot, so it is a last resort.
- A failed apply can leave the version **dirty**. Inspect what ran, repair it by hand, then `make -s migrate-force` to the right version. Do not re-run `up` on a dirty database.

## Why the rules are what they are

- golang-migrate keeps a single version number, so a same-numbered migration from another branch is skipped silently. This is why the number is checked in step 1 and finalized as the last step before merge.
- The up files are idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`), so a re-run after a partial failure is safe once the version is clean.
- Verification belongs on a Neon branch copy first (db-migration agent, "Neon branch verification hand-back"), up then down then up. Production is the second apply, not the first.
