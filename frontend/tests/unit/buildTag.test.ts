import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeTag } from '$lib/utils/buildTag';

interface TagFixtureCase {
	name: string;
	committerDate: string;
	sha: string;
	expectedTag: string;
}

// Shared with backend/test/domain/buildinfo_test.go so the Go and TS tag
// computations are proven to agree on the same inputs. Resolved via plain
// Node path joins (not `new URL(relative, import.meta.url)`) because jsdom's
// global URL shadows Node's for relative-to-file-URL resolution here.
const testFilePath = fileURLToPath(import.meta.url);
const fixturePath = join(dirname(testFilePath), '..', '..', '..', 'testdata', 'version-tag-fixture.json');
const cases: TagFixtureCase[] = JSON.parse(readFileSync(fixturePath, 'utf-8'));

describe('computeTag()', () => {
	it('loads at least one fixture case', () => {
		expect(cases.length).toBeGreaterThan(0);
	});

	for (const c of cases) {
		it(c.name, () => {
			expect(computeTag(c.committerDate, c.sha)).toBe(c.expectedTag);
		});
	}
});
