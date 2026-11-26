import type { ContentType } from '#lib/queries/content/index.js';
import type { ContentTypeDescriptor, FallbackDescriptor, TypeIcon } from './descriptor';
import { biblePassage } from './descriptors/biblePassage';
import { book } from './descriptors/book';
import { claim } from './descriptors/claim';
import { movie } from './descriptors/movie';
import { webPage } from './descriptors/webPage';
import { website } from './descriptors/website';
import { youtubeVideo } from './descriptors/youtubeVideo';

export type { ContentTypeDescriptor, FallbackDescriptor, TypeIcon } from './descriptor';
export type { AddFlowHook } from './descriptor';

/**
 * One descriptor per backend ContentType. The Record forces a new union member to get a descriptor, and
 * the schema test (tests/unit/contentTypes/registry.test.ts) checks the keys against backend/schema.graphql.
 * Order is the order the grid's Type filter lists the types.
 */
const DESCRIPTORS: Record<ContentType, ContentTypeDescriptor> = {
	YOUTUBE_VIDEO: youtubeVideo,
	CLAIM: claim,
	BIBLE_PASSAGE: biblePassage,
	MOVIE: movie,
	BOOK: book,
	WEB_PAGE: webPage,
	WEBSITE: website,
};

/** Every known content type, in grid order. */
export const CONTENT_TYPES: readonly ContentType[] = Object.keys(DESCRIPTORS) as ContentType[];

/** The types the add form can save, in the order its type picker lists them. */
export const ADDABLE_CONTENT_TYPES: readonly ContentType[] = CONTENT_TYPES.filter(
	(type) => DESCRIPTORS[type].addLabel !== null,
);

/** A stand-in for a non-empty type string this build has no descriptor for. Neutral: no YouTube facts. */
const GENERIC_ICON: TypeIcon = {
	kind: 'outline',
	d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
};

function fallbackFor(raw: string): FallbackDescriptor {
	const label = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
	return {
		type: raw,
		label,
		addLabel: null,
		icon: GENERIC_ICON,
		refreshable: false,
		addFlow: null,
		isVideo: false,
	};
}

/**
 * The descriptor for a content row's type. An absent or empty type is a YouTube video, because the
 * backend reads an empty stored type the same way (ContentService.UpdateSourceData's `case "", YouTube`).
 * Any other unknown string gets the neutral fallback, never YouTube's facts.
 */
export function descriptorFor(raw: string | null | undefined): ContentTypeDescriptor | FallbackDescriptor {
	if (!raw) return youtubeVideo;
	const upper = raw.toUpperCase();
	return Object.hasOwn(DESCRIPTORS, upper) ? DESCRIPTORS[upper as ContentType] : fallbackFor(raw);
}
