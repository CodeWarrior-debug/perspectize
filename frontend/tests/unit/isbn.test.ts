import { describe, it, expect } from 'vitest';
import { normalizeIsbn, isValidIsbn, checkIsbn } from '$lib/utils/isbn';

describe('normalizeIsbn', () => {
	it('strips hyphens and spaces', () => {
		expect(normalizeIsbn('978-0-434-74002-4')).toBe('9780434740024');
		expect(normalizeIsbn(' 978 0434 740024 ')).toBe('9780434740024');
	});

	it('uppercases a trailing x check digit', () => {
		expect(normalizeIsbn('0-8044-2957-x')).toBe('080442957X');
	});
});

describe('isValidIsbn', () => {
	it('accepts a hyphenated ISBN-13 with a valid checksum (East of Eden, 1970 edition)', () => {
		expect(isValidIsbn('978-0-434-74002-4')).toBe(true);
	});

	it('accepts a hyphenated ISBN-10 with a valid checksum', () => {
		expect(isValidIsbn('0-306-40615-2')).toBe(true);
	});

	it('accepts an ISBN-10 whose check digit is X', () => {
		expect(isValidIsbn('0-8044-2957-X')).toBe(true);
	});

	it('rejects a checksum-invalid 13-digit string that Open Library would mis-key', () => {
		expect(isValidIsbn('9999999999999')).toBe(false);
	});

	it('rejects an off-by-one ISBN-13 checksum', () => {
		expect(isValidIsbn('9780434740025')).toBe(false);
	});

	it('rejects a wrong length', () => {
		expect(isValidIsbn('97804347400')).toBe(false);
	});
});

describe('checkIsbn', () => {
	it('is empty when nothing is typed', () => {
		expect(checkIsbn('')).toBe('empty');
		expect(checkIsbn('  - ')).toBe('empty');
	});

	it('is incomplete under 10 characters, and at 11 or 12', () => {
		expect(checkIsbn('97804')).toBe('incomplete');
		expect(checkIsbn('978-0-434-7400')).toBe('incomplete');
		expect(checkIsbn('978043474002')).toBe('incomplete');
	});

	it('is invalid for a full-length ISBN with a bad checksum', () => {
		expect(checkIsbn('9780434740025')).toBe('invalid');
	});

	it('is valid for a full-length ISBN with a good checksum', () => {
		expect(checkIsbn('9780434740024')).toBe('valid');
		expect(checkIsbn('978-0-434-74002-4')).toBe('valid');
	});

	it('is invalid for a 13-character string containing letters', () => {
		expect(checkIsbn('978043474002A')).toBe('invalid');
	});
});
