import { describe, it, expect } from 'vitest';
import { nameInitials, identityColor } from '$lib/utils/compareIdentity';

describe('nameInitials', () => {
	it('takes the first letter of the first two words, upper-cased', () => {
		expect(nameInitials('Jamie Lee')).toBe('JL');
	});

	it('takes up to 2 characters for a single-word name', () => {
		expect(nameInitials('You')).toBe('Y');
	});

	it('caps at two characters for a longer name', () => {
		expect(nameInitials('Sam Rivera Cruz')).toBe('SR');
	});
});

describe('identityColor', () => {
	it("is primary-colored when the id matches the viewer's id", () => {
		expect(identityColor('1', '1')).toBe('var(--color-primary)');
	});

	it('is logo-purple for anyone other than the viewer', () => {
		expect(identityColor('2', '1')).toBe('var(--color-logo-purple)');
	});

	it('is logo-purple when there is no signed-in viewer', () => {
		expect(identityColor('1', null)).toBe('var(--color-logo-purple)');
	});
});
