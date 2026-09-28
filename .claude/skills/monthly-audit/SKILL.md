---
name: monthly-audit
description: Monthly codebase health audit for Perspectize — lint/vuln/dead-code/coverage/duplication/migration checks, triaged into a trend report. Two entry points (manual local run, CI schedule) share this skill.
disable-model-invocation: true
argument-hint: "[local|ci] [base-tag]"
allowed-tools: Read, Grep, Glob, Bash(git:*), Bash(go:*), Bash(golangci-lint:*), Bash(pnpm:*), Bash(gh:*), Bash(jq:*), Bash(mkdir *), Write(.docs/audits/**), Edit(.docs/audits/**)
---

# Monthly Audit

Read `reference.md` in this directory for full detail on each phase, the
collection commands, and the report template. This file is the control flow.

**Never modify `backend/**`, `frontend/src/**`, or migration files.** Findings
are reported, not auto-fixed. The only writes this skill makes are under
`.docs/audits/**`.

## Arguments

`$ARGUMENTS` = `[mode] [base-tag]`. `mode` is `local` (default) or `ci`.
`base-tag` overrides the auto-detected previous audit tag (for backfilling
or re-running against a specific baseline).

## Phase 0 — Preflight

1. `mode="${1:-local}"`, `prev_tag="${2:-}"`.
2. If `prev_tag` is empty, find it: `git tag --list 'audit/*' --sort=-creatordate | head -1`.
3. `git diff --stat "${prev_tag:-origin/main}"..HEAD -- backend frontend/src backend/migrations` —
   scopes triage to what actually changed since the last audit.
4. `mkdir -p .docs/audits/raw/$(date +%Y-%m)`.

## Phase 1 — Collect

**local mode:** run each tool if present on PATH (check with `command -v`),
write raw output to `.docs/audits/raw/YYYY-MM/<tool>.json` or `.txt`, never
print raw output to chat. Skip silently (note in the skipped-tools list) any
tool not installed. See reference.md §Collect for exact commands per tool:
golangci-lint, govulncheck, deadcode, go test -coverprofile (skip if no local
Postgres reachable), pnpm exec jscpd, pnpm dlx knip, vitest --coverage,
squawk (only changed `.up.sql`), osv-scanner, gitleaks.

**ci mode:** do not run tools — read pre-collected output from
`./audit-artifacts/` (populated by the workflow's `collect` job) into the
same `.docs/audits/raw/YYYY-MM/` layout.

## Phase 2 — Dispatch subagents

Launch the six `audit-*` agents (architecture, docs-drift, tests, security,
deps, migrations) in parallel, passing each only the **file paths** under
`.docs/audits/raw/YYYY-MM/` it needs plus the `git diff --stat` output from
Phase 0 — not raw content pasted into the prompt. Run sequentially instead
only if the user says "pro" in their invocation. Each agent returns findings
per its own file (see agent definitions) — collect all six results.

## Phase 3 — Triage

1. Merge all subagent findings into one list. Dedupe by
   `id = hash(rule + file_path)` (stable across months even if line numbers
   shift).
2. Load the previous month's `.docs/audits/*.md` + its `findings.json`
   (if present). Classify each current finding as **New**, **Persisting(n)**
   (n = number of consecutive months seen, incrementing from the previous
   record), or **Resolved** (was present last time, absent now).
3. Drop any finding without a concrete `file:line` — no location means no
   actionable fix.

## Phase 4 — Report

Write `.docs/audits/YYYY-MM.md` (template in reference.md §Report) and
`.docs/audits/YYYY-MM/findings.json` (machine-readable, feeds next month's
triage). Report sections: summary, top-5 actions, trend table (new/persisting/
resolved counts vs. prior months), per-area breakdown, "looks bad but is
actually fine" (known false positives / accepted risk), tools skipped this
run and why.

**local mode:**
- `git add .docs/audits/YYYY-MM.md .docs/audits/YYYY-MM/findings.json`
- commit on a new branch `audit/YYYY-MM` off current HEAD
- `git tag audit/YYYY-MM`
- Ask the user before running `gh issue create` for any top-5 action item.

**ci mode:**
- Do not commit anything.
- Search for an existing **open** issue labeled `health-audit`. If found,
  update its body via `gh api .../issues/N -X PATCH -f body=@report`. If not
  found, create one with that label via `gh issue create --label health-audit`.
