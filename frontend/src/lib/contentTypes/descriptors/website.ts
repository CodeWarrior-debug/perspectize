import type { ContentTypeDescriptor } from '../descriptor';

/**
 * A website: the parent a set of saved pages is filed under. A folder glyph, distinct from the single
 * page's globe. It is not added from the add form (its pages are) and has no source to refresh.
 */
export const website: ContentTypeDescriptor = {
	type: 'WEBSITE',
	label: 'Website',
	addLabel: null,
	icon: {
		kind: 'outline',
		d: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z',
	},
	refreshable: false,
	addFlow: null,
	isVideo: false,
};
