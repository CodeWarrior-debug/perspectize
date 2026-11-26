import { BIBLE_PASSAGE_ICON_SVG } from '#lib/utils/icons.js';
import type { ContentTypeDescriptor } from '../descriptor';

/** A Bible passage: the open-book glyph, painted in the primary colour. Passages are not refreshed from a source. */
export const biblePassage: ContentTypeDescriptor = {
	type: 'BIBLE_PASSAGE',
	label: 'Bible Passage',
	addLabel: 'Bible passage',
	icon: { kind: 'markup', svg: BIBLE_PASSAGE_ICON_SVG },
	refreshable: false,
	addFlow: 'useAddPassage',
	isVideo: false,
};
