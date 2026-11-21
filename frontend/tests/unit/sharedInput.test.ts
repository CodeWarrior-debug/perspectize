import { describe, it, expect } from 'vitest';
import { pickAddInput } from '#lib/utils/sharedInput.js';

describe('pickAddInput', () => {
	it('uses url when present', () => {
		expect(pickAddInput({ url: 'https://a.com/x', text: 'ignored' })).toBe('https://a.com/x');
	});

	it('trims url and falls back to text when url is blank', () => {
		expect(pickAddInput({ url: '  ', text: 'https://b.com' })).toBe('https://b.com');
		expect(pickAddInput({ url: ' https://a.com ', text: null })).toBe('https://a.com');
	});

	it('extracts the first http(s) link from text', () => {
		expect(pickAddInput({ text: 'Check this https://c.com/p?x=1&y=2 now https://other.com' })).toBe(
			'https://c.com/p?x=1&y=2',
		);
	});

	it('drops trailing punctuation from an extracted link', () => {
		expect(pickAddInput({ text: 'see https://d.com/a.' })).toBe('https://d.com/a');
		expect(pickAddInput({ text: '(https://d.com/a)' })).toBe('https://d.com/a');
		expect(pickAddInput({ text: 'https://d.com/a, then' })).toBe('https://d.com/a');
	});

	it('uses plain text when it has no link', () => {
		expect(pickAddInput({ text: ' John 3:16 ' })).toBe('John 3:16');
	});

	it('returns empty when nothing usable', () => {
		expect(pickAddInput({})).toBe('');
		expect(pickAddInput({ url: null, text: '   ' })).toBe('');
	});
});
