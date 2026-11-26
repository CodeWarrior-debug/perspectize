import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDABLE_CONTENT_TYPES, CONTENT_TYPES, descriptorFor } from '#lib/contentTypes/registry.js';
import { detectContentCandidates } from '#lib/utils/detectContentType.js';

// Reads the backend's ContentType enum. Vitest runs from frontend/, so the schema is one level up.
// Lives outside frontend/, so this file is excluded from the Stryker sandbox run (vitest.config.stryker.ts).
const SCHEMA_PATH = resolve(process.cwd(), '..', 'backend', 'schema.graphql');

function backendContentTypes(): string[] {
	const schema = readFileSync(SCHEMA_PATH, 'utf8');
	const block = /enum ContentType \{([^}]*)\}/.exec(schema);
	if (!block) throw new Error('enum ContentType not found in backend/schema.graphql');
	return block[1]
		.split('\n')
		.map((line) => line.replace(/#.*/, '').trim())
		.filter((line) => line.length > 0);
}

describe('content type registry: exhaustiveness', () => {
	it('has a descriptor for every backend ContentType, and no others', () => {
		expect([...CONTENT_TYPES].sort()).toEqual([...backendContentTypes()].sort());
	});

	it('gives every type its own non-empty label', () => {
		const labels = CONTENT_TYPES.map((type) => descriptorFor(type).label);
		expect(labels.every((label) => label.length > 0)).toBe(true);
		expect(new Set(labels).size).toBe(labels.length);
	});

	it('does not include Facebook video (ADR 0001 defers it, with no placeholder)', () => {
		expect(CONTENT_TYPES.some((type) => /FACEBOOK|REEL/.test(type))).toBe(false);
	});
});

describe('content type registry: lookup and fallback', () => {
	it('resolves a known type to its descriptor', () => {
		expect(descriptorFor('WEBSITE').label).toBe('Website');
		expect(descriptorFor('WEB_PAGE').label).toBe('Webpage');
		expect(descriptorFor('CLAIM').label).toBe('Claim');
	});

	it('treats an absent or empty type as a YouTube video, as the backend does', () => {
		expect(descriptorFor(undefined).type).toBe('YOUTUBE_VIDEO');
		expect(descriptorFor(null).type).toBe('YOUTUBE_VIDEO');
		expect(descriptorFor('').type).toBe('YOUTUBE_VIDEO');
	});

	it('gives an unknown, non-empty type a neutral fallback, never YouTube facts', () => {
		const unknown = descriptorFor('FACEBOOK_VIDEO');
		expect(unknown.label).toBe('Facebook_video');
		expect(unknown.isVideo).toBe(false);
		expect(unknown.refreshable).toBe(false);
		expect(unknown.addFlow).toBeNull();
		expect(unknown.icon.kind).toBe('outline');
	});

	it('matches the type string case-insensitively', () => {
		expect(descriptorFor('movie').type).toBe('MOVIE');
	});

	it('does not resolve prototype keys to a descriptor', () => {
		expect(descriptorFor('constructor').type).toBe('constructor');
		expect(descriptorFor('constructor').label).toBe('Constructor');
	});
});

describe('content type registry: refreshability', () => {
	// Mirrors ContentService.UpdateSourceData on the backend: YouTube (and empty), book and movie
	// rows are refreshed; claim, passage, webpage and website are rejected with "cannot be refreshed".
	it('marks exactly the types the backend refreshes', () => {
		const refreshable = CONTENT_TYPES.filter((type) => descriptorFor(type).refreshable).sort();
		expect(refreshable).toEqual(['BOOK', 'MOVIE', 'YOUTUBE_VIDEO']);
	});
});

describe('content type registry: add form', () => {
	it('lists the addable types in the add form order', () => {
		expect([...ADDABLE_CONTENT_TYPES]).toEqual(['YOUTUBE_VIDEO', 'BIBLE_PASSAGE', 'MOVIE', 'BOOK', 'WEB_PAGE']);
	});

	it('never offers CLAIM or WEBSITE from the add form', () => {
		expect(ADDABLE_CONTENT_TYPES).not.toContain('CLAIM');
		expect(ADDABLE_CONTENT_TYPES).not.toContain('WEBSITE');
	});

	// One sample input per addable type; each must be detected as that type.
	const samples: Array<[string, string]> = [
		['YOUTUBE_VIDEO', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
		['BIBLE_PASSAGE', 'John 3:16'],
		['MOVIE', 'https://www.themoviedb.org/movie/603-the-matrix'],
		['BOOK', 'https://openlibrary.org/works/OL23166W'],
		['WEB_PAGE', 'https://example.com/a-blog-post'],
	];

	it.each(samples)('detects %s from a sample input', (type, input) => {
		expect(detectContentCandidates(input)[0]?.type).toBe(type);
	});

	it('detects no type for a TMDB-hosted URL it does not recognise, and never a webpage for it', () => {
		expect(detectContentCandidates('https://www.themoviedb.org/tv/1399')).toEqual([]);
	});
});
