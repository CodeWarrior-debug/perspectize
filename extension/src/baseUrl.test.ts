import { describe, it, expect } from 'vitest';
import { getBaseUrl, PRODUCTION_BASE } from './baseUrl';

describe('getBaseUrl', () => {
	it('uses production when nothing is stored', () => {
		expect(getBaseUrl(undefined)).toBe(PRODUCTION_BASE);
	});

	it('uses a stored http(s) origin', () => {
		expect(getBaseUrl('http://localhost:5173')).toBe('http://localhost:5173');
		expect(getBaseUrl('https://pr-1.preview.example')).toBe('https://pr-1.preview.example');
	});

	it('keeps only the origin of a stored url', () => {
		expect(getBaseUrl('https://pr-1.preview.example/some/path?x=1')).toBe('https://pr-1.preview.example');
	});

	it('falls back to production for anything unsafe or malformed', () => {
		expect(getBaseUrl('javascript:alert(1)')).toBe(PRODUCTION_BASE);
		expect(getBaseUrl('garbage')).toBe(PRODUCTION_BASE);
		expect(getBaseUrl('')).toBe(PRODUCTION_BASE);
	});
});
