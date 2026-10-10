import { describe, it, expect, vi, beforeEach } from 'vitest';

const { faroUploader } = vi.hoisted(() => ({
	faroUploader: vi.fn((options: Record<string, unknown>) => ({
		name: 'rollup-plugin-faro-source-map-uploader',
		options,
	})),
}));
vi.mock('@grafana/faro-rollup-plugin', () => ({ default: faroUploader }));

import { faroSourcemapConfig, FARO_APP_NAME } from '../../scripts/faro-sourcemaps';

const FULL_ENV = {
	FARO_SOURCEMAP_API_KEY: 'key-123',
	FARO_APP_ID: '42',
	FARO_STACK_ID: '7',
	FARO_API_ENDPOINT: 'https://faro-api.example.grafana.net/faro/api/v1',
};

describe('faroSourcemapConfig', () => {
	beforeEach(() => {
		faroUploader.mockClear();
	});

	it('is a no-op when FARO_SOURCEMAP_API_KEY is unset', () => {
		const cfg = faroSourcemapConfig({});
		expect(cfg).toEqual({ plugins: [] });
		expect(cfg.sourcemap).toBeUndefined();
		expect(faroUploader).not.toHaveBeenCalled();
	});

	it('is a no-op when the key is an empty string, even with the other vars set', () => {
		const cfg = faroSourcemapConfig({ ...FULL_ENV, FARO_SOURCEMAP_API_KEY: '' });
		expect(cfg).toEqual({ plugins: [] });
		expect(faroUploader).not.toHaveBeenCalled();
	});

	it('enables hidden sourcemaps and the uploader when all vars are set', () => {
		const cfg = faroSourcemapConfig(FULL_ENV);
		expect(cfg.sourcemap).toBe('hidden');
		expect(cfg.plugins).toHaveLength(1);
		expect(faroUploader).toHaveBeenCalledTimes(1);
		expect(faroUploader).toHaveBeenCalledWith({
			appName: 'perspectize-web',
			endpoint: FULL_ENV.FARO_API_ENDPOINT,
			appId: '42',
			stackId: '7',
			apiKey: 'key-123',
			gzipContents: true,
		});
		expect(FARO_APP_NAME).toBe('perspectize-web');
		expect(cfg.plugins[0].name).toBe('rollup-plugin-faro-source-map-uploader');
	});

	it('applies the uploader to the client build only', () => {
		const [plugin] = faroSourcemapConfig(FULL_ENV).plugins;
		const apply = plugin.apply as (
			config: object,
			env: { command: 'build' | 'serve'; mode: string; isSsrBuild?: boolean },
		) => boolean;
		expect(apply({}, { command: 'build', mode: 'production', isSsrBuild: false })).toBe(true);
		expect(apply({}, { command: 'build', mode: 'production', isSsrBuild: true })).toBe(false);
		expect(apply({}, { command: 'serve', mode: 'development' })).toBe(false);
	});

	it.each(['FARO_APP_ID', 'FARO_STACK_ID', 'FARO_API_ENDPOINT'] as const)(
		'throws naming %s when the key is set but it is missing',
		(name) => {
			const env: Record<string, string | undefined> = { ...FULL_ENV, [name]: undefined };
			expect(() => faroSourcemapConfig(env)).toThrow(new RegExp(`${name} is missing`));
			expect(faroUploader).not.toHaveBeenCalled();
		},
	);

	it('names every missing var at once', () => {
		expect(() => faroSourcemapConfig({ FARO_SOURCEMAP_API_KEY: 'key-123' })).toThrow(
			/FARO_APP_ID, FARO_STACK_ID, FARO_API_ENDPOINT are missing/,
		);
	});
});
