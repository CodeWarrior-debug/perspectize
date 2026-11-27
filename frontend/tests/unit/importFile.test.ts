import { describe, it, expect } from 'vitest';
import { parseImportFile, ImportFileError } from '#lib/utils/importFile.js';

const item = (over: Record<string, unknown> = {}) => ({
	externalId: 'post-1',
	url: 'https://jordans-journey.com/post-1',
	title: 'A post',
	position: 0,
	facts: { kind: 'PAGE', webPageRoles: ['BLOG_POST'] },
	details: { people: [] },
	...over,
});

const file = (over: Record<string, unknown> = {}) =>
	JSON.stringify({
		format: 'perspectize-import-candidates/v2',
		source: {
			sourceType: 'CANDIDATE_FILE',
			title: "Jordan's Journey",
			websiteUrl: 'https://jordans-journey.com',
			destinationType: 'WEB_PAGE',
			itemCount: 1,
		},
		items: [item()],
		...over,
	});

describe('parseImportFile', () => {
	it('builds the stage input from a valid v2 file, using the source title as the name', () => {
		const input = parseImportFile(file(), 'perspectize-import');
		expect(input.name).toBe("Jordan's Journey");
		expect(input.sourceTitle).toBe("Jordan's Journey");
		expect(input.websiteUrl).toBe('https://jordans-journey.com');
		expect(input.items).toEqual([
			{
				externalId: 'post-1',
				url: 'https://jordans-journey.com/post-1',
				title: 'A post',
				position: 0,
				facts: { kind: 'PAGE', webPageRoles: ['BLOG_POST'] },
				details: { people: [] },
			},
		]);
	});

	it('falls back to the file name when the source has no title, and sends no website when absent', () => {
		const text = file({ source: { sourceType: 'CANDIDATE_FILE', destinationType: 'WEB_PAGE' } });
		const input = parseImportFile(text, 'my-export');
		expect(input.name).toBe('my-export');
		expect(input.sourceTitle).toBeNull();
		expect(input.websiteUrl).toBeNull();
	});

	it('sends details as null when a row has none', () => {
		const text = file({ items: [item({ details: undefined })] });
		expect(parseImportFile(text, 'x').items[0].details).toBeNull();
	});

	it('refuses text that is not JSON', () => {
		expect(() => parseImportFile('{not json', 'x')).toThrow(ImportFileError);
		expect(() => parseImportFile('{not json', 'x')).toThrow(/isn't valid JSON/);
	});

	it('refuses a file with another format or none', () => {
		const other = file({ format: 'something-else/v1' });
		expect(() => parseImportFile(other, 'x')).toThrow(/isn't a Perspectize import file/);
		expect(() => parseImportFile('[]', 'x')).toThrow(/isn't a Perspectize import file/);
	});

	it('refuses a file with no items list', () => {
		expect(() => parseImportFile(file({ items: 'nope' }), 'x')).toThrow(/no items list/);
	});

	it('names the first row missing a required field', () => {
		const text = file({ items: [item(), item({ url: undefined })] });
		expect(() => parseImportFile(text, 'x')).toThrow(/Row 2 is missing url/);
	});

	it('refuses a row whose facts are not an object', () => {
		expect(() => parseImportFile(file({ items: [item({ facts: 'x' })] }), 'x')).toThrow(/Row 1 is missing facts/);
	});
});
