import type { ContentTypeDescriptor } from '../descriptor';

/** A claim: a speech-bubble glyph, not a brand colour. Claims have no source to refresh. */
export const claim: ContentTypeDescriptor = {
	type: 'CLAIM',
	label: 'Claim',
	addLabel: null,
	icon: {
		kind: 'outline',
		d: 'M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4.29 3.71A1 1 0 0 1 3 19V5a1 1 0 0 1 1-1zm2 4h12M6 10.5h8',
	},
	refreshable: false,
	addFlow: null,
	isVideo: false,
};
