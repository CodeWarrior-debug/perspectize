import { describe, it, expect } from 'vitest';
import { safeExternalUrl, buildContributePaths, isContributeTabEnabled } from '$lib/contribute/config';

const VALID = 'https://buy.stripe.com/test_abc';

describe('safeExternalUrl', () => {
	it('returns the href for a valid https URL', () => {
		expect(safeExternalUrl(VALID)).toBe(VALID);
	});

	it.each([undefined, '', '   '])('returns undefined for %j', (value) => {
		expect(safeExternalUrl(value)).toBeUndefined();
	});

	it.each(['http://x.com', 'javascript:alert(1)', 'not a url', 'ftp://x.com'])('rejects %s', (value) => {
		expect(safeExternalUrl(value)).toBeUndefined();
	});

	it('trims surrounding whitespace before parsing', () => {
		expect(safeExternalUrl(`  ${VALID}  `)).toBe(VALID);
	});
});

describe('buildContributePaths', () => {
	it('builds one support path with one link for a valid URL', () => {
		const paths = buildContributePaths({ VITE_SUPPORT_URL: VALID });
		expect(paths).toHaveLength(1);
		expect(paths[0].id).toBe('support');
		expect(paths[0].links).toHaveLength(1);
		expect(paths[0].links[0].href).toBe(VALID);
	});

	it.each([{}, { VITE_SUPPORT_URL: '' }, { VITE_SUPPORT_URL: '   ' }, { VITE_SUPPORT_URL: 'http://x.com' }])(
		'returns no paths for %j',
		(env) => {
			expect(buildContributePaths(env)).toEqual([]);
		},
	);
});

describe('isContributeTabEnabled', () => {
	const paths = buildContributePaths({ VITE_SUPPORT_URL: VALID });

	it('is true only for the exact string "true" with non-empty paths', () => {
		expect(isContributeTabEnabled({ VITE_FEATURE_CONTRIBUTE_TAB: 'true' }, paths)).toBe(true);
	});

	it.each(['TRUE', '1', undefined])('is false for flag %j', (flag) => {
		expect(isContributeTabEnabled({ VITE_FEATURE_CONTRIBUTE_TAB: flag }, paths)).toBe(false);
	});

	it('is false when there are no paths, even with the flag on', () => {
		expect(isContributeTabEnabled({ VITE_FEATURE_CONTRIBUTE_TAB: 'true' }, [])).toBe(false);
	});
});
