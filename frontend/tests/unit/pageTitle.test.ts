import { describe, it, expect } from 'vitest';
import { pageTitleFor } from '#lib/utils/pageTitle.js';

describe('pageTitleFor', () => {
	it.each([
		['/content-library', 'Library · Perspectize'],
		['/discover', 'Discover · Perspectize'],
		['/compare', 'Compare · Perspectize'],
		['/plan', 'Plan · Perspectize'],
		['/declare', 'Declare · Perspectize'],
		['/import', 'Import · Perspectize'],
		['/messages', 'Messages · Perspectize'],
	])('%s -> %s', (path, title) => {
		expect(pageTitleFor(path)).toBe(title);
	});

	it('a nested route takes its section title', () => {
		expect(pageTitleFor('/messages/42')).toBe('Messages · Perspectize');
		expect(pageTitleFor('/import/abc')).toBe('Import · Perspectize');
	});

	it('does not match a path that only shares a prefix', () => {
		expect(pageTitleFor('/planet')).toBe('Perspectize');
	});

	it('falls back to the product name for the root and unknown paths', () => {
		expect(pageTitleFor('/')).toBe('Perspectize');
		expect(pageTitleFor('/nope')).toBe('Perspectize');
	});
});
