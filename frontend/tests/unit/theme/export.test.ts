import { describe, it, expect, vi, afterEach } from 'vitest';
import { themeToCssText, themeFileName, downloadThemeCss } from '$lib/theme/export';
import { deriveTheme } from '$lib/theme/derive';
import { THEME_PRESETS } from '$lib/theme/presets';

describe('themeFileName', () => {
	it('kebab-cases an arbitrary theme name', () => {
		expect(themeFileName('My Custom Theme!')).toBe('my-custom-theme.css');
	});

	it('falls back to "theme" for an empty/whitespace name', () => {
		expect(themeFileName('   ')).toBe('theme.css');
	});
});

describe('themeToCssText', () => {
	it('emits an @theme block containing every derived token', () => {
		const tokens = deriveTheme(THEME_PRESETS[0].base);
		const css = themeToCssText('Reading Room', tokens);
		expect(css).toContain('@theme {');
		expect(css).toContain(`--color-primary: ${tokens.primary};`);
		expect(css).toContain(`--color-rating-positive: ${tokens.ratingPositive};`);
	});
});

describe('downloadThemeCss', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('creates an object URL, clicks a temporary anchor, then revokes the URL', () => {
		const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
		const revokeObjectURL = vi.fn();
		vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		const appendSpy = vi.spyOn(document.body, 'appendChild');
		const removeSpy = vi.spyOn(document.body, 'removeChild');

		const tokens = deriveTheme(THEME_PRESETS[0].base);
		downloadThemeCss('Reading Room', tokens);

		expect(createObjectURL).toHaveBeenCalledTimes(1);
		expect(clickSpy).toHaveBeenCalledTimes(1);
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

		// The anchor appended/removed is the one that was clicked, and it's
		// named after the theme (via themeFileName) — the whole point of routing
		// the download through a temporary <a download> instead of navigating.
		const appendedAnchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
		expect(appendedAnchor.download).toBe('reading-room.css');
		expect(removeSpy).toHaveBeenCalledWith(appendedAnchor);
	});
});
