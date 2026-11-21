import { describe, it, expect } from 'vitest';
import { getBaseUrl } from './baseUrl';

describe('getBaseUrl', () => {
	it('is null when nothing is stored, so the caller asks for an address', () => {
		expect(getBaseUrl(undefined)).toBeNull();
	});

	it('uses a stored http(s) origin', () => {
		expect(getBaseUrl('http://localhost:5173')).toBe('http://localhost:5173');
		expect(getBaseUrl('https://pr-1.preview.example')).toBe('https://pr-1.preview.example');
	});

	it('keeps only the origin of a stored url', () => {
		expect(getBaseUrl('https://pr-1.preview.example/some/path?x=1')).toBe('https://pr-1.preview.example');
	});

	it('is null for anything unsafe or malformed', () => {
		expect(getBaseUrl('javascript:alert(1)')).toBeNull();
		expect(getBaseUrl('garbage')).toBeNull();
		expect(getBaseUrl('')).toBeNull();
	});
});
