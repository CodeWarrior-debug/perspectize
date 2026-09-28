// Per-operation load test against /graphql. Each operation in OPERATIONS
// runs inside its own k6 group() so its latency is reported isolated from
// every other route, instead of one averaged "graphql" number.
//
// Each operation runs as a `shared-iterations` scenario with a *fixed,
// guaranteed* iteration count (ITERATIONS, default 20, floor 10) rather than
// a time-boxed ramp — so every run reports a known, comparable sample size
// instead of "however many fit in the time window."
//
// Only read-only queries are included by default. All GraphQL mutations in
// this schema require @auth and write real rows to the shared Sevalla dev
// database (see backend/CLAUDE.md) — repeatedly load-testing them would
// pollute shared state, so they're intentionally left out. See "Testing
// mutations" below if you need to add one against a disposable environment.
//
// Usage:
//   k6 run perf/k6/graphql.js
//   AUTH_TOKEN=<jwt> k6 run perf/k6/graphql.js
//   k6 run perf/k6/graphql.js --env OPERATION=contentList
//   k6 run perf/k6/graphql.js --env ITERATIONS=50
import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const ONLY_OPERATION = __ENV.OPERATION || '';
const VUS = Number(__ENV.VUS || 2);
// Iterations are the unit that counts here, not duration — enforce a floor
// so a short/misconfigured run can't silently report on too few samples.
const ITERATIONS = Math.max(10, Number(__ENV.ITERATIONS || 20));

// Optional ids for operations that need a real record to query. Falls back
// to skipping that operation (with a console warning) when unset, so the
// suite still runs something useful with zero configuration.
const CONTENT_ID = __ENV.CONTENT_ID || '';
const PERSPECTIVE_ID = __ENV.PERSPECTIVE_ID || '';
const USERNAME = __ENV.USERNAME || '';

// Each entry isolates one route/operation. requiresAuth ops are skipped
// (with a console warning, not a failure) when AUTH_TOKEN isn't set, and
// requiresArg ops are skipped when their id/arg env var isn't set — so the
// remaining ops still give a useful signal on their own.
const OPERATIONS = {
	contentList: {
		requiresAuth: false,
		query: `query ContentList($first: Int) {
      content(first: $first, sortBy: CREATED_AT, sortOrder: DESC) {
        items { id name }
        pageInfo { hasNextPage endCursor }
      }
    }`,
		variables: { first: 10 },
	},
	contentByID: {
		requiresAuth: false,
		requiresArg: CONTENT_ID ? null : 'CONTENT_ID',
		query: `query ContentByID($id: ID!) {
      contentByID(id: $id) { id name }
    }`,
		variables: { id: CONTENT_ID },
	},
	perspectivesList: {
		requiresAuth: false,
		query: `query PerspectivesList($first: Int) {
      perspectives(first: $first, sortBy: CREATED_AT, sortOrder: DESC) {
        items { id }
        pageInfo { hasNextPage endCursor }
      }
    }`,
		variables: { first: 10 },
	},
	perspectiveByID: {
		requiresAuth: false,
		requiresArg: PERSPECTIVE_ID ? null : 'PERSPECTIVE_ID',
		query: `query PerspectiveByID($id: ID!) {
      perspectiveByID(id: $id) { id }
    }`,
		variables: { id: PERSPECTIVE_ID },
	},
	users: {
		requiresAuth: false,
		query: `query Users { users { id username } }`,
		variables: {},
	},
	userByUsername: {
		requiresAuth: false,
		requiresArg: USERNAME ? null : 'USERNAME',
		query: `query UserByUsername($username: String!) {
      userByUsername(username: $username) { id username }
    }`,
		variables: { username: USERNAME },
	},
	wikidataSearch: {
		requiresAuth: false,
		query: `query WikidataSearch($query: String!, $limit: Int) {
      wikidataSearch(query: $query, limit: $limit) { qid label }
    }`,
		variables: { query: 'science', limit: 5 },
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
		if (op.requiresArg) {
			console.warn(`Skipping "${name}" — requires ${op.requiresArg} env var`);
			return false;
		}
		return true;
	});
}

function buildScenarios() {
	const scenarios = {};
	const active = activeOperationNames();
	active.forEach((name, i) => {
		scenarios[name] = {
			executor: 'shared-iterations',
			exec: name,
			vus: VUS,
			iterations: ITERATIONS,
			// Safety net only — the scenario ends as soon as ITERATIONS
			// completes; this just prevents a hang if the server stalls.
			maxDuration: '2m',
			// Stagger scenarios so they don't compete with each other and
			// pollute one another's isolated timings, and so total
			// throughput stays well under the API's per-IP rate limit
			// (see README "Rate limiting").
			startTime: `${i * 20}s`,
		};
	});
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
export function contentByID() {
	runOperation('contentByID');
}
export function perspectivesList() {
	runOperation('perspectivesList');
}
export function perspectiveByID() {
	runOperation('perspectiveByID');
}
export function users() {
	runOperation('users');
}
export function userByUsername() {
	runOperation('userByUsername');
}
export function wikidataSearch() {
	runOperation('wikidataSearch');
}
export function me() {
	runOperation('me');
}
