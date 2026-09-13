import { describe, it, expect } from 'vitest';
import { resolveAtReference, hasAtReference } from '$lib/utils/references';

describe('resolveAtReference', () => {
	it('replaces @this with the parent content name', () => {
		expect(resolveAtReference('@this ran 22.3 mph', 'Bo Jackson')).toBe('Bo Jackson ran 22.3 mph');
	});

	it('replaces @here with the parent content name', () => {
		expect(resolveAtReference('@here is the best', 'Bo Jackson')).toBe('Bo Jackson is the best');
	});

	it('is case insensitive and replaces multiple tokens', () => {
		expect(resolveAtReference('@This and @here', 'Bo')).toBe('Bo and Bo');
	});

	it('leaves text unchanged when no tokens are present', () => {
		expect(resolveAtReference('no refs here', 'Bo')).toBe('no refs here');
	});

	it('replaces all occurrences of @this in a longer string', () => {
		expect(resolveAtReference('@this and @this again', 'Content')).toBe('Content and Content again');
	});

	it('works with an empty parent content name', () => {
		expect(resolveAtReference('@this ran fast', '')).toBe(' ran fast');
	});

	it('handles text that is only the token', () => {
		expect(resolveAtReference('@this', 'Title')).toBe('Title');
	});
});

describe('hasAtReference', () => {
	it('returns true when text contains @this', () => {
		expect(hasAtReference('@this thing')).toBe(true);
	});

	it('returns false when text has no @this or @here tokens', () => {
		expect(hasAtReference('no refs')).toBe(false);
	});

	it('returns true for email-style @this (acceptable edge case)', () => {
		expect(hasAtReference('email@this.com')).toBe(true);
	});

	it('returns true when text contains @here', () => {
		expect(hasAtReference('@here is something')).toBe(true);
	});

	it('is case insensitive', () => {
		expect(hasAtReference('@HERE is something')).toBe(true);
		expect(hasAtReference('@THIS is something')).toBe(true);
	});

	it('returns false for empty string', () => {
		expect(hasAtReference('')).toBe(false);
	});
});
