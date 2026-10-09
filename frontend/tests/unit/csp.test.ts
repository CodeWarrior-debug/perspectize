import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function directive(name: string): string[] {
	const html = readFileSync(resolve(__dirname, '../../src/app.html'), 'utf8');
	const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? '';
	const match = csp
		.split(';')
		.map((d) => d.trim())
		.find((d) => d.startsWith(`${name} `));
	return match ? match.split(/\s+/).slice(1) : [];
}

describe('app.html Content-Security-Policy', () => {
	it('allows any https image so image-by-URL in the perspective editor can load', () => {
		expect(directive('img-src')).toContain('https:');
	});

	it('does not allow plain http images (mixed content / tracking downgrade)', () => {
		expect(directive('img-src')).not.toContain('http:');
	});

	it('allows YouTube embeds so the Discover page inline player can load', () => {
		expect(directive('frame-src')).toContain('https://www.youtube.com');
		expect(directive('frame-src')).toContain('https://www.youtube-nocookie.com');
	});

	it('does not let the browser call the YouTube Data API (trending is served by the backend)', () => {
		// Compare parsed hostnames, not substrings: keywords like 'self' aren't URLs,
		// and a wildcard source (https://*.googleapis.com) must count too.
		const hosts = directive('connect-src').flatMap((src) => {
			try {
				return [new URL(src.replace('*.', 'wildcard.')).hostname];
			} catch {
				return [];
			}
		});
		expect(hosts.some((h) => h === 'googleapis.com' || h.endsWith('.googleapis.com'))).toBe(false);
	});
});
