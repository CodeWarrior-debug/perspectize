// Run with: node --test .github/scripts/migration-labels.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planLabels, UNAPPLIED, APPLIED, CHECK } = require('./migration-labels');

const main = [26, 27].flatMap((v) => [
	`backend/migrations/0000${v}_m${v}.up.sql`,
	`backend/migrations/0000${v}_m${v}.down.sql`,
]);

function pr(number, versions, labels = [], extra = []) {
	const files = versions.flatMap((v) => [
		{ filename: `backend/migrations/${String(v).padStart(6, '0')}_pr${number}.up.sql`, status: 'added' },
		{ filename: `backend/migrations/${String(v).padStart(6, '0')}_pr${number}.down.sql`, status: 'added' },
	]);
	return { number, labels, files: [...files, ...extra] };
}

const byNumber = (plan) => Object.fromEntries(plan.map((p) => [p.number, p]));

test('next free number, nothing else claims it: unapplied only', () => {
	const [p] = planLabels({ mainFiles: main, prs: [pr(1, [28])] });
	assert.deepEqual(p.add, [UNAPPLIED]);
	assert.deepEqual(p.reasons, []);
});

test('two open PRs with the same number both get the check label', () => {
	const plan = byNumber(planLabels({ mainFiles: main, prs: [pr(513, [30]), pr(466, [30]), pr(1, [28]), pr(2, [29])] }));
	assert.ok(plan[513].add.includes(CHECK));
	assert.ok(plan[466].add.includes(CHECK));
	assert.match(plan[513].reasons.join(), /also used by #466/);
	assert.match(plan[466].reasons.join(), /also used by #513/);
});

test('skipping numbers gets the check label', () => {
	const [p] = planLabels({ mainFiles: main, prs: [pr(440, [29])] });
	assert.deepEqual(p.add, [UNAPPLIED, CHECK]);
	assert.match(p.reasons[0], /000029 skips 000028 \(main is at 000027\)/);
});

test('a number already on main gets the check label', () => {
	const [p] = planLabels({ mainFiles: main, prs: [pr(9, [27])] });
	assert.ok(p.add.includes(CHECK));
	assert.match(p.reasons.join(), /000027 already exists on main/);
});

test('a gap inside one PR gets the check label', () => {
	const [p] = planLabels({ mainFiles: main, prs: [pr(9, [28, 30])] });
	assert.ok(p.add.includes(CHECK));
	assert.match(p.reasons.join(), /000028 → 000030 leaves a gap/);
});

test('once the conflict is gone the check label comes off', () => {
	const [p] = planLabels({ mainFiles: main, prs: [pr(1, [28], [UNAPPLIED, CHECK])] });
	assert.deepEqual(p.add, []);
	assert.deepEqual(p.remove, [CHECK]);
});

test('a PR that stops touching migrations loses both labels', () => {
	const [p] = planLabels({ mainFiles: main, prs: [pr(1, [], [UNAPPLIED, CHECK])] });
	assert.deepEqual(p.remove, [UNAPPLIED, CHECK]);
});

test('editing an existing migration is unapplied but claims no number', () => {
	const edit = { filename: 'backend/migrations/000027_m27.up.sql', status: 'modified' };
	const [p] = planLabels({ mainFiles: main, prs: [pr(1, [], [], [edit])] });
	assert.deepEqual(p.add, [UNAPPLIED]);
	assert.deepEqual(p.versions, []);
});

test('migrations-applied is never overridden', () => {
	const [p] = planLabels({ mainFiles: main, prs: [pr(1, [28], [APPLIED])] });
	assert.deepEqual(p.add, []);
	assert.deepEqual(p.remove, []);
});

test('non-migration files and deleted migrations are ignored', () => {
	const other = [
		{ filename: 'backend/migrations/README.md', status: 'added' },
		{ filename: 'backend/migrations/000028_x.up.sql', status: 'removed' },
		{ filename: 'frontend/src/app.css', status: 'modified' },
	];
	const [p] = planLabels({ mainFiles: main, prs: [pr(1, [], [], other)] });
	assert.deepEqual(p.add, []);
});

test('labels already correct: no changes', () => {
	const [p] = planLabels({ mainFiles: main, prs: [pr(1, [28], [UNAPPLIED, 'needs-demo-video'])] });
	assert.deepEqual(p.add, []);
	assert.deepEqual(p.remove, []);
});
