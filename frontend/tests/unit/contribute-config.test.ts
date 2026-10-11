import { describe, it, expect } from 'vitest';
import {
	safeExternalUrl,
	buildContributePaths,
	isContributeTabEnabled,
	annualDiscountPercent,
	MONTHLY_PRICE,
	ANNUAL_PRICE,
} from '$lib/contribute/config';

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

describe('annualDiscountPercent', () => {
	it('is 40% for the shipped $5/month vs $36/year prices', () => {
		expect(annualDiscountPercent()).toBe(40);
		expect(MONTHLY_PRICE).toBe(5);
		expect(ANNUAL_PRICE).toBe(36);
	});

	it('rounds to a whole number', () => {
		expect(annualDiscountPercent(5, 40)).toBe(33);
	});

	it('is 0 when annual costs the same as twelve months', () => {
		expect(annualDiscountPercent(5, 60)).toBe(0);
	});
});

describe('buildContributePaths — subscription', () => {
	const MONTHLY = 'https://buy.stripe.com/test_monthly';
	const ANNUAL = 'https://buy.stripe.com/test_annual';
	const subscribe = (env: Parameters<typeof buildContributePaths>[0]) =>
		buildContributePaths(env).find((p) => p.id === 'subscribe');

	it('offers only the guaranteed-access benefit as the description', () => {
		expect(subscribe({ VITE_SUPPORT_MONTHLY_URL: MONTHLY })?.description).toBe(
			'Guaranteed access to Perspectize through the term.',
		);
	});

	it('builds monthly and annual links, with a discount badge on annual only', () => {
		const links = subscribe({ VITE_SUPPORT_MONTHLY_URL: MONTHLY, VITE_SUPPORT_ANNUAL_URL: ANNUAL })?.links;
		expect(links).toEqual([
			{ id: 'monthly', label: '$5 / month', href: MONTHLY },
			{ id: 'annual', label: '$36 / year', href: ANNUAL, badge: 'Save 40%' },
		]);
	});

	it('shows monthly alone with no badge', () => {
		expect(subscribe({ VITE_SUPPORT_MONTHLY_URL: MONTHLY })?.links.map((l) => l.id)).toEqual(['monthly']);
	});

	it('shows annual alone without a badge, since there is no monthly price to compare against', () => {
		const links = subscribe({ VITE_SUPPORT_ANNUAL_URL: ANNUAL })?.links;
		expect(links).toHaveLength(1);
		expect(links?.[0].badge).toBeUndefined();
	});

	it('drops a non-https subscription URL', () => {
		const env = { VITE_SUPPORT_MONTHLY_URL: 'http://x.com', VITE_SUPPORT_ANNUAL_URL: 'javascript:alert(1)' };
		expect(subscribe(env)).toBeUndefined();
	});

	it('builds the subscribe path without the tip path, and vice versa', () => {
		expect(buildContributePaths({ VITE_SUPPORT_MONTHLY_URL: MONTHLY }).map((p) => p.id)).toEqual(['subscribe']);
		expect(buildContributePaths({ VITE_SUPPORT_URL: VALID }).map((p) => p.id)).toEqual(['support']);
		expect(
			buildContributePaths({ VITE_SUPPORT_URL: VALID, VITE_SUPPORT_MONTHLY_URL: MONTHLY }).map((p) => p.id),
		).toEqual(['support', 'subscribe']);
	});

	it('enables the tab when only a subscription link is configured', () => {
		const paths = buildContributePaths({ VITE_SUPPORT_ANNUAL_URL: ANNUAL });
		expect(isContributeTabEnabled({ VITE_FEATURE_CONTRIBUTE_TAB: 'true' }, paths)).toBe(true);
	});
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
