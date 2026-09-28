#!/usr/bin/env node
// Converts a k6 JSON-lines export (--out json=...) into a single readable
// HTML report, grouped by operation/group so per-route latency is easy to
// scan without parsing k6's raw stream by hand.
//
// Usage: node report.js <input.json> <output.html>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
	console.error('Usage: node report.js <input.json> <output.html>');
	process.exit(1);
}

const lines = readFileSync(inputPath, 'utf-8').split('\n').filter(Boolean);
const durations = {}; // group name -> [ms, ...]
let failed = 0;
let total = 0;

for (const line of lines) {
	let point;
	try {
		point = JSON.parse(line);
	} catch {
		continue;
	}
	if (point.type !== 'Point') continue;

	if (point.metric === 'http_req_duration') {
		const group = point.data.tags.group || 'ungrouped';
		(durations[group] ||= []).push(point.data.value);
	}
	if (point.metric === 'http_req_failed') {
		total += 1;
		if (point.data.value === 1) failed += 1;
	}
}

function percentile(arr, p) {
	const sorted = [...arr].sort((a, b) => a - b);
	const idx = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, idx)] ?? 0;
}

function stats(arr) {
	const sum = arr.reduce((a, b) => a + b, 0);
	return {
		count: arr.length,
		avg: (sum / arr.length).toFixed(1),
		p95: percentile(arr, 95).toFixed(1),
		p99: percentile(arr, 99).toFixed(1),
		max: Math.max(...arr).toFixed(1),
	};
}

const rows = Object.entries(durations)
	.map(([group, arr]) => ({ group: group.replace(/^::/, '') || 'root', ...stats(arr) }))
	.sort((a, b) => Number(b.p95) - Number(a.p95));

const failRate = total ? ((failed / total) * 100).toFixed(2) : '0.00';

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>k6 Performance Report</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 2rem; background: #f8f9fb; color: #1a1a1a; }
  h1 { margin-bottom: 0.25rem; }
  .meta { color: #666; margin-bottom: 1.5rem; }
  table { border-collapse: collapse; width: 100%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th, td { padding: 0.6rem 1rem; text-align: right; border-bottom: 1px solid #eee; }
  th:first-child, td:first-child { text-align: left; font-weight: 600; }
  th { background: #fafafa; font-size: 0.85rem; text-transform: uppercase; color: #666; }
  tr:hover { background: #f5f7fa; }
  .fail { color: ${failed > 0 ? '#c0392b' : '#27ae60'}; font-weight: 600; }
  .slow { color: #c0392b; }
</style>
</head>
<body>
  <h1>k6 Performance Report</h1>
  <p class="meta">Generated ${new Date().toISOString()} &middot; source: ${inputPath}</p>
  <p class="meta">Failure rate: <span class="fail">${failRate}%</span> (${failed}/${total} checks)</p>
  <table>
    <thead>
      <tr><th>Operation / Group</th><th>Requests</th><th>Avg (ms)</th><th>p95 (ms)</th><th>p99 (ms)</th><th>Max (ms)</th></tr>
    </thead>
    <tbody>
      ${rows
				.map(
					(r) => `<tr>
        <td>${r.group}</td>
        <td>${r.count}</td>
        <td>${r.avg}</td>
        <td class="${Number(r.p95) > 500 ? 'slow' : ''}">${r.p95}</td>
        <td class="${Number(r.p99) > 1000 ? 'slow' : ''}">${r.p99}</td>
        <td>${r.max}</td>
      </tr>`,
				)
				.join('\n      ')}
    </tbody>
  </table>
</body>
</html>
`;

writeFileSync(outputPath, html);
console.log(`Report written to ${outputPath}`);
