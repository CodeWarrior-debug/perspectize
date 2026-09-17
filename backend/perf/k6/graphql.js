// Per-operation load test against /graphql. Each operation in OPERATIONS
// runs inside its own k6 group() so its latency is reported isolated from
// every other route, instead of one averaged "graphql" number.
//
// Usage:
//   k6 run perf/k6/graphql.js
//   AUTH_TOKEN=<jwt> k6 run perf/k6/graphql.js
//   k6 run perf/k6/graphql.js --env OPERATION=contentList
import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const ONLY_OPERATION = __ENV.OPERATION || '';

// Each entry isolates one route/operation. requiresAuth ops are skipped
// (with a console warning, not a failure) when AUTH_TOKEN isn't set, so the
// unauthenticated ops still give a useful signal on their own.
const OPERATIONS = {
	contentList: {
		requiresAuth: false,
		query: `query ContentList($first: Int) {
      content(first: $first, sortBy: CREATED_AT, sortOrder: DESC) {
        edges { node { id title } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
		variables: { first: 10 },
	},
	perspectivesList: {
		requiresAuth: false,
		query: `query PerspectivesList($first: Int) {
      perspectives(first: $first, sortBy: CREATED_AT, sortOrder: DESC) {
        edges { node { id } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
		variables: { first: 10 },
	},
	me: {
		requiresAuth: true,
		query: `query Me { me { id username } }`,
		variables: {},
	},
};

export const options = {
	scenarios: buildScenarios(),
	thresholds: buildThresholds(),
};

function activeOperationNames() {
	const names = ONLY_OPERATION ? [ONLY_OPERATION] : Object.keys(OPERATIONS);
	return names.filter((name) => {
		const op = OPERATIONS[name];
		if (!op) {
			console.warn(`Unknown OPERATION "${name}", skipping`);
			return false;
		}
		if (op.requiresAuth && !AUTH_TOKEN) {
			console.warn(`Skipping "${name}" — requires AUTH_TOKEN`);
			return false;
		}
		return true;
	});
}

function buildScenarios() {
	const scenarios = {};
	for (const name of activeOperationNames()) {
		scenarios[name] = {
			executor: 'ramping-vus',
			exec: name,
			startVUs: 0,
			// Kept modest: the API has a global per-IP rate limit (default
			// 100/min, see README "Rate limiting"). Higher VU counts will
			// mostly measure the limiter, not real latency.
			stages: [
				{ duration: '10s', target: 3 },
				{ duration: '20s', target: 3 },
				{ duration: '10s', target: 0 },
			],
			// Stagger scenarios so they don't compete with each other and
			// pollute one another's isolated timings.
			startTime: `${Object.keys(scenarios).length * 45}s`,
		};
	}
	return scenarios;
}

function buildThresholds() {
	const thresholds = {
		http_req_failed: ['rate<0.01'],
	};
	for (const name of activeOperationNames()) {
		thresholds[`group_duration{group:::${name}}`] = ['p(95)<500'];
	}
	return thresholds;
}

function runOperation(name) {
	const op = OPERATIONS[name];
	group(name, () => {
		const headers = { 'Content-Type': 'application/json' };
		if (AUTH_TOKEN) headers.Authorization = `Bearer ${AUTH_TOKEN}`;

		const res = http.post(
			`${BASE_URL}/graphql`,
			JSON.stringify({ query: op.query, variables: op.variables }),
			{ headers },
		);

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
	sleep(0.5);
}

// k6 requires one exported function per scenario `exec` name.
export function contentList() {
	runOperation('contentList');
}
export function perspectivesList() {
	runOperation('perspectivesList');
}
export function me() {
	runOperation('me');
}
