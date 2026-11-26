import type { ContentTypeDescriptor } from '../descriptor';

/** A YouTube video: the play-button glyph in YouTube red (a fixed brand colour, not themeable). */
export const youtubeVideo: ContentTypeDescriptor = {
	type: 'YOUTUBE_VIDEO',
	label: 'YouTube Video',
	addLabel: 'YouTube',
	icon: {
		kind: 'brand',
		d: 'M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
		fill: '#FF0000', // hex-ok: fixed YouTube brand colour, not themeable
	},
	refreshable: true,
	addFlow: 'useAddVideo',
	isVideo: true,
};
