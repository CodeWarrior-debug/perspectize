import { gql } from 'graphql-request';

// Public query — no auth required, but callers still go through the
// authenticated graphqlRequest() wrapper per repo convention.
export const PASSAGE_TEXT_QUERY = gql`
	query PassageText($startVerseId: Int!, $endVerseId: Int!) {
		passageText(startVerseId: $startVerseId, endVerseId: $endVerseId) {
			translation
			copyright
			verses {
				verseId
				chapter
				verse
				text
			}
		}
	}
`;

export interface VerseText {
	verseId: number;
	chapter: number;
	verse: number;
	text: string;
}

export interface PassageTextResponse {
	passageText: {
		translation: string;
		copyright: string;
		verses: VerseText[];
	};
}

// First-write-wins: if someone else titled the passage first, the server
// returns the existing title (not an error), so callers must read the
// returned displayTitle rather than assuming their input was stored.
export const SET_PASSAGE_DISPLAY_TITLE = gql`
	mutation SetPassageDisplayTitle($input: SetPassageDisplayTitleInput!) {
		setPassageDisplayTitle(input: $input) {
			id
			displayTitle
		}
	}
`;

export interface SetPassageDisplayTitleInput {
	contentID: string;
	title: string;
}

export interface SetPassageDisplayTitleResponse {
	setPassageDisplayTitle: { id: string; displayTitle: string | null };
}

// Idempotent: the server find-or-creates the passage row, so an existing
// passage comes back as a normal Content (no "alreadyExisted" flag).
export const CREATE_CONTENT_FROM_PASSAGE = gql`
	mutation CreateContentFromPassage($input: CreateContentFromPassageInput!) {
		createContentFromPassage(input: $input) {
			id
			name
			contentType
			displayTitle
		}
	}
`;

export interface CreateContentFromPassageResponse {
	createContentFromPassage: {
		id: string;
		name: string;
		contentType: string;
		displayTitle: string | null;
	};
}

// Public query; lazy — only sent after the reader presses "Show original language".
// Verses without alignment data are absent from the response (callers show plain text for them).
export const PASSAGE_INTERLINEAR_QUERY = gql`
	query PassageInterlinear($startVerseId: Int!, $endVerseId: Int!) {
		passageInterlinear(startVerseId: $startVerseId, endVerseId: $endVerseId) {
			verses {
				verseId
				chapter
				verse
				segments {
					text
					spaceBefore
				}
				words {
					id
					language
					source
					translit
					parsing
					strongs
					gloss
					tagSource
					sourceOrder
					segment
				}
			}
		}
	}
`;

export interface InterlinearSegment {
	text: string;
	spaceBefore: boolean;
}

export interface InterlinearWord {
	/** index within its verse's `words` (which are in original-language order) */
	id: number;
	language: 'heb' | 'grc';
	source: string;
	translit: string;
	parsing: string;
	/** disambiguated tag, e.g. "H1254B" (display with formatStrongs) */
	strongs: string;
	gloss: string;
	tagSource: 'tagged' | 'fallback';
	sourceOrder: number;
	/** index into the verse's `segments` of the English phrase, or null when the word belongs to no phrase */
	segment: number | null;
}

export interface InterlinearVerse {
	verseId: number;
	chapter: number;
	verse: number;
	segments: InterlinearSegment[];
	words: InterlinearWord[];
}

export interface PassageInterlinearResponse {
	passageInterlinear: { verses: InterlinearVerse[] };
}
