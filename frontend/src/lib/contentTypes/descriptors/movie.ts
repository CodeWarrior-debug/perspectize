import type { ContentTypeDescriptor } from '../descriptor';

/** A movie, from a TMDB or IMDb link. Refreshed from TMDB. */
export const movie: ContentTypeDescriptor = {
	type: 'MOVIE',
	label: 'Movie',
	addLabel: 'Movie',
	icon: {
		kind: 'outline',
		d: 'M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5',
	},
	refreshable: true,
	addFlow: 'useAddMovie',
	isVideo: false,
};
