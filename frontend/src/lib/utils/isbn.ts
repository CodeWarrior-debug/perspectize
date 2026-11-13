/**
 * ISBN-10 / ISBN-13 helpers for the Books ISBN tab. Checksum validation is load-bearing:
 * Open Library resolves some checksum-invalid numbers (9999999999999) to an unrelated real
 * record, so a bad ISBN must be rejected here and never reach the API.
 */

export type IsbnCheck = 'empty' | 'incomplete' | 'invalid' | 'valid';

/** Strips spaces and hyphens, and uppercases a trailing `x` (an ISBN-10 check digit). */
export function normalizeIsbn(raw: string): string {
	return raw.replace(/[\s-]/g, '').replace(/x$/, 'X');
}

function isIsbn10(s: string): boolean {
	if (!/^\d{9}[\dX]$/.test(s)) return false;
	let sum = 0;
	for (let i = 0; i < 10; i++) {
		const digit = s[i] === 'X' ? 10 : Number(s[i]);
		sum += digit * (10 - i);
	}
	return sum % 11 === 0;
}

function isIsbn13(s: string): boolean {
	if (!/^\d{13}$/.test(s)) return false;
	let sum = 0;
	for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
	return sum % 10 === 0;
}

/** True when the input normalises to a valid ISBN-10 or ISBN-13 (with a matching checksum). */
export function isValidIsbn(raw: string): boolean {
	const s = normalizeIsbn(raw);
	return isIsbn10(s) || isIsbn13(s);
}

/**
 * Where the user is in typing an ISBN. `empty`: nothing typed. `incomplete`: fewer than 10
 * characters, or 11-12. `invalid`: a full-length number with a bad checksum, non-digits, or
 * too long. `valid`: a full-length number whose checksum matches.
 */
export function checkIsbn(raw: string): IsbnCheck {
	const s = normalizeIsbn(raw);
	if (s === '') return 'empty';
	if (s.length < 10 || (s.length > 10 && s.length < 13)) return 'incomplete';
	if (s.length === 10 || s.length === 13) return isValidIsbn(s) ? 'valid' : 'invalid';
	return 'invalid';
}
