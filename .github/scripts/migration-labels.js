// Keeps the migration rollout labels on open PRs in sync with what each PR's
// migrations actually are. Run by .github/workflows/migration-labels.yml via
// actions/github-script; the rules are documented in .docs/PR_WORKFLOW.md →
// "Migration labels".
//
// planLabels() is pure (tested in migration-labels.test.js); run() only
// fetches the inputs from the GitHub API and applies the plan.

const UNAPPLIED = 'migrations-unapplied';
const APPLIED = 'migrations-applied';
const CHECK = 'check-migration-number-before-apply';

const MIGRATIONS_DIR = 'backend/migrations/';
const MIGRATION_FILE = /^backend\/migrations\/(\d+)_[^/]+\.sql$/;

/** Version number of a migration path, or null for anything else. */
function versionOf(path) {
	const m = MIGRATION_FILE.exec(path);
	return m ? Number(m[1]) : null;
}

/**
 * Decide label changes for every open PR.
 *
 * @param {object} input
 * @param {string[]} input.mainFiles  paths under backend/migrations/ on main
 * @param {{number: number, labels: string[], files: {filename: string, status: string}[]}[]} input.prs
 *   open PRs with the files they change
 * @returns {{number: number, add: string[], remove: string[], versions: number[], reasons: string[]}[]}
 */
function planLabels({ mainFiles, prs }) {
	const mainSet = new Set(mainFiles);
	const mainVersions = new Set(mainFiles.map(versionOf).filter((v) => v !== null));
	const maxMain = Math.max(0, ...mainVersions);

	// Versions each PR introduces: new migration files that main doesn't have.
	// A PR editing an existing migration still "touches migrations" but claims
	// no new number.
	const touched = new Map();
	const claims = new Map();
	for (const pr of prs) {
		const files = pr.files.filter((f) => f.status !== 'removed' && f.filename.startsWith(MIGRATIONS_DIR));
		touched.set(pr.number, files.some((f) => versionOf(f.filename) !== null));
		const versions = new Set();
		for (const f of files) {
			const v = versionOf(f.filename);
			if (v !== null && !mainSet.has(f.filename)) versions.add(v);
		}
		claims.set(pr.number, [...versions].sort((a, b) => a - b));
	}

	const claimants = new Map();
	for (const [number, versions] of claims) {
		for (const v of versions) claimants.set(v, [...(claimants.get(v) ?? []), number]);
	}

	return prs.map((pr) => {
		const has = new Set(pr.labels);
		const versions = claims.get(pr.number);
		const reasons = [];

		for (const v of versions) {
			if (mainVersions.has(v)) reasons.push(`${pad(v)} already exists on main`);
			const others = claimants.get(v).filter((n) => n !== pr.number);
			if (others.length) reasons.push(`${pad(v)} is also used by ${others.map((n) => `#${n}`).join(', ')}`);
		}
		if (versions.length && versions[0] > maxMain + 1) {
			reasons.push(`${pad(versions[0])} skips ${rangeText(maxMain + 1, versions[0] - 1)} (main is at ${pad(maxMain)})`);
		}
		for (let i = 1; i < versions.length; i++) {
			if (versions[i] !== versions[i - 1] + 1) reasons.push(`${pad(versions[i - 1])} → ${pad(versions[i])} leaves a gap`);
		}

		const want = new Set();
		if (touched.get(pr.number) && !has.has(APPLIED)) want.add(UNAPPLIED);
		if (reasons.length) want.add(CHECK);

		const managed = [UNAPPLIED, CHECK];
		return {
			number: pr.number,
			add: managed.filter((l) => want.has(l) && !has.has(l)),
			remove: managed.filter((l) => !want.has(l) && has.has(l)),
			versions,
			reasons,
		};
	});
}

function pad(v) {
	return String(v).padStart(6, '0');
}

function rangeText(from, to) {
	return from === to ? pad(from) : `${pad(from)}–${pad(to)}`;
}

/** Entry point for actions/github-script. */
async function run({ github, context, core }) {
	const { owner, repo } = context.repo;

	const { data: listing } = await github.rest.repos.getContent({
		owner,
		repo,
		path: MIGRATIONS_DIR.replace(/\/$/, ''),
		ref: context.payload.repository.default_branch,
	});
	const mainFiles = listing.map((e) => e.path);

	const open = await github.paginate(github.rest.pulls.list, { owner, repo, state: 'open', per_page: 100 });
	const prs = [];
	for (const pr of open) {
		const files = await github.paginate(github.rest.pulls.listFiles, {
			owner,
			repo,
			pull_number: pr.number,
			per_page: 100,
		});
		prs.push({ number: pr.number, labels: pr.labels.map((l) => l.name), files });
	}

	const plan = planLabels({ mainFiles, prs });
	const rows = [];
	for (const p of plan) {
		if (p.add.length) await github.rest.issues.addLabels({ owner, repo, issue_number: p.number, labels: p.add });
		for (const name of p.remove) {
			try {
				await github.rest.issues.removeLabel({ owner, repo, issue_number: p.number, name });
			} catch (e) {
				if (e.status !== 404) throw e;
			}
		}
		if (p.versions.length || p.add.length || p.remove.length) {
			rows.push([
				`#${p.number}`,
				p.versions.map(pad).join(', ') || '—',
				[...p.add.map((l) => `+${l}`), ...p.remove.map((l) => `−${l}`)].join(' ') || 'no change',
				p.reasons.join('; ') || 'numbering OK',
			]);
		}
	}

	await core.summary
		.addHeading('Migration labels', 3)
		.addTable([
			[
				{ data: 'PR', header: true },
				{ data: 'New migrations', header: true },
				{ data: 'Labels', header: true },
				{ data: 'Numbering', header: true },
			],
			...rows,
		])
		.write();
}

module.exports = { planLabels, run, UNAPPLIED, APPLIED, CHECK };
