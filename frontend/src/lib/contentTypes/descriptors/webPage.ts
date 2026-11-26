import type { ContentTypeDescriptor } from '../descriptor';

/** A single web page (a globe glyph). A page is not a video, so no brand colour. Its metadata is read once, not refreshed. */
export const webPage: ContentTypeDescriptor = {
	type: 'WEB_PAGE',
	label: 'Webpage',
	addLabel: 'Webpage',
	icon: {
		kind: 'outline',
		d: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20M2 12h20M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20',
	},
	refreshable: false,
	addFlow: 'useCreateWebPage',
	isVideo: false,
};
