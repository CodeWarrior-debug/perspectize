// Capacity ramp test: finds where latency starts to degrade as concurrent
// VUs increase, by stepping through a range of concurrency levels against a
// single operation and watching p95 per step (see stages below).
//
// This is NOT meant to run against a normal dev server — the global rate
// limiter (default 100/min/IP) will dominate the results long before real
// capacity limits do. Run it against an instance with RATE_LIMIT_PER_MIN
// raised (see backend/perf/k6/README.md "Capacity ramp test").
import http from 'k6/http';
import { check, group } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8081';

const QUERY = `query ContentList($first: Int) {
  content(first: $first, sortBy: CREATED_AT, sortOrder: DESC) {
    items { id name }
    pageInfo { hasNextPage endCursor }
  }
}`;

export const options = {
	scenarios: {
		ramp: {
			executor: 'ramping-vus',
			startVUs: 1,
			stages: [
				{ duration: '15s', target: 50 },
				{ duration: '15s', target: 60 },
				{ duration: '15s', target: 70 },
				{ duration: '15s', target: 80 },
				{ duration: '15s', target: 90 },
				{ duration: '15s', target: 100 },
				{ duration: '10s', target: 0 },
			],
		},
	},
	// No pass/fail thresholds — this is exploratory, we want the full curve
	// including the degraded tail, not an early abort.
};

export default function () {
	group('contentList', () => {
		const res = http.post(`${BASE_URL}/graphql`, JSON.stringify({ query: QUERY, variables: { first: 10 } }), {
			headers: { 'Content-Type': 'application/json' },
		});
		check(res, {
			'status is 200': (r) => r.status === 200,
			'no graphql errors': (r) => {
				try {
					return !JSON.parse(r.body).errors;
				} catch {
					return false;
				}
			},
		});
	});
}
