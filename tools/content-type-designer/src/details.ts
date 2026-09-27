/**
 * Content details view layouts — what ActivityDetailsModal shows per type.
 *
 * YouTube and Bible passage mirror the modal as it ships today; the TMDB
 * family is the proposal. Any other type gets a generic layout built from its
 * default-visible bindings, so every type can be opened in the preview.
 *
 * A tile or section names either a column (`col`, whose per-type label,
 * tooltip and value path are reused) or a detail-only key on the sample row
 * (`key`, with its own label, tooltip and source).
 */
import { COLUMNS, type ColumnDef, type TypeId } from './catalog.js';

export interface DetailTile {
  col?: string;
  key?: string;
  label?: string;
  tooltip?: string;
  /** Where the value comes from, shown when field sources are switched on. */
  source?: string;
}

export interface DetailSection {
  label: string;
  col?: string;
  key?: string;
  /** text = paragraph · chips = list values · people = "Name — role" rows · list = one row per entry. */
  kind: 'text' | 'chips' | 'people' | 'list';
  tooltip?: string;
  source?: string;
  /** Hide the text behind a blur until hovered (episode overviews spoil plots). */
  spoiler?: boolean;
}

export interface DetailsLayout {
  /** The uppercase label in the header band. */
  heading: string;
  media: 'poster' | 'still' | 'thumb' | 'icon' | 'none';
  /** Keys joined with " › " above the title (show › season). */
  breadcrumb?: string[];
  /** Detail key rendered in italics under the title. */
  tagline?: string;
  /** Keys joined with " · " under the title; a suffix labels a bare number ("16" → "16 episodes"). */
  subtitle: (string | { key: string; suffix: string })[];
  /** Detail key holding the external link shown under the header. */
  link?: string;
  /** Extra outbound links: label + detail key; the value is the id or url. */
  links?: { label: string; key: string; prefix?: string }[];
  tiles: DetailTile[];
  sections: DetailSection[];
  /** Detail keys for previous / next navigation. */
  prevNext?: [string, string];
  actions: string[];
  attribution?: string;
  /** Planner-only notes: why the layout is the way it is. */
  notes?: string[];
}

const PERSPECTIVES: DetailTile = {
  key: 'perspectives',
  label: 'Perspectives',
  tooltip: 'How many perspectives exist on this item',
  source: 'contentByID.perspectiveCount (lazy aggregate query, fetched on open)'
};
const AVG_RATING: DetailTile = {
  key: 'avgRating',
  label: 'Avg. Rating',
  tooltip: 'Average quality rating across perspectives — hover shows how many ratings it averages',
  source: 'contentByID.averageRating / qualityRatingCount'
};
const DATE_ADDED: DetailTile = { col: 'createdAt' };
const TMDB_ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';
const SOURCE_ACTIONS = ['Compare', 'Update source data'];

export const DETAILS: Partial<Record<TypeId, DetailsLayout>> = {
  youtube: {
    heading: 'YouTube Video',
    media: 'thumb',
    subtitle: ['creator'],
    link: 'url',
    tiles: [
      PERSPECTIVES,
      AVG_RATING,
      { col: 'audience' },
      { key: 'likes', label: 'Likes', source: "response->>'likeCount'" },
      { col: 'length' },
      { col: 'date', label: 'Date' },
      { col: 'category' },
      DATE_ADDED
    ],
    sections: [
      { label: 'Description', col: 'description', kind: 'text' },
      { label: 'Tags', col: 'tags', kind: 'chips' }
    ],
    actions: SOURCE_ACTIONS,
    notes: ['Mirrors ActivityDetailsModal as it ships today.']
  },
  bible: {
    heading: 'Bible Passage',
    media: 'none',
    subtitle: [],
    tiles: [PERSPECTIVES, AVG_RATING],
    sections: [{ label: 'Text (BSB)', col: 'description', kind: 'text' }],
    actions: ['Compare'],
    notes: [
      'Mirrors ActivityDetailsModal today: PassageText, PassagePositionBar and PassageLinks sit under the title, plus the set-once title form.',
      'No source-data refresh — nothing is fetched.'
    ]
  },
  movie: {
    heading: 'Movie',
    media: 'poster',
    tagline: 'tagline',
    subtitle: ['year', 'certification', 'length'],
    link: 'tmdbUrl',
    links: [{ label: 'IMDb', key: 'imdb', prefix: 'https://www.imdb.com/title/' }],
    tiles: [
      PERSPECTIVES,
      AVG_RATING,
      { col: 'approval', label: 'TMDB Score' },
      { col: 'length' },
      { col: 'date' },
      { col: 'certification' },
      { col: 'creator' },
      { col: 'genre' },
      { key: 'budget', label: 'Budget', tooltip: 'TMDB budget in USD. 0 on TMDB means unknown and renders "—".', source: "response->>'budget'" },
      { key: 'revenue', label: 'Box office', tooltip: 'Worldwide revenue in USD from TMDB. 0 means unknown.', source: "response->>'revenue'" },
      { col: 'series' },
      DATE_ADDED
    ],
    sections: [
      { label: 'Synopsis', col: 'description', kind: 'text' },
      { label: 'Top cast', key: 'cast', kind: 'people', tooltip: 'First five billed from credits.cast (order ascending)', source: 'credits.cast[0..4]' },
      { label: 'Writers', key: 'writers', kind: 'chips', source: "credits.crew[department='Writing']" },
      { label: 'Keywords', col: 'tags', kind: 'chips' }
    ],
    actions: SOURCE_ACTIONS,
    attribution: TMDB_ATTRIBUTION,
    notes: [
      'Poster (2:3) replaces the 16:9 thumbnail — the hero row grows to 72×108.',
      'Subtitle packs year · certification · runtime so the tiles can carry the rest.',
      'Budget / box office are $0 on TMDB when unknown — render "—", never "$0".',
      'TMDB attribution (logo + notice) is a condition of the API terms; it belongs in the modal footer and the About page.'
    ]
  },
  tvShow: {
    heading: 'TV Show',
    media: 'poster',
    subtitle: ['years', 'certification', 'venue'],
    link: 'tmdbUrl',
    links: [{ label: 'IMDb', key: 'imdb', prefix: 'https://www.imdb.com/title/' }],
    tiles: [
      PERSPECTIVES,
      AVG_RATING,
      { col: 'approval', label: 'TMDB Score' },
      { col: 'releaseStatus' },
      { col: 'episodes' },
      { col: 'date' },
      { key: 'lastAired', label: 'Last aired', tooltip: 'last_episode_to_air — date and episode', source: "response->'last_episode_to_air'" },
      { key: 'nextEpisode', label: 'Next episode', tooltip: 'next_episode_to_air, when TMDB has one', source: "response->'next_episode_to_air'" },
      { col: 'creator' },
      { col: 'venue' },
      { col: 'genre' },
      DATE_ADDED
    ],
    sections: [
      { label: 'Overview', col: 'description', kind: 'text' },
      {
        label: 'Seasons',
        key: 'seasonList',
        kind: 'list',
        tooltip: 'Every season from the show record. ✓ = already in Perspectize (click opens its details); others offer "Add season".',
        source: "response->'seasons'[]"
      },
      { label: 'Top cast', key: 'cast', kind: 'people', source: 'aggregate_credits.cast[0..4]' },
      { label: 'Keywords', col: 'tags', kind: 'chips' }
    ],
    actions: SOURCE_ACTIONS,
    attribution: TMDB_ATTRIBUTION,
    notes: [
      'The seasons list is the way down the hierarchy: each row opens that season if it is in Perspectize, or adds it.',
      'Status and next episode go stale — the "Update source data" cooldown matters more here than for films.'
    ]
  },
  tvSeason: {
    heading: 'TV Season',
    media: 'poster',
    breadcrumb: ['series'],
    subtitle: ['position', { key: 'episodes', suffix: 'episodes' }, 'venue'],
    link: 'tmdbUrl',
    tiles: [
      PERSPECTIVES,
      AVG_RATING,
      { col: 'episodes' },
      { col: 'length', label: 'Total runtime' },
      { col: 'date' },
      { key: 'finale', label: 'Finale', tooltip: 'Air date of the last episode in the season', source: "response->'episodes'[-1]->>'air_date'" },
      { col: 'approval', label: 'TMDB Score' },
      DATE_ADDED
    ],
    sections: [
      { label: 'Overview', col: 'description', kind: 'text' },
      {
        label: 'Episodes',
        key: 'episodeList',
        kind: 'list',
        tooltip: 'From the season record — no extra call. ✓ = in Perspectize; others offer "Add episode".',
        source: "response->'episodes'[]"
      }
    ],
    actions: SOURCE_ACTIONS,
    attribution: TMDB_ATTRIBUTION,
    notes: [
      'Breadcrumb links up to the show (its Perspectize row if present, otherwise TMDB).',
      'Network / genre / certification are inherited from the show and not repeated as tiles.'
    ]
  },
  tvEpisode: {
    heading: 'TV Episode',
    media: 'still',
    breadcrumb: ['series', 'seasonName'],
    subtitle: ['position', 'date', 'length'],
    link: 'tmdbUrl',
    links: [{ label: 'IMDb', key: 'imdb', prefix: 'https://www.imdb.com/title/' }],
    tiles: [
      PERSPECTIVES,
      AVG_RATING,
      { col: 'approval', label: 'TMDB Score' },
      { col: 'length' },
      { col: 'date' },
      { col: 'creator' },
      { key: 'writers', label: 'Written by', source: "credits.crew[department='Writing']" },
      { col: 'releaseStatus' },
      DATE_ADDED
    ],
    sections: [
      { label: 'Overview', col: 'description', kind: 'text', spoiler: true },
      { label: 'Guest stars', key: 'guestStars', kind: 'people', source: 'credits.guest_stars[0..4]' }
    ],
    prevNext: ['prev', 'next'],
    actions: SOURCE_ACTIONS,
    attribution: TMDB_ATTRIBUTION,
    notes: [
      'Still (16:9), not a poster — episodes look like YouTube rows, which is correct: they are single viewings.',
      'Overview is blurred until hovered: episode synopses spoil plots.',
      'Prev / next walk the season in order and cross into the next season at a finale.'
    ]
  }
};

/** Layout for a type, falling back to one built from its default-visible bindings. */
export function detailsFor(typeId: string, heading: string, binds: (col: ColumnDef) => boolean): DetailsLayout {
  const known = DETAILS[typeId as TypeId];
  if (known) return known;
  const tiles: DetailTile[] = [PERSPECTIVES, AVG_RATING];
  for (const col of COLUMNS) {
    if (col.pinned || col.id === 'description' || col.id === 'tags' || col.id === 'updatedAt' || col.id === 'id') continue;
    if (binds(col)) tiles.push({ col: col.id });
  }
  const sections: DetailSection[] = [];
  const description = COLUMNS.find((c) => c.id === 'description');
  if (description && binds(description)) sections.push({ label: 'Description', col: 'description', kind: 'text' });
  return {
    heading,
    media: 'none',
    subtitle: ['creator'],
    tiles,
    sections,
    actions: ['Compare'],
    notes: ['No layout designed for this type yet — generated from its default-visible columns.']
  };
}
