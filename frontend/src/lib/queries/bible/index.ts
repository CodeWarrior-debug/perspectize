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
