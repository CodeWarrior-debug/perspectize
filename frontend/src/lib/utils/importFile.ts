/**
 * Reads a `perspectize-import.json` candidates file (format v2, written by the scraper) into the
 * `stageImportFromFile` input. Only the shape is checked here; the server enforces the limits (1 to
 * 5,000 rows, URL hosts, lengths) and its refusal is shown as-is.
 */

export const IMPORT_FILE_FORMAT = 'perspectize-import-candidates/v2';

export class ImportFileError extends Error {}

export interface StageImportItemInput {
	externalId: string;
	url: string;
	title: string;
	position: number;
	facts: Record<string, unknown>;
	details: Record<string, unknown> | null;
}

export interface StageImportFileInput {
	name: string;
	sourceTitle: string | null;
	websiteUrl: string | null;
	items: StageImportItemInput[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Throws ImportFileError with a sentence the admin can act on. `fallbackName` is the file's name without `.json`. */
export function parseImportFile(text: string, fallbackName: string): StageImportFileInput {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new ImportFileError("That file isn't valid JSON.");
	}
	if (!isObject(parsed) || parsed.format !== IMPORT_FILE_FORMAT) {
		throw new ImportFileError(`That isn't a Perspectize import file (expected format ${IMPORT_FILE_FORMAT}).`);
	}
	if (!Array.isArray(parsed.items)) throw new ImportFileError('The file has no items list.');

	const source = isObject(parsed.source) ? parsed.source : {};
	const sourceTitle = typeof source.title === 'string' && source.title ? source.title : null;
	const websiteUrl = typeof source.websiteUrl === 'string' && source.websiteUrl ? source.websiteUrl : null;

	const items = parsed.items.map((raw: unknown, i: number): StageImportItemInput => {
		const row = isObject(raw) ? raw : {};
		for (const key of ['externalId', 'url', 'title'] as const) {
			if (typeof row[key] !== 'string') throw new ImportFileError(`Row ${i + 1} is missing ${key}.`);
		}
		if (typeof row.position !== 'number') throw new ImportFileError(`Row ${i + 1} is missing position.`);
		if (!isObject(row.facts)) throw new ImportFileError(`Row ${i + 1} is missing facts.`);
		return {
			externalId: row.externalId as string,
			url: row.url as string,
			title: row.title as string,
			position: row.position,
			facts: row.facts,
			details: isObject(row.details) ? row.details : null,
		};
	});

	return { name: sourceTitle ?? fallbackName, sourceTitle, websiteUrl, items };
}
