# Codebase Audits

Monthly health audits produced by the `monthly-audit` Claude Code skill
(`.claude/skills/monthly-audit/`). Two entry points, one skill:

- **Manual/local**: `/monthly-audit local` — run interactively, commits the
  report to an `audit/YYYY-MM` branch and tags it.
- **CI**: `.github/workflows/monthly-audit.yml`, scheduled the 1st of each
  month — collects tool output in CI, then runs the same skill in `ci` mode,
  which opens/updates a single GitHub issue labeled `health-audit` instead
  of committing.

## Layout

- `YYYY-MM.md` — the human-readable report for that month.
- `YYYY-MM/findings.json` — machine-readable findings, used by the next
  month's run to compute New / Persisting / Resolved trend counts.
- `raw/` — gitignored scratch output from the underlying tools
  (golangci-lint, govulncheck, jscpd, knip, vitest coverage, squawk, etc.).
  Never committed; regenerated on each run.

The audit never modifies `backend/**`, `frontend/src/**`, or migration
files — it only reports findings under this directory.
