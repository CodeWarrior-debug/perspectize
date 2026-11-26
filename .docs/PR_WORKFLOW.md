# PR & Issue Workflow

Procedures for opening, labelling and merging PRs and issues. The always-on rules (PR autonomy, cloud vs. local, verification gate) stay in the root [CLAUDE.md](../CLAUDE.md).

## `gh` commands

```bash
# Pull requests
gh pr create --title "Title" --body "..."  # Use PR template (see below)
gh pr list
gh pr view 123
gh pr merge 123

# Edit PR (use API — gh pr edit fails with Projects Classic deprecation)
gh api repos/CodeWarrior-debug/perspectize/pulls/123 -X PATCH -f body="New description"

# Issues (use API — gh issue view fails with Projects Classic deprecation)
gh issue create --title "Title" --body "..."  # Use issue templates (see below)
gh issue list
gh api repos/CodeWarrior-debug/perspectize/issues/123 --jq '.title, .html_url'

# API access
gh api repos/CodeWarrior-debug/perspectize/pulls/123/comments
```

**Creating a PR:** push and open the PR immediately with `gh api repos/CodeWarrior-debug/perspectize/pulls -f title="..." -f body="..." -f head="branch" -f base="main"` (`gh pr create` fails with the Projects Classic deprecation). The `require-session-reflection-before-pr.sh` hook no longer blocks `gh pr create`; it allows it and prints a warning that session learnings must still be reviewed after the PR is up. See [Session learnings](#session-learnings).

## Session learnings

`/revise-claude-md` never delays the PR. The flow:

1. Push and open the PR immediately.
2. While CI runs for the first time, run `/revise-claude-md`.
3. **CRITICAL** learning → commit the CLAUDE.md/doc edit on the PR branch.
4. Anything else → put it in the PR body under **Session Learnings** (the section in every PR template). The `monthly-maintenance` routine collects these from merged PR bodies (step 3b).

**CRITICAL means exactly this** (the only definition; other docs link here): a learning that corrects a rule which would cause **data loss**, a **security problem**, or a **failing CI**. Everything else is non-critical, however useful. If the PR has no learnings, write "None" under the heading.

**Cloud sessions:** `gh` is unavailable. Open the PR yourself with the GitHub MCP `create_pull_request` tool and set labels with `issue_write` — see [SESSION_ENVIRONMENT.md](SESSION_ENVIRONMENT.md).

**Local `gh` not authenticated:**
- **Creating a PR:** push with `git push -u origin <branch>` and let the user create the PR via the GitHub UI button. Prepare the title and body as copyable text.
- **Updating a PR:** output the updated title/body as copyable text for the user to paste.

## Templates

**Always use the repository templates** in `.github/` when creating PRs and issues.

**Pull Requests** — per-type templates in `.github/PULL_REQUEST_TEMPLATE/`, picked by the PR's conventional-commit type:

| Commit type | Template | Sections |
|---|---|---|
| `feat` | `feature.md` | Feature Description, Technical Changes, Demo (before/after screenshots), Test Plan, QA Acceptance Criteria |
| `fix` | `bugfix.md` | Root Cause, Fix, Demo (before/after screenshots), Regression Test, QA Acceptance Criteria |
| `chore`/`build`/`ci` | `chore.md` | Summary, Changes, Verification |
| `docs` | `docs.md` | Summary, Files Changed, Verification |

Because PRs are created via `gh api` (not `gh pr create`), GitHub's template picker never runs — read the matching template file yourself and shape the `-F body=@<file>` content to its sections before creating the PR. Any UI-visible change should fill in the Demo screenshot table (see [PR_SCREENSHOTS.md](PR_SCREENSHOTS.md) for the `sv-` upload workflow) rather than leaving it blank — see [Demo requirement](#demo-requirement-ready-for-review) below; a cloud session can't produce this evidence itself, so it labels instead.

**QA Acceptance Criteria (feat/fix PRs):** a human QA tester works from this table. Write numbered, user-observable When / Then rows (what to do in the app → what they should see), including the negative cases (e.g. "another user's perspective shows no delete option"). Not unit-test names or internals. Leave **Result** and **Notes** blank: QA marks ✅ pass / ❌ fail. Never pre-fill a Result yourself, even when automated tests cover the row.

**Keep non-public information out of PR bodies** (the repo is public): local paths, email addresses, private URLs, database hosts, account details, and any of these inside pasted command output. Where a section needs one, write `REDACTED`.

**Issues** — use templates from `.github/ISSUE_TEMPLATE/` (feature_request.md or bug_report.md).

**Issues with plans:** include a plan reference and dependencies if present: for new work, the superpowers plan/spec path (`docs/superpowers/plans/{name}-plan.md`); for legacy in-flight work, the GSD plan reference (`.planning/phases/{phase}/{plan}-PLAN.md`) and acceptance criteria from `must_haves.truths`.

GitHub Projects v2: see [GITHUB_PROJECTS.md](GITHUB_PROJECTS.md).

## Demo requirement ("ready for review")

"ready for review" requires demo evidence, unless the user says otherwise. This applies to any PR whose change a user can **see or interact with** — new or changed UI, a fixed user-facing bug, changed app behaviour. Judge by the actual diff, not the commit type or title.

- **No demo needed** (a one-line reason in the Demo section is enough, e.g. "no visible UI change: formatting and test-type fixes"): docs/plan/research records, formatting/lint passes, test-only changes, type-only fixes, tooling/hooks/CI config, and refactors with no behaviour change.
- A qualifying PR is `ready for review` only once its Demo section has one of: (a) **a local end-to-end run** that checks the changed behaviour, saying what was run (the steps, or a committed script or scenario) and the result; (b) `sv-` screenshots or video, linked (see [PR_SCREENSHOTS.md](PR_SCREENSHOTS.md)); or (c) an explicit, specific justification for why none applies ("dark by default, no UI surface", "no visible UI change", not a generic "N/A"). A Demo section that only says evidence is still needed does not qualify, however green CI is.
- **End-to-end** means the running app: real backend, database and browser (or real API calls for a backend-only change), on the local app or the [demo stack](DEMO_MODE.md). Unit, component and Browser Mode tests do not count, and neither does a CI suite that has no check for the changed behaviour.
- **Screenshots or video are needed only for new UI the owner will want to see, or when asked.** Otherwise the end-to-end run is enough.
- **Automated demos and end-to-end runs do no write operations by default**, on the demo stack too: no create, update or delete without the owner's explicit OK. Seeding the demo stack is setup. `make demo-test` and `make demo-record` write data, so they need that OK. List any write flow left unchecked in the Demo section; a change whose behaviour is a write stays `needs-demo-evidence` until the owner allows it or checks it by hand.
- **A cloud session does no browser verification** (no Clerk sign-in). So a cloud session finishing a qualifying (user-visible) PR must apply the `needs-demo-evidence` label at creation time (`gh api repos/CodeWarrior-debug/perspectize/issues/<n>/labels -f "labels[]=needs-demo-evidence"` — `gh pr edit` fails here) rather than leaving the PR unlabeled or self-declaring it ready. This is what flags the PR for a local session to pick up and finish.
- A local session that adds the missing evidence swaps the label: remove `needs-demo-evidence`, add `ready for review`, and put the evidence in the PR's Demo section (don't just upload assets and leave the placeholder text). **Embed a video as an animated GIF preview linked to the mp4**, not a bare link: release-hosted mp4s don't play inline on GitHub. Recipe and markdown: [PR_SCREENSHOTS.md → Embedding](PR_SCREENSHOTS.md#embedding--gif-preview-linked-to-the-mp4).
- `needs-demo-evidence` and `ready for review` are **mutually exclusive** — never both on the same PR. If a PR is blocked by something else (merge conflict, a real failing/un-run CI check, an unresolved bug), it's fine for it to carry neither label rather than force-fitting one.
- An owner-only follow-up that needs a credential no agent has (`ANTHROPIC_API_KEY`, a Chrome origin-trial flag, a live Sevalla checkpoint) does **not** by itself block `ready for review` — that's normal handoff, not a missing demo. What blocks it is *this PR's own visible surface* going unverified.

See [VERIFICATION.md](VERIFICATION.md) for the evidence capture workflow. **A local agent gathering evidence starts with the `pr-verification` skill.** It takes the machine-wide verification slot, so parallel agents never collide on the dev-server ports or the signed-in Chrome. When the slot stays busy past its 2-hour limit, the agent labels the PR `needs-demo-evidence` and says so, as a cloud session would.

## `needs-local-session-takeover` label

Marks a PR opened from a **cloud** session whose remaining work needs the user's machine (Docker, local-only MCP servers such as Sevalla, Clerk sign-in / browser verification). The PR body lists that work as a checklist and links the originating session.

- **Taking it over:** from a local checkout, `git pull` the PR branch, then run `claude --teleport` and pick the session linked in the PR body — this resumes that cloud session locally with its full history. (Alternatively start a local session and work from the PR checklist.)
- **Cloud sessions:** apply the label (and list the local-only steps) instead of claiming unverified work is done.
- **Local sessions:** remove the label once every checklist item under "Local session takeover" is done.

## `new-content-type` label

Marks a PR that carries the **spec or first implementation of a new content type**: the design/spec/brainstorm docs for a type that doesn't exist yet (including designer-tool seeds), and the PRs that first land the type in the app (backend type, ingest, first frontend slices).

- **Put it on:** at creation time, on every PR whose main purpose is introducing a new type (e.g. `MOVIE`, `AUDIO_TRACK`, `BIBLE_PASSAGE`, a Food & Drink spec). Apply it to each PR of a multi-PR first implementation (backend slice, frontend slice, integration/re-land).
- **Don't put it on:** later changes to an existing type (new columns, sorts, filters, polish), or generic work that only touches content types (e.g. a rename, `content-type-designer` tooling with no new type). Judge by the diff, not the title.
- **Independent of the other labels.** It describes what the PR is, not its review state, so it can sit beside `needs-demo-evidence` / `ready for review` and the migration labels. Keep it when the other labels are swapped.
- **Find them:** `gh pr list --state all --label new-content-type`.
- **Cloud sessions:** set it with the GitHub MCP `issue_write` tool; its `labels` field replaces the whole set, so pass the existing labels too.

## `complexity:` and `risk:` labels (issues)

Two independent labels on every issue say how much human supervision the work needs. Each takes `low`, `medium` or `high`: `complexity: low|medium|high` and `risk: low|medium|high`.

- **`complexity:`** is how hard the work is to get right: how many layers it touches, how much design judgment it takes, how much is unknown.
- **`risk:`** is the cost of getting it wrong: data loss, security, production behavior, shared infrastructure, or something hard to undo.

**The rule of thumb is whether the issue needs the owner's input.** Judge each label on its own:

| Level | Meaning | Who works it |
|---|---|---|
| `low` | Won't need the owner's input from this angle. | An agent can take it end to end, including a cloud session. |
| `medium` | Borderline. Could go either way. | An agent can start, but the owner reviews the plan or the PR closely. |
| `high` | Definitely needs the owner's supervision. | The owner is in the loop from the start, with no unattended run. |

**Pointers for the call** (a judgment aid, not a checklist):
- Raise `risk:` for migrations, auth or ownership guards, secrets, the shared Neon database, deploy or CI workflows, and anything that removes or rewrites user data.
- Raise `complexity:` for work that spans backend and frontend, introduces a new pattern or content type, or has an open design question.
- When unsure between two levels, pick the higher one.
- The two labels can differ: a one-line change to an auth guard is `complexity: low` and `risk: high`.

**Applying them:**
- **Put them on:** every new issue, at creation time, both labels. Re-label when scope changes.
- **Independent of `priority:` and the type labels** (`bug`, `enhancement`). They describe the work's supervision needs, not its urgency.
- **Find them:** `gh api "repos/CodeWarrior-debug/perspectize/issues?labels=risk:%20low,complexity:%20low"` lists issues an agent can take unattended.
- **Setting one:** `gh api repos/CodeWarrior-debug/perspectize/issues/<n>/labels -f "labels[]=risk: low" -f "labels[]=complexity: low"`. In a cloud session, use the GitHub MCP `issue_write` tool; its `labels` field replaces the whole set, so pass the existing labels too.

## CI

- **Trigger:** `ci.yml` runs only on PRs and pushes to `main`. Pushing a feature branch with no PR runs nothing, so a PR is the way to get CI's verdict.
- **DB-backed tests in cloud sessions:** integration tests (`backend/test/**`, `cmd/server/*_integration_test.go`) skip without `DATABASE_URL`. Don't set up Postgres in a cloud session (the permission classifier denies creating roles/DBs). Open the PR and let CI's Postgres service run them, then check the `Test & Lint` job log to confirm they actually ran rather than skipped.

- **Frontend previews (Sevalla):** a push to a non-default branch builds a preview only when the pushed files match `frontend/**` (`allow_deploy_paths`); otherwise the deployment shows `Skipped`. Judging by one observed case, the check reads the files of the push, probably its head commit, not the whole PR diff. So when a frontend PR is assembled out of order (a merge or rebase, or a last commit that only touches `backend/` or docs), **end the first push with a commit that touches a `frontend/` file**, or the PR gets no preview. A later non-frontend push doesn't rebuild, so the branch preview keeps showing the last frontend build. There is no way to force a preview. Check the site's deployment list for a `Skipped` entry before assuming a preview is broken. Previews are deleted 30 days after they finish.

## Migration labels

Migrations are never applied automatically (see `backend/CLAUDE.md` → Migrations): someone runs `migrate up` by hand against each environment (procedure: [MIGRATION_ROLLOUT.md](MIGRATION_ROLLOUT.md)), before the PR merges when the migration is additive. These labels track that, so a merged PR with a pending migration can't be forgotten.

| Label | Put it on | Take it off |
|-------|-----------|-------------|
| `migrations-unapplied` | Every PR that adds or changes a file under `backend/migrations/`, at creation time. It **stays on after merge**. | When the migration has been applied to every environment; swap it for `migrations-applied`. |
| `migrations-applied` | A merged PR whose migrations have been applied to every environment. | Never. |
| `check-migration-number-before-apply` | A PR whose migration number might be wrong by the time it's applied: another open PR or branch claims the same number, or this PR skipped numbers that in-flight branches claim. | Automatically, once the number is the next free one on `main` and no other open PR uses it (see below). If it's still on at merge time, renumber to the next free number first. |

- **Migration numbers on open PRs are provisional.** Don't spend effort renumbering around other in-flight branches while a PR is open. Finalize the number as the **last step before merging**: rename the files to the next free number on `main`. It can't wait until after merge, because golang-migrate refuses to run at all if two files on `main` share a version. `check-migration-number-before-apply` still being on at merge time means that rename is due.
- `migrations-unapplied` and `migrations-applied` are **mutually exclusive**.
- To find pending rollouts: `gh pr list --state merged --label migrations-unapplied`.

**Automated on open PRs.** The `Migration labels` workflow (`.github/workflows/migration-labels.yml`, rules in `.github/scripts/migration-labels.js`) keeps `migrations-unapplied` and `check-migration-number-before-apply` in sync on every open PR. Don't set those two by hand on an open PR; the next run overwrites them.

- **When it runs:** a PR is opened, reopened or pushed to; a migration lands on `main` (every other open PR is re-checked, because the next free number moved); or on demand from the Actions tab (**Run workflow**).
- **Numbering check:** a PR gets `check-migration-number-before-apply` when one of its new migration numbers matches one on `main` or in another open PR, skips past `main`'s latest, or leaves a gap within the PR. The label comes off automatically once none of that holds. The run's summary lists the reason for each PR.
- **Blind spot:** it can't see branches with no open PR, so check those with `git log --all --oneline -- 'backend/migrations/*'`.
- **Still manual:** swapping `migrations-unapplied` for `migrations-applied` after `migrate up` has run everywhere. The workflow has no database access, and it never touches a PR that already carries `migrations-applied`.
- **Cost:** no AI tokens and no secrets. It's plain JavaScript on the run's built-in `GITHUB_TOKEN`, about 10 seconds of Actions time per run.
- **Adding a label by hand** (e.g. `migrations-applied`): `gh api repos/CodeWarrior-debug/perspectize/issues/<n>/labels -f "labels[]=migrations-applied"`. In a cloud session, use the GitHub MCP `issue_write` tool; its `labels` field replaces the whole set, so pass the existing labels too.

## Merge preferences

```bash
gh pr merge 123 --squash --delete-branch --admin
```

- `--squash` — Single commit (cleaner history)
- `--delete-branch` — Auto-delete branch after merge
- `--admin` — Bypass branch protection when needed

**After every merge, local `main` must be synced in the same turn.** The `sync-main-after-merge.sh` PostToolUse hook does it after `gh pr merge` and the merge API ([HOOKS.md](HOOKS.md)); read its message, and when it says it skipped, or a merge happened some other way (the GitHub UI, another machine), do it by hand: `git -C <main checkout> fetch origin`, then `git -C <main checkout> merge --ff-only origin/main`. Skip only when that checkout holds uncommitted edits to a file the merge changed (`git diff --name-only main origin/main` against `git status --short`), and say so. For a stacked merge the hook syncs after each PR; the last sync is the one that counts. Never commit to local `main`: it diverges from `origin/main` and every later `--ff-only` fails. Finish the worktree slot too (WORKTREES.md → Finishing).

### Stacked PRs (GitHub stacks)

- `gh pr merge` is refused for a PR in a stack ("must be merged using the asynchronous merge REST API"), and `gh stack merge` cannot bypass the required review. Merge bottom-first with `gh api -X PUT repos/CodeWarrior-debug/perspectize/pulls/<n>/merge-async -f merge_method=merge -F bypass_rules=true -f sha=<head sha>`, then poll `GET .../merge-async/<uuid>`. `bypass_rules` is the admin bypass (the `owners-protect-default` ruleset lists the admin role). The API has no delete-branch option: delete the branch afterwards with `gh api -X DELETE repos/CodeWarrior-debug/perspectize/git/refs/heads/<branch>`.
- To keep individual commits use `merge_method=merge`. "Rebase and merge" is refused once a branch holds a merge commit, e.g. from resolving a conflict with `main`.
- After merging the bottom PR, the next one retargets to `main` and CI reruns; wait for green before merging it. A conflict fix on a lower PR usually conflicts again in the one above (merge the lower branch into it).
- You cannot approve your own PR (`gh pr review --approve` fails); admin bypass is the way through.
- Tooling: `gh stack` extension plus the user-scope `gh-stack` skill (`gh skill install github/gh-stack gh-stack --agent claude-code --scope user`; needs `gh` 2.90+).
