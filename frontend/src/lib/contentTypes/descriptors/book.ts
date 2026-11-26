import type { ContentTypeDescriptor } from '../descriptor';

/**
 * A book, from an Open Library link. A closed-book glyph on purpose: the Bible passage icon is the open
 * book, and the two must read apart in the Type column. Refreshed from Open Library.
 */
export const book: ContentTypeDescriptor = {
	type: 'BOOK',
	label: 'Book',
	addLabel: 'Book',
	icon: {
		kind: 'outline',
		d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20',
	},
	refreshable: true,
	addFlow: 'useAddBook',
	isVideo: false,
};
