#!/usr/bin/env node
/**
 * Runs StrykerJS over src/lib in size-balanced chunks, then aggregates the results.
 *
 * Why: one full Stryker pass over ~6,000 planted bugs can outlive a CI job or an agent
 * session (hours on 4 cores) and writes its report only at the very end, so a cut-off run
 * loses everything. Chunks each write their own report, so finished chunks are kept.
 *
 *   pnpm run mutate:chunked                      # all chunks, then the summary
 *   pnpm run mutate:chunked -- --only 3,4        # just those chunks (e.g. to resume), then the summary
 *   pnpm run mutate:chunked -- --aggregate-only  # summarise reports already on disk
 *   pnpm run mutate:chunked -- --configs-only    # write reports/chunk-N.conf.json and stop
 *   options: --chunks N (default 6)  --concurrency N (test runners per chunk, default 3)
 *
 * Output (all under the gitignored reports/): chunk-N.conf.json, chunk-N.log,
 * chunk-N/mutation.json + index.html, and mutation-summary.json.
 *
 * Results are reported as what they say about the TESTS: "caught" = Stryker Killed/Timeout,
 * "missed" = Survived, "no test runs it" = NoCoverage. See
 * docs/superpowers/specs/2026-09-29-test-hardening-spike.md.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, openSync, closeSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
	const i = args.indexOf(name);
	return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const chunkCount = Number(opt('--chunks', 6));
const concurrency = Number(opt('--concurrency', 3));
const only = opt('--only', '').split(',').filter(Boolean).map(Number);
const aggregateOnly = args.includes('--aggregate-only');
const configsOnly = args.includes('--configs-only');

const SRC = 'src/lib';
const REPORTS = 'reports';

// Mirrors the `mutate` globs in stryker.config.json (keep the two in sync): every .ts under
// src/lib except declaration files, vendored shadcn components and assets.
function sourceFiles(dir = SRC) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name).split('\\').join('/');
		if (entry.isDirectory()) {
			if (path === `${SRC}/assets` || path === `${SRC}/components/shadcn`) continue;
			out.push(...sourceFiles(path));
		} else if (path.endsWith('.ts') && !path.endsWith('.d.ts')) {
			out.push(path);
		}
	}
	return out;
}

// Greedy partition by line count so chunks take roughly equal time.
function partition(files, n) {
	const bins = Array.from({ length: n }, () => ({ loc: 0, files: [] }));
	const sized = files
		.map((f) => ({ f, loc: readFileSync(f, 'utf8').split('\n').length }))
		.sort((a, b) => b.loc - a.loc);
	for (const { f, loc } of sized) {
		const bin = bins.reduce((min, b) => (b.loc < min.loc ? b : min));
		bin.loc += loc;
		bin.files.push(f);
	}
	return bins.map((b) => b.files.sort());
}

// Stale output would be silently mixed into the summary: a chunk report from an earlier, different
// layout, or from a run that is about to be redone. Clear it before (re)running.
function clearStale() {
	mkdirSync(REPORTS, { recursive: true });
	for (const name of readdirSync(REPORTS)) {
		const match = name.match(/^chunk-(\d+)(\.conf\.json|\.log)?$/);
		if (!match) continue;
		const index = Number(match[1]);
		// Chunks beyond the current layout are always stale; in a full run (no --only) all are.
		if (index > chunkCount || !only.length) rmSync(`${REPORTS}/${name}`, { recursive: true, force: true });
	}
}

function writeConfigs() {
	clearStale();
	const base = JSON.parse(readFileSync('stryker.config.json', 'utf8'));
	const chunks = partition(sourceFiles(), chunkCount);
	chunks.forEach((files, idx) => {
		const i = idx + 1;
		const config = {
			...base,
			mutate: files,
			concurrency,
			reporters: ['clear-text', 'progress-append-only', 'json', 'html'],
			jsonReporter: { fileName: `${REPORTS}/chunk-${i}/mutation.json` },
			htmlReporter: { fileName: `${REPORTS}/chunk-${i}/index.html` },
			incrementalFile: `${REPORTS}/chunk-${i}/incremental.json`,
			tempDirName: `${REPORTS}/tmp-chunk${i}`,
		};
		writeFileSync(`${REPORTS}/chunk-${i}.conf.json`, JSON.stringify(config, null, 1));
		console.log(`chunk ${i}: ${files.length} files`);
	});
}

function runChunks() {
	for (let i = 1; i <= chunkCount; i++) {
		if (only.length && !only.includes(i)) continue;
		const started = new Date();
		console.log(`=== chunk ${i}/${chunkCount} start ${started.toISOString()}`);
		const log = openSync(`${REPORTS}/chunk-${i}.log`, 'w');
		// The config file is a positional argument in this Stryker version (no --configFile flag).
		const result = spawnSync('pnpm', ['exec', 'stryker', 'run', `${REPORTS}/chunk-${i}.conf.json`, '--force'], {
			stdio: ['ignore', log, log],
		});
		closeSync(log);
		const minutes = Math.round((Date.now() - started.getTime()) / 60000);
		console.log(`=== chunk ${i}/${chunkCount} exit ${result.status} after ${minutes} min`);
		if (result.status !== 0) console.log(`    see ${REPORTS}/chunk-${i}.log (a chunk that fails its dry run aborts)`);
	}
}

// Group for the per-area table: components/* and queries/* split one level deeper.
function area(file) {
	const parts = file.replace(`${SRC}/`, '').split('/');
	return ['components', 'queries'].includes(parts[0]) && parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0];
}

function aggregate() {
	const byFile = {};
	const missing = [];
	for (let i = 1; i <= chunkCount; i++) {
		const path = `${REPORTS}/chunk-${i}/mutation.json`;
		if (!existsSync(path)) {
			missing.push(i);
			continue;
		}
		for (const [file, info] of Object.entries(JSON.parse(readFileSync(path, 'utf8')).files)) {
			byFile[file] = info.mutants.map((m) => m.status);
		}
	}
	const tally = (statuses) => {
		const c = { caught: 0, missed: 0, noTest: 0 };
		for (const s of statuses) {
			if (s === 'Killed' || s === 'Timeout') c.caught++;
			else if (s === 'Survived') c.missed++;
			else if (s === 'NoCoverage') c.noTest++;
			// Ignored / CompileError / RuntimeError are not valid planted bugs and are left out.
		}
		return c;
	};
	const pct = (c) => {
		const all = c.caught + c.missed + c.noTest;
		return {
			all,
			caughtOfAll: all ? (100 * c.caught) / all : 0,
			caughtOfRun: c.caught + c.missed ? (100 * c.caught) / (c.caught + c.missed) : 0,
		};
	};
	const total = tally(Object.values(byFile).flat());
	const areas = {};
	for (const [file, statuses] of Object.entries(byFile)) {
		const a = area(file);
		areas[a] ??= [];
		areas[a].push(...statuses);
	}
	const line = (name, c) => {
		const p = pct(c);
		return `${name.padEnd(34)} planted ${String(p.all).padStart(5)}  caught ${String(c.caught).padStart(5)}  missed ${String(c.missed).padStart(4)}  no test runs it ${String(c.noTest).padStart(4)}  caught ${p.caughtOfAll.toFixed(1)}%`;
	};
	if (missing.length)
		console.log(`WARNING: no report for chunk(s) ${missing.join(', ')} — totals are partial, not a valid score.`);
	console.log('\nYour frontend tests caught (of all planted bugs) / (of those in code they run):');
	const p = pct(total);
	console.log(
		`  ${total.caught} of ${p.all} = ${p.caughtOfAll.toFixed(1)}% overall; ${p.caughtOfRun.toFixed(1)}% in code they run\n`,
	);
	console.log('By area (lowest catch rate first):');
	Object.entries(areas)
		.map(([name, statuses]) => [name, tally(statuses)])
		.sort((x, y) => pct(x[1]).caughtOfAll - pct(y[1]).caughtOfAll)
		.forEach(([name, c]) => console.log('  ' + line(name, c)));
	console.log('\nFiles with the most missed / untested (top 12):');
	Object.entries(byFile)
		.map(([file, statuses]) => [file.replace(`${SRC}/`, ''), tally(statuses)])
		.sort((x, y) => y[1].missed + y[1].noTest - (x[1].missed + x[1].noTest))
		.slice(0, 12)
		.forEach(([name, c]) => console.log('  ' + line(name, c)));
	writeFileSync(
		`${REPORTS}/mutation-summary.json`,
		JSON.stringify(
			{
				total,
				missingChunks: missing,
				areas: Object.fromEntries(Object.entries(areas).map(([k, v]) => [k, tally(v)])),
			},
			null,
			1,
		),
	);
}

if (!aggregateOnly) {
	writeConfigs();
	if (configsOnly) process.exit(0);
	runChunks();
}
aggregate();
