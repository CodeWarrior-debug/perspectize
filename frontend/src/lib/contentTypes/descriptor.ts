import type { ContentType } from '#lib/queries/content/index.js';

/**
 * How a type's glyph is painted. The AG Grid renderers build raw DOM, so an icon is data (markup or
 * a path), not a Svelte component.
 */
export type TypeIcon =
	/** Ready-made SVG markup, painted in the theme's primary colour (Bible passage). */
	| { kind: 'markup'; svg: string }
	/** A single Lucide-style path, outlined in the muted foreground colour. */
	| { kind: 'outline'; d: string }
	/** A single path filled with a fixed brand colour (YouTube red). */
	| { kind: 'brand'; d: string; fill: string };

/**
 * The add-form hook a type is saved through. The add form still picks the flow by type; this names the
 * hook so a later switch to a generic create mutation is a change to one descriptor.
 */
export type AddFlowHook = 'useAddVideo' | 'useAddPassage' | 'useAddMovie' | 'useAddBook' | 'useCreateWebPage';

/**
 * One content type's facts, the single place a surface learns them from. Core fields only, and no
 * Svelte components: the registry can then be imported by formatting helpers without an import cycle.
 * (The one import, of the ContentType union, is type-only and erased at build time.)
 */
export interface ContentTypeDescriptor {
	/** The backend ContentType value. */
	readonly type: ContentType;
	/** Name in the grid Type column, the details modal and the type tooltip. */
	readonly label: string;
	/** Name in the add form's type chip and type picker. Null when the type cannot be added from there. */
	readonly addLabel: string | null;
	readonly icon: TypeIcon;
	/**
	 * Whether "Update source data" is offered. Mirrors ContentService.UpdateSourceData on the backend,
	 * which accepts only YouTube, movie and book rows; every other type is rejected there.
	 */
	readonly refreshable: boolean;
	/** The add-form save hook. Null for types that are not created from the add form. */
	readonly addFlow: AddFlowHook | null;
	/**
	 * Whether the type's own source is a video with a thumbnail, view and like counts, duration and
	 * a play action. Decides the YouTube-only tiles and thumbnail in the details modal.
	 */
	readonly isVideo: boolean;
}

/** Used for an unknown, non-empty type string (a backend type this build does not know yet). */
export interface FallbackDescriptor extends Omit<ContentTypeDescriptor, 'type'> {
	readonly type: string;
}
