import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const initializeFaro = vi.fn();
const getWebInstrumentations = vi.fn((_opts?: unknown) => [{ name: 'web-instr' }]);
const TracingInstrumentation = vi.fn(function (this: { options: unknown }, options: unknown) {
	this.options = options;
});

vi.mock('@grafana/faro-web-sdk', () => ({ initializeFaro, getWebInstrumentations }));
vi.mock('@grafana/faro-web-tracing', () => ({ TracingInstrumentation }));

const FARO_URL = 'https://faro-collector-prod-us-east-0.grafana.net/collect/abc123';
const GRAPHQL_URL = 'https://api.perspectize.com/graphql';

async function loadTelemetry() {
	vi.resetModules();
	return import('$lib/telemetry');
}

type FaroConfig = {
	url: string;
	app: { name: string; version: string; environment: string };
	instrumentations: unknown[];
	beforeSend: (item: unknown) => unknown;
	sessionTracking: { session: { attributes: Record<string, string> } };
};

function faroConfig(): FaroConfig {
	expect(initializeFaro).toHaveBeenCalledTimes(1);
	return initializeFaro.mock.calls[0][0] as FaroConfig;
}

function propagateUrls(): RegExp[] {
	expect(TracingInstrumentation).toHaveBeenCalledTimes(1);
	const opts = TracingInstrumentation.mock.calls[0][0] as {
		instrumentationOptions: { propagateTraceHeaderCorsUrls: RegExp[] };
	};
	return opts.instrumentationOptions.propagateTraceHeaderCorsUrls;
}

beforeEach(() => {
	initializeFaro.mockReset();
	getWebInstrumentations.mockClear();
	TracingInstrumentation.mockClear();
	vi.stubEnv('VITE_GRAPHQL_URL', GRAPHQL_URL);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('initTelemetry', () => {
	it('is a no-op when VITE_FARO_URL is empty', async () => {
		vi.stubEnv('VITE_FARO_URL', '');
		const { initTelemetry } = await loadTelemetry();
		await initTelemetry();
		expect(initializeFaro).not.toHaveBeenCalled();
		expect(TracingInstrumentation).not.toHaveBeenCalled();
	});

	it('passes the collector url and app name/version/environment', async () => {
		vi.stubEnv('VITE_FARO_URL', FARO_URL);
		vi.stubEnv('VITE_APP_ENV', 'production');
		const { initTelemetry } = await loadTelemetry();
		const { APP_VERSION } = await import('$lib/buildInfo');
		await initTelemetry();
		const cfg = faroConfig();
		expect(cfg.url).toBe(FARO_URL);
		expect(cfg.app).toEqual({ name: 'perspectize-web', version: APP_VERSION, environment: 'production' });
	});

	it('falls back to the Vite mode when VITE_APP_ENV is unset', async () => {
		vi.stubEnv('VITE_FARO_URL', FARO_URL);
		vi.stubEnv('VITE_APP_ENV', '');
		const { initTelemetry } = await loadTelemetry();
		await initTelemetry();
		expect(faroConfig().app.environment).toBe(import.meta.env.MODE);
	});

	it('uses web instrumentations without console capture, plus tracing', async () => {
		vi.stubEnv('VITE_FARO_URL', FARO_URL);
		const { initTelemetry } = await loadTelemetry();
		await initTelemetry();
		expect(getWebInstrumentations).toHaveBeenCalledWith({ captureConsole: false });
		const instrumentations = faroConfig().instrumentations;
		expect(instrumentations).toContainEqual({ name: 'web-instr' });
		expect(instrumentations.some((i) => i instanceof TracingInstrumentation)).toBe(true);
	});

	it('tags the session with platform and git sha', async () => {
		vi.stubEnv('VITE_FARO_URL', FARO_URL);
		const { initTelemetry } = await loadTelemetry();
		const { GIT_SHA } = await import('$lib/buildInfo');
		await initTelemetry();
		expect(faroConfig().sessionTracking.session.attributes).toEqual({ platform: 'web', git_sha: GIT_SHA });
	});

	it('propagates trace headers only to the GraphQL origin', async () => {
		vi.stubEnv('VITE_FARO_URL', FARO_URL);
		const { initTelemetry } = await loadTelemetry();
		await initTelemetry();
		const urls = propagateUrls();
		expect(urls).toHaveLength(1);
		const [re] = urls;
		expect(re).toBeInstanceOf(RegExp);
		expect(re.test('https://api.perspectize.com/graphql')).toBe(true);
		expect(re.test('https://api.perspectize.com')).toBe(true);
		expect(re.test('https://api.clerk.com/v1/client')).toBe(false);
		expect(re.test('https://www.googleapis.com/youtube/v3/videos')).toBe(false);
		expect(re.test('https://api.perspectize.com.evil.io/graphql')).toBe(false);
		expect(re.test('https://apiXperspectize.com/graphql')).toBe(false);
		expect(re.test('https://evil.io/?u=https://api.perspectize.com/graphql')).toBe(false);
	});

	it('beforeSend strips query strings and hashes from urls', async () => {
		vi.stubEnv('VITE_FARO_URL', FARO_URL);
		const { initTelemetry } = await loadTelemetry();
		await initTelemetry();
		const { beforeSend } = faroConfig();
		const out = beforeSend({
			type: 'measurement',
			payload: {
				type: 'web-vitals',
				context: { page_url: 'https://perspectize.com/share?token=secret#x' },
			},
			meta: {
				page: { id: 'p1', url: 'https://perspectize.com/discover?q=private+search#top' },
			},
		}) as {
			payload: { context: { page_url: string } };
			meta: { page: { id: string; url: string } };
		};
		expect(out.meta.page.url).toBe('https://perspectize.com/discover');
		expect(out.meta.page.id).toBe('p1');
		expect(out.payload.context.page_url).toBe('https://perspectize.com/share');
	});

	it('beforeSend strips query strings from OTLP span url attributes', async () => {
		vi.stubEnv('VITE_FARO_URL', FARO_URL);
		const { initTelemetry } = await loadTelemetry();
		await initTelemetry();
		const { beforeSend } = faroConfig();
		const out = beforeSend({
			type: 'trace',
			payload: {
				resourceSpans: [
					{
						scopeSpans: [
							{
								spans: [
									{
										attributes: [
											{ key: 'http.url', value: { stringValue: 'https://api.perspectize.com/graphql?x=1' } },
											{ key: 'http.method', value: { stringValue: 'POST' } },
										],
									},
								],
							},
						],
					},
				],
			},
			meta: {},
		}) as {
			payload: {
				resourceSpans: {
					scopeSpans: { spans: { attributes: { key: string; value: { stringValue: string } }[] }[] }[];
				}[];
			};
		};
		const attrs = out.payload.resourceSpans[0].scopeSpans[0].spans[0].attributes;
		expect(attrs[0].value.stringValue).toBe('https://api.perspectize.com/graphql');
		expect(attrs[1].value.stringValue).toBe('POST');
	});

	it('initializes only once when called twice', async () => {
		vi.stubEnv('VITE_FARO_URL', FARO_URL);
		const { initTelemetry } = await loadTelemetry();
		await Promise.all([initTelemetry(), initTelemetry()]);
		await initTelemetry();
		expect(initializeFaro).toHaveBeenCalledTimes(1);
	});

	it('swallows an initialization error', async () => {
		vi.stubEnv('VITE_FARO_URL', FARO_URL);
		initializeFaro.mockImplementation(() => {
			throw new Error('boom');
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { initTelemetry } = await loadTelemetry();
		await expect(initTelemetry()).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalled();
	});
});
