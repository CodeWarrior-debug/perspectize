import { APP_VERSION, GIT_SHA, clientPlatform } from '$lib/buildInfo';
import { GRAPHQL_ENDPOINT } from '$lib/queries/client';

/**
 * Grafana Faro RUM: uncaught errors, web vitals (CLS/INP/LCP/FCP/TTFB), and fetch/XHR
 * tracing with W3C `traceparent` propagated to the GraphQL API only.
 *
 * No-op unless the VITE_FARO_URL build var is set. Both Faro packages are loaded with a
 * dynamic `import()` so they are code-split out of the critical-path chunk.
 */

let initPromise: Promise<void> | undefined;

/** Strip the query string and hash so share tokens / search terms never leave the browser. */
export function stripQuery(url: string): string {
	return url.split(/[?#]/, 1)[0];
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Regex matching only URLs on the GraphQL endpoint's origin, e.g.
 * `^https://api\.perspectize\.com(?:[/?#]|$)` — so trace headers never reach Clerk,
 * YouTube, or a lookalike host such as `api.perspectize.com.evil.io`.
 */
export function apiOriginRegex(endpoint: string = GRAPHQL_ENDPOINT): RegExp | undefined {
	try {
		const base = typeof location !== 'undefined' ? location.origin : undefined;
		const { origin } = new URL(endpoint, base);
		if (!origin || origin === 'null') return undefined;
		return new RegExp(`^${escapeRegExp(origin)}(?:[/?#]|$)`);
	} catch {
		return undefined;
	}
}

const URL_KEY = /url$/i;
const ABSOLUTE_URL = /^https?:\/\//i;
const MAX_DEPTH = 12;

/**
 * Walks a Faro transport item in place, stripping query strings/hashes from:
 * - any string under a key ending in `url` (`url`, `page_url`, `http.url`, …),
 * - any absolute http(s) URL string (resource timing names, stack frame filenames, …),
 * - OTLP span attributes `{ key: 'http.url' | 'http.target', value: { stringValue } }`.
 */
function scrubUrls(node: unknown, depth = 0): void {
	if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (let i = 0; i < node.length; i++) {
			const v = node[i];
			if (typeof v === 'string') {
				if (ABSOLUTE_URL.test(v)) node[i] = stripQuery(v);
			} else {
				scrubUrls(v, depth + 1);
			}
		}
		return;
	}
	const obj = node as Record<string, unknown>;
	// OTLP attribute pair: { key: 'http.target', value: { stringValue: '/graphql?x=1' } }
	if (typeof obj.key === 'string' && (URL_KEY.test(obj.key) || obj.key === 'http.target')) {
		const value = obj.value as { stringValue?: unknown } | undefined;
		if (value && typeof value.stringValue === 'string') value.stringValue = stripQuery(value.stringValue);
	}
	for (const [k, v] of Object.entries(obj)) {
		if (typeof v === 'string') {
			if (URL_KEY.test(k) || ABSOLUTE_URL.test(v)) obj[k] = stripQuery(v);
		} else {
			scrubUrls(v, depth + 1);
		}
	}
}

/** Faro `beforeSend` hook: scrub URLs in both the payload and the meta (page.url). */
export function scrubItem<T>(item: T): T {
	scrubUrls(item);
	return item;
}

async function doInit(url: string): Promise<void> {
	try {
		const [{ initializeFaro, getWebInstrumentations }, { TracingInstrumentation }] = await Promise.all([
			import('@grafana/faro-web-sdk'),
			import('@grafana/faro-web-tracing'),
		]);
		const apiRe = apiOriginRegex();
		initializeFaro({
			url,
			app: {
				name: 'perspectize-web',
				version: APP_VERSION,
				environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE,
			},
			instrumentations: [
				// Includes errors, web vitals, session, view and performance instrumentations.
				...getWebInstrumentations({ captureConsole: false }),
				new TracingInstrumentation({
					instrumentationOptions: {
						propagateTraceHeaderCorsUrls: apiRe ? [apiRe] : [],
					},
				}),
			],
			beforeSend: scrubItem,
			sessionTracking: {
				session: { attributes: { platform: clientPlatform(), git_sha: GIT_SHA } },
			},
		});
	} catch (err) {
		console.warn('[telemetry] Faro init failed; continuing without telemetry', err);
	}
}

/**
 * Initialise Faro once. Safe to call repeatedly; never rejects.
 */
export function initTelemetry(): Promise<void> {
	if (initPromise) return initPromise;
	const url = (import.meta.env.VITE_FARO_URL ?? '').trim();
	initPromise = url ? doInit(url) : Promise.resolve();
	return initPromise;
}
