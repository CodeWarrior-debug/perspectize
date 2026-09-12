# Dependency Security & Vulnerability Scanning

How Perspectize scans dependencies for known vulnerabilities, how to remediate
findings, and the non-obvious gotchas that make a "security updates" PR take
longer than expected.

> Scope: dependency CVE scanning (Trivy + `pnpm audit` + `govulncheck`).
> For secret management, auth layers, and rotation, see [SECURITY.md](SECURITY.md).

## The scanner setup

| Scanner | Scope | Where it runs |
|---------|-------|---------------|
| **Trivy** (`.github/workflows/trivy.yml`) | `backend/go.mod` + `frontend/pnpm-lock.yaml`, **production deps only** (dev deps suppressed) | CI gate on PRs touching lockfiles |
| **`pnpm audit --prod`** | Frontend production dependency tree | Local, before pushing lockfile changes |
| **`govulncheck`** | Go modules, **call-graph aware** (only reports vulns you actually reach) | Local, optional deeper check |
| **Dependabot** | Opens PRs for outdated/vulnerable deps (`gomod`, `npm`, `github-actions`, `gradle`, `docker`) | Automated |

The Trivy workflow is the **CI gate**. It triggers only when
`frontend/pnpm-lock.yaml`, `backend/go.sum`, or the workflow file itself
changes, and fails the build on `HIGH,CRITICAL` findings.

## Remediation workflow

When the security scan is red (or before opening a deps PR):

```bash
# 1. Frontend — see what Trivy will see (production tree, not just direct deps)
pnpm --dir frontend audit --prod

# 2. Backend — reproduce Trivy's Go findings locally with the real tool
#    (install once: see below). govulncheck is call-graph aware and may report
#    fewer; Trivy matches the dependency graph and is what CI uses.
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
  | sh -s -- -b /tmp/trivy-bin v0.71.0
/tmp/trivy-bin/trivy fs . --severity HIGH,CRITICAL --exit-code 1 --format table

# 3. Bump the offending package to its patched version
#    Frontend: edit package.json, then:
pnpm install --dir frontend
#    Backend:
cd backend && go get <module>@<patched-version> && go mod tidy

# 4. Re-run the local scan until it reports 0 / 0, then verify nothing broke
cd backend && go build ./... && go test ./...
pnpm --dir frontend run test:run
```

Always run the local Trivy `--format table` scan before pushing — it's the
exact gate CI uses and prints a readable findings table.

## Gotchas (learned the hard way)

### 1. `trivy-action` + `format: sarif` ignores the severity filter for exit-code

The `aquasecurity/trivy-action` builds the SARIF report **"with all
severities"** regardless of the `severity:` input, and then evaluates
`exit-code` against that full set. Result: a leftover LOW/MEDIUM transitive
finding fails the build even when there are **zero** HIGH/CRITICAL.

**Fix:** gate on a `table`-format step (which *does* respect `severity:`), and
make the SARIF step upload-only:

```yaml
# Gating step — respects severity filter, prints findings to the log
- uses: aquasecurity/trivy-action@master
  with:
    scan-type: fs
    scan-ref: .
    severity: HIGH,CRITICAL
    exit-code: 1
    format: table

# Upload-only — never fails the build; feeds the GitHub Security tab
- uses: aquasecurity/trivy-action@master
  if: always()
  with:
    scan-type: fs
    scan-ref: .
    severity: HIGH,CRITICAL
    limit-severities-for-sarif: true   # keep the tab scoped too
    exit-code: 0
    format: sarif
    output: trivy-results.sarif
```

### 2. `format: sarif` hides findings from the GHA log

SARIF output goes to a file (uploaded to the Security tab), so a failing run
shows only `Process completed with exit code 1` with no detail. Always have the
**gating** step use `format: table` so findings are visible inline in the run
log. Don't debug Trivy failures from the log alone — reproduce locally.

### 3. `pnpm audit` ≠ what Trivy sees — use `--prod`

Trivy scans the **production** dependency tree, including transitive deps pulled
in through peer dependencies. Plain `pnpm audit` (all deps) can both over-report
(dev-only noise) and miss the framing CI cares about. Use `pnpm audit --prod`.

Real example: `svelte-clerk` peer-depends on `@sveltejs/kit`, which dragged in
vulnerable `vite`, `devalue`, and `cookie`. None were direct dependencies —
they only surfaced under `--prod`, the same view Trivy uses.

### 4. Different scanners use different databases

`pnpm audit` uses the npm advisory DB; Trivy uses its own (which includes Go
advisories npm never sees). A clean `pnpm audit` does **not** mean Trivy is
clean. Example: `go-jose/v3` CVE-2026-34986 (HIGH) was flagged by Trivy's Go DB
and invisible to npm tooling. Run the scanner that gates CI, not a proxy.

### 5. Prefer `^` over `>=` in pnpm `overrides`

**Overrides live in `frontend/pnpm-workspace.yaml`'s `overrides:` block only
— never in `package.json`'s `pnpm.overrides`.** With `package.json#pnpm.overrides`
non-empty, pnpm's config loader replaces the whole `overrides` object instead
of merging it with `pnpm-workspace.yaml`'s, so the workspace file's entries
are silently ignored (no warning, no error) — a known, currently-open
upstream pnpm bug ([#10675](https://github.com/pnpm/pnpm/issues/10675),
[#10614](https://github.com/pnpm/pnpm/issues/10614), open as of pnpm
10.29.3). Worse, `pnpm/action-setup` in CI and Dependabot's pnpm helper
resolve the two files in opposite priority order, so if both are populated
and drift apart, Dependabot PRs regenerate the lockfile against the wrong
file's values and fail `pnpm install --frozen-lockfile` in CI with
`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`. Keep `package.json#pnpm.overrides` empty
and put every override in `pnpm-workspace.yaml` (see the comment there). This
should be revisited once the repo bumps pnpm past whatever version fixes the
upstream bug — and again at pnpm 11, which drops `package.json#pnpm` support
entirely in favor of `pnpm-workspace.yaml`, potentially reversing which file
"wins" in the interim.

`>=x` lets a transitive resolve to a future **major** version with breaking
changes. `^x` pins to the current major while still taking the security patch.

```yaml
# frontend/pnpm-workspace.yaml
overrides:
  cookie: ^0.7.0          # good: patched, but won't jump to 1.x
  picomatch: ^4.0.4
  # avoid: cookie: ">=0.7.0"
```

When overriding a package only on a specific path, scope it:
`'tinyglobby>picomatch': ^4.0.4`. (Note: an override version must actually
exist — e.g. there is no `picomatch@2.3.2`; the v2 line tops out at `2.3.1`.)

**Exception — pin exact when a specific version must be excluded.** Caret only
bounds the *major* (or, below `1.0.0`, the *minor*) — it doesn't exclude a
single bad version within that range. If the override exists to keep a
*specific* published version out (blocked by `minimumReleaseAge`, see #7
below; or a known regression), use an exact pin instead:

```yaml
prosemirror-transform: 1.12.0   # exact: 1.12.1 satisfies ^1.12.0 too,
                                 # so caret wouldn't exclude it
```

**Exception — compound OR ranges for a skipped vulnerable band.** `nanoid`'s
override (`>=3.3.18 <5 || >=5.1.6 <6`) intentionally spans two major versions
to support both v3 and v5 consumers while excluding an all-vulnerable v4 —
don't collapse this to a single caret (`^5.1.6` would drop the v3 band
entirely and could break dependents pinned to it; see `de712a4` for the CI
compat break from over-narrowing this once already).

### 6. A path-filtered workflow won't re-run on workflow-only edits

If a workflow has a `paths:` filter, editing **only** the workflow file does not
re-trigger it — and a path-skipped run leaves the PR showing the stale previous
status. Add the workflow file to its own `paths:` so config changes re-validate:

```yaml
on:
  pull_request:
    paths:
      - "frontend/pnpm-lock.yaml"
      - "backend/go.sum"
      - ".github/workflows/trivy.yml"   # re-run when the scan config changes
```

### 7. pnpm's `minimumReleaseAge` blocks freshly-published transitive deps

pnpm (10.16+) refuses to install a lockfile entry published within a rolling
age window (default 24h) as a supply-chain guard against just-published
(potentially compromised) packages. This isn't a CVE — it's a **timing**
check — and it fires on transitive deps you never touched directly:

```
✗ Lockfile failed supply-chain policy check
[ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION] prosemirror-transform@1.12.1 was
published within the minimumReleaseAge cutoff
```

`prosemirror-transform@1.12.1` came in transitively via `@tiptap/*` (no
direct pin) and got resolved to the newest release, which happened to be
hours old. Same failure mode as `8939867` (`@sveltejs/kit` pinned to `~2.63.1`
for this exact reason).

**Fix:** add an exact-pin override (see the exception under #5) to the last
version that's already past the age window — check publish dates with
`npm view <pkg> time --json`. Don't disable or loosen the policy itself; it's
doing its job. The pin can usually be relaxed (or removed) once a newer,
now-aged release exists and there's a reason to move off the pinned version.

## Known unfixable findings

Some advisories have no patched release yet. Document them rather than
suppressing silently, and re-check when upstream ships a fix:

- **`lodash ≤4.17.23`** (code injection via `_.template`) reaches us only
  through `@vite-pwa/sveltekit > workbox-build`, a build-time dev dependency.
  There is no `lodash@4.18.0`; the fix must come from upstream `workbox-build`.
  Trivy suppresses dev deps, so this does not gate CI.

## Quick reference

```bash
# Frontend production audit (matches Trivy's view)
pnpm --dir frontend audit --prod

# Local Trivy gate (exactly what CI runs)
/tmp/trivy-bin/trivy fs . --severity HIGH,CRITICAL --exit-code 1 --format table

# Backend deep check (call-graph aware)
cd backend && go run golang.org/x/vuln/cmd/govulncheck@latest ./...

# Bump + tidy
cd backend && go get <module>@<version> && go mod tidy
pnpm install --dir frontend
```
