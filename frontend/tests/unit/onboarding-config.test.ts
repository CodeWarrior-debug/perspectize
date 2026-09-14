import { describe, it, expect, afterEach, vi } from 'vitest';
import { CURRENT_INTRO_VERSION, ONBOARDING_VIDEOS } from '$lib/onboarding/config';

describe('onboarding config', () => {
	it('exports CURRENT_INTRO_VERSION as 1', () => {
		expect(CURRENT_INTRO_VERSION).toBe(1);
	});

	it('exposes optional video URL slots', () => {
		expect(ONBOARDING_VIDEOS).toHaveProperty('guestProduct');
		expect(ONBOARDING_VIDEOS).toHaveProperty('howAddVideo');
		expect(ONBOARDING_VIDEOS).toHaveProperty('howPerspective');
		for (const key of ['guestProduct', 'howAddVideo', 'howPerspective'] as const) {
			const value = ONBOARDING_VIDEOS[key];
			expect(value === undefined || typeof value === 'string').toBe(true);
		}
	});
});

const ENV_KEYS = [
	'VITE_ONBOARDING_VIDEO_GUEST_PRODUCT',
	'VITE_ONBOARDING_VIDEO_HOW_ADD_VIDEO',
	'VITE_ONBOARDING_VIDEO_HOW_PERSPECTIVE',
] as const;

describe('onboarding config ONBOARDING_VIDEOS env var handling', () => {
	const originalValues = ENV_KEYS.map((key) => (import.meta.env as Record<string, string | undefined>)[key]);

	afterEach(() => {
		ENV_KEYS.forEach((key, i) => {
			const original = originalValues[i];
			const env = import.meta.env as Record<string, string | undefined>;
			if (original === undefined) {
				delete env[key];
			} else {
				env[key] = original;
			}
		});
		vi.resetModules();
	});

	it('leaves onboarding video URLs undefined when the env vars are unset/blank', async () => {
		(import.meta.env as Record<string, string | undefined>).VITE_ONBOARDING_VIDEO_GUEST_PRODUCT = '   ';
		delete (import.meta.env as Record<string, string | undefined>).VITE_ONBOARDING_VIDEO_HOW_ADD_VIDEO;
		vi.resetModules();
		const { ONBOARDING_VIDEOS } = await import('$lib/onboarding/config');
		expect(ONBOARDING_VIDEOS.guestProduct).toBeUndefined();
		expect(ONBOARDING_VIDEOS.howAddVideo).toBeUndefined();
	});

	it('trims and exposes a set onboarding video URL', async () => {
		(import.meta.env as Record<string, string | undefined>).VITE_ONBOARDING_VIDEO_HOW_PERSPECTIVE =
			'  /onboarding/perspective.mp4  ';
		vi.resetModules();
		const { ONBOARDING_VIDEOS } = await import('$lib/onboarding/config');
		expect(ONBOARDING_VIDEOS.howPerspective).toBe('/onboarding/perspective.mp4');
	});
});
