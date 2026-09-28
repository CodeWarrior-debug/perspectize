// Smoke-tests /health — no auth needed. Use this to sanity-check an
// environment is reachable before running the heavier graphql.js script.
//
// Uses a fixed iteration count (ITERATIONS, default 20, floor 10) rather
// than a time-boxed ramp, so every run reports a known, comparable sample
// size.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const VUS = Number(__ENV.VUS || 2);
const ITERATIONS = Math.max(10, Number(__ENV.ITERATIONS || 20));

export const options = {
	scenarios: {
		health: {
			executor: 'shared-iterations',
			// Kept modest: the API has a global per-IP rate limit (default
			// 100/min, see README "Rate limiting"). Higher VU counts will
			// mostly measure the limiter, not real latency.
			vus: VUS,
			iterations: ITERATIONS,
			maxDuration: '2m',
		},
	},
	thresholds: {
		http_req_duration: ['p(95)<200'],
		http_req_failed: ['rate<0.01'],
	},
};

export default function () {
	const res = http.get(`${BASE_URL}/health`);
	check(res, { 'status is 200': (r) => r.status === 200 });
	sleep(0.5);
}
