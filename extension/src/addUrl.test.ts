import { describe, it, expect } from 'vitest';
import { buildAddUrl, isAddableUrl } from './addUrl';

describe('buildAddUrl', () => {
	it('encodes the page url and title into the /add query', () => {
		const out = new URL(buildAddUrl('https://app.example.com', 'https://a.com/p?x=1&y=2#frag é', 'Hello & é'));
		expect(out.origin + out.pathname).toBe('https://app.example.com/add');
		expect(out.searchParams.get('url')).toBe('https://a.com/p?x=1&y=2#frag é');
		expect(out.searchParams.get('title')).toBe('Hello & é');
		expect(out.hash).toBe('');
	});

	it('drops a trailing slash on the base', () => {
		expect(buildAddUrl('http://localhost:5173/', 'https://a.com')).toBe(
			'http://localhost:5173/add?url=https%3A%2F%2Fa.com',
		);
	});

	it('omits an empty title', () => {
		expect(buildAddUrl('https://x.com', 'https://a.com', '')).not.toContain('title');
		expect(buildAddUrl('https://x.com', 'https://a.com', undefined)).not.toContain('title');
	});
});

describe('isAddableUrl', () => {
	it.each([
		'chrome://extensions',
		'about:blank',
		'file:///a.html',
		'edge://settings',
		'chrome-extension://abc/options.html',
		'https://chromewebstore.google.com/detail/x',
		'https://chrome.google.com/webstore/detail/x',
		'not a url',
		'',
	])('rejects %s', (url) => {
		expect(isAddableUrl(url)).toBe(false);
	});

	it('rejects undefined', () => {
		expect(isAddableUrl(undefined)).toBe(false);
	});

	it.each(['https://www.youtube.com/watch?v=1', 'http://localhost:3000/'])('accepts %s', (url) => {
		expect(isAddableUrl(url)).toBe(true);
	});
});
