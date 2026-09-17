#!/usr/bin/env node
// One-off analysis: buckets ramp.js's JSON output into its known 15s stage
// windows and reports p95/avg/throughput per concurrency level.
import { readFileSync } from 'node:fs';

const path = process.argv[2];
const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);

let points = [];
let testStart = null;
for (const line of lines) {
	let p;
	try {
		p = JSON.parse(line);
	} catch {
		continue;
	}
	if (p.type !== 'Point' || p.metric !== 'http_req_duration') continue;
	const t = new Date(p.data.time).getTime();
	if (testStart === null || t < testStart) testStart = t;
	points.push({ t, v: p.data.value });
}
points.forEach((p) => (p.rel = (p.t - testStart) / 1000));

// Matches the stages in ramp.js
const stages = [
	{ target: 5, end: 15 },
	{ target: 10, end: 30 },
	{ target: 20, end: 45 },
	{ target: 30, end: 60 },
	{ target: 40, end: 75 },
	{ target: 50, end: 90 },
];

function percentile(arr, p) {
	const sorted = [...arr].sort((a, b) => a - b);
	const idx = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, idx)] ?? 0;
}

let prevEnd = 0;
console.log('Target VUs | Requests | Avg (ms) | p95 (ms) | p99 (ms) | Max (ms)');
console.log('-----------|----------|----------|----------|----------|----------');
for (const stage of stages) {
	// Skip the first few seconds of each window to let the VU ramp settle.
	const windowStart = prevEnd + 3;
	const bucket = points.filter((p) => p.rel >= windowStart && p.rel < stage.end).map((p) => p.v);
	if (bucket.length === 0) {
		console.log(`${stage.target}\t| (no data)`);
		prevEnd = stage.end;
		continue;
	}
	const avg = bucket.reduce((a, b) => a + b, 0) / bucket.length;
	console.log(
		`${stage.target}\t\t| ${bucket.length}\t| ${avg.toFixed(1)}\t| ${percentile(bucket, 95).toFixed(1)}\t| ${percentile(bucket, 99).toFixed(1)}\t| ${Math.max(...bucket).toFixed(1)}`,
	);
	prevEnd = stage.end;
}
