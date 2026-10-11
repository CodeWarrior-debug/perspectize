import { describe, it, expect } from 'vitest';
import { linkify, isInternalHref, internalPath, isModifiedClick } from '$lib/components/messaging/linkify';

const links = (s: string) => linkify(s).flatMap((x) => (x.type === 'link' ? [x.href] : []));
const rejoin = (s: string) =>
	linkify(s)
		.map((x) => x.text)
		.join('');

describe('linkify', () => {
	it.each([
		['plain text, no URL', 'hello world', []],
		['empty string', '', []],
		['single https URL', 'see https://example.com/a', ['https://example.com/a']],
		['single http URL', 'http://example.com', ['http://example.com']],
		['trailing period', 'go to https://example.com.', ['https://example.com']],
		['trailing comma', 'https://example.com, then', ['https://example.com']],
		['trailing ?!', 'is it https://example.com/x?!', ['https://example.com/x']],
		['trailing colon/semicolon', 'https://example.com/x;: ok', ['https://example.com/x']],
		['balanced parens kept', 'https://en.wikipedia.org/wiki/Foo_(bar)', ['https://en.wikipedia.org/wiki/Foo_(bar)']],
		['wrapping parens trimmed', '(see https://example.com/a)', ['https://example.com/a']],
		['wrapping parens + period', '(see https://example.com/a).', ['https://example.com/a']],
		['query string', 'https://example.com/s?q=a&b=1', ['https://example.com/s?q=a&b=1']],
		['fragment', 'https://example.com/p#section-2', ['https://example.com/p#section-2']],
		['query + fragment + trailing dot', 'https://example.com/p?x=1#y.', ['https://example.com/p?x=1#y']],
		['multiple URLs', 'a https://one.com b https://two.com/x.', ['https://one.com', 'https://two.com/x']],
		['javascript: is not linked', 'javascript:alert(1)', []],
		['data: is not linked', 'data:text/html,<script>alert(1)</script>', []],
		['ftp is not linked', 'ftp://example.com/file', []],
		['bare scheme is not a URL', 'https://', []],
	])('%s', (_name, input, expected) => {
		expect(links(input as string)).toEqual(expected);
		expect(rejoin(input as string)).toBe(input);
	});

	it('preserves newlines and spacing in text segments', () => {
		const input = 'line1\n\n  https://example.com/a\nline3  ';
		expect(linkify(input)).toEqual([
			{ type: 'text', text: 'line1\n\n  ' },
			{ type: 'link', text: 'https://example.com/a', href: 'https://example.com/a' },
			{ type: 'text', text: '\nline3  ' },
		]);
	});

	it('leaves the trailing punctuation as text', () => {
		expect(linkify('x https://example.com.')).toEqual([
			{ type: 'text', text: 'x ' },
			{ type: 'link', text: 'https://example.com', href: 'https://example.com' },
			{ type: 'text', text: '.' },
		]);
	});

	it('does not link a javascript: URL embedded after an http one', () => {
		expect(links('https://a.com javascript:alert(1)')).toEqual(['https://a.com']);
	});
});

describe('isInternalHref', () => {
	const origin = 'https://app.example.com';
	it('same origin is internal', () => {
		expect(isInternalHref('https://app.example.com/content/1?x=2#y', origin)).toBe(true);
	});
	it('different host is external', () => {
		expect(isInternalHref('https://other.com/', origin)).toBe(false);
	});
	it('different scheme is external', () => {
		expect(isInternalHref('http://app.example.com/', origin)).toBe(false);
	});
	it('different port is external', () => {
		expect(isInternalHref('https://app.example.com:8443/', origin)).toBe(false);
	});
	it('lookalike subdomain is external', () => {
		expect(isInternalHref('https://app.example.com.evil.com/', origin)).toBe(false);
	});
	it('garbage is external', () => {
		expect(isInternalHref('not a url', origin)).toBe(false);
	});
});

describe('internalPath', () => {
	it('keeps path, search and hash', () => {
		expect(internalPath('https://app.example.com/content/1?x=2#y')).toBe('/content/1?x=2#y');
	});
	it('root URL becomes /', () => {
		expect(internalPath('https://app.example.com')).toBe('/');
	});
});

describe('isModifiedClick', () => {
	const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
	it('plain left click is not modified', () => expect(isModifiedClick(plain)).toBe(false));
	it.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const)('%s is modified', (k) =>
		expect(isModifiedClick({ ...plain, [k]: true })).toBe(true),
	);
	it('middle button is modified', () => expect(isModifiedClick({ ...plain, button: 1 })).toBe(true));
});
