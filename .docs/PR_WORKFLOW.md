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

**Creating a PR:** the `require-session-reflection-before-pr.sh` hook blocks `gh pr create` until `/revise-claude-md` has run, and it can't detect completion. After running it, create the PR with `gh api repos/CodeWarrior-debug/perspectize/pulls -f title="..." -f body="..." -f head="branch" -f base="main"`.

**`gh` not authenticated (web sessions):**
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

**Issues** — use templates from `.github/ISSUE_TEMPLATE/` (feature_request.md or bug_report.md).

**Issues with plans:** include a plan reference and dependencies if present: for new work, the superpowers plan/spec path (`docs/superpowers/plans/{name}-plan.md`); for legacy in-flight work, the GSD plan reference (`.planning/phases/{phase}/{plan}-PLAN.md`) and acceptance criteria from `must_haves.truths`.

GitHub Projects v2: see [GITHUB_PROJECTS.md](GITHUB_PROJECTS.md).

## Demo requirement ("ready for review")

"ready for review" requires a demo, unless the user says otherwise. This applies to any PR whose change a user can **see or interact with** — new or changed UI, a fixed user-facing bug, changed app behaviour. Judge by the actual diff, not the commit type or title.

- **No demo needed** (a one-line reason in the Demo section is enough, e.g. "no visible UI change: formatting and test-type fixes"): docs/plan/research records, formatting/lint passes, test-only changes, type-only fixes, tooling/hooks/CI config, and refactors with no behaviour change.
- A qualifying PR is `ready for review` only once it has either: (a) `sv-` screenshots/video actually captured and linked in the Demo section (see [PR_SCREENSHOTS.md](PR_SCREENSHOTS.md)), or (b) an explicit, specific justification for why none applies — "dark by default, no UI surface", "no visible UI change", not a generic "N/A". A Demo section that just says screenshots are still needed does not qualify, no matter how green CI is.
- **A cloud session cannot produce that evidence** (no Clerk sign-in). So a cloud session finishing a qualifying (user-visible) PR must apply the `needs-demo-video` label at creation time (`gh api repos/CodeWarrior-debug/perspectize/issues/<n>/labels -f "labels[]=needs-demo-video"` — `gh pr edit` fails here) rather than leaving the PR unlabeled or self-declaring it ready. This is what flags the PR for a local session to pick up and finish.
- A local session that adds the missing evidence swaps the label: remove `needs-demo-video`, add `ready for review`, and paste the linked evidence into the PR's Demo section (don't just upload assets and leave the placeholder text).
- `needs-demo-video` and `ready for review` are **mutually exclusive** — never both on the same PR. If a PR is blocked by something else (merge conflict, a real failing/un-run CI check, an unresolved bug), it's fine for it to carry neither label rather than force-fitting one.
- An owner-only follow-up that needs a credential no agent has (`ANTHROPIC_API_KEY`, a Chrome origin-trial flag, a live Sevalla checkpoint) does **not** by itself block `ready for review` — that's normal handoff, not a missing demo. What blocks it is *this PR's own visible surface* going unverified.

See [VERIFICATION.md](VERIFICATION.md) for the evidence capture workflow.

## `needs-local-session-takeover` label

Marks a PR opened from a **cloud** session whose remaining work needs the user's machine (Docker, local-only MCP servers such as Sevalla, Clerk sign-in / browser verification). The PR body lists that work as a checklist and links the originating session.

- **Taking it over:** from a local checkout, `git pull` the PR branch, then run `claude --teleport` and pick the session linked in the PR body — this resumes that cloud session locally with its full history. (Alternatively start a local session and work from the PR checklist.)
- **Cloud sessions:** apply the label (and list the local-only steps) instead of claiming unverified work is done.
- **Local sessions:** remove the label once every checklist item under "Local session takeover" is done.

## Migration labels

Migrations are never applied automatically (see `backend/CLAUDE.md` → Migrations): someone runs `migrate up` by hand against each environment after the PR merges. These labels track that, so a merged PR with a pending migration can't be forgotten.

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
