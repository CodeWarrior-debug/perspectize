import { describe, it, expect } from 'vitest';
import { PASSAGE_INTERLINEAR_QUERY } from '$lib/queries/bible';
import { queryKeys } from '$lib/queries/keys';

describe('passage interlinear query', () => {
	it('asks for every field the UI renders, using the GraphQL names from the backend contract', () => {
		for (const field of [
			'passageInterlinear',
			'startVerseId',
			'endVerseId',
			'verseId',
			'chapter',
			'segments',
			'spaceBefore',
			'words',
			'language',
			'source',
			'translit',
			'parsing',
			'strongs',
			'gloss',
			'tagSource',
			'sourceOrder',
			'segment',
		]) {
			expect(PASSAGE_INTERLINEAR_QUERY).toContain(field);
		}
	});

	it('cache key includes both verse ids so changing the range refetches', () => {
		expect(queryKeys.bible.passageInterlinear(1, 5)).toEqual([...queryKeys.bible.all(), 'interlinear', 1, 5]);
		expect(queryKeys.bible.passageInterlinear(1, 5)).not.toEqual(queryKeys.bible.passageInterlinear(1, 6));
		// distinct from the plain-text key for the same range
		expect(queryKeys.bible.passageInterlinear(1, 5)).not.toEqual(queryKeys.bible.passageText(1, 5));
	});
});
