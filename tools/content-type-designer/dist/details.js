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
import { COLUMNS } from './catalog.js';
const PERSPECTIVES = {
    key: 'perspectives',
    label: 'Perspectives',
    tooltip: 'How many perspectives exist on this item',
    source: 'contentByID.perspectiveCount (lazy aggregate query, fetched on open)'
};
const AVG_RATING = {
    key: 'avgRating',
    label: 'Avg. Rating',
    tooltip: 'Average quality rating across perspectives — hover shows how many ratings it averages',
    source: 'contentByID.averageRating / qualityRatingCount'
};
const DATE_ADDED = { col: 'createdAt' };
const TMDB_ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';
const SOURCE_ACTIONS = ['Compare', 'Update source data'];
export const DETAILS = {
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
            'The seasons list is the way down the hierarchy: each row opens that season if it is in Perspectize, or adds it. Parents are force-added upward only — a show never adds its seasons.',
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
            'Breadcrumb opens the show’s own row — it always exists, because adding a season force-adds its show (parent_content_id).',
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
            'Prev / next walk the season in order and cross into the next season at a finale.',
            'Breadcrumb opens the season and show rows, which always exist: adding an episode force-adds both.'
        ]
    },
    food: {
        heading: 'Food & drink',
        media: 'thumb',
        subtitle: ['creator', 'genre', 'length'],
        link: 'url',
        tiles: [
            PERSPECTIVES,
            AVG_RATING,
            { col: 'calories' },
            { col: 'protein' },
            { col: 'carbs' },
            { col: 'fat' },
            { col: 'sugars' },
            { col: 'sodium' },
            { col: 'nutriScore' },
            { col: 'nova' },
            { key: 'detail:Data quality', label: 'Data quality', tooltip: 'USDA lab data, manufacturer label (USDA Branded) or crowdsourced (Open Food Facts, with its completeness)', source: "response->>'nutritionSource' + response->>'offCompleteness'" },
            { col: 'date' },
            DATE_ADDED
        ],
        sections: [
            { label: 'Allergens', col: 'allergens', kind: 'chips', tooltip: 'From the label and public databases; may be incomplete or out of date. Check the package if you have an allergy.' },
            { label: 'Per 100 g/ml', key: 'detail:Per 100 g/ml', kind: 'text', source: "response->'per100'" },
            { label: 'Ingredients', key: 'detail:Ingredients', kind: 'text', source: "response->>'ingredientsText'" },
            { label: 'Full nutrient panel', key: 'detail:Full nutrient panel', kind: 'text', tooltip: 'Vitamins, minerals and fatty acids — fetched by the details query only (foodNutrientPanel), never with list rows.', source: "response->'panel'" },
            { label: 'Categories', col: 'tags', kind: 'chips' }
        ],
        actions: ['Compare', 'Refresh from source'],
        attribution: 'Nutrition data: USDA FoodData Central (public domain) and/or Open Food Facts (ODbL); images: Open Food Facts contributors, CC BY-SA. Credits shown only for the sources this item used.',
        notes: [
            'Thumb is the Open Food Facts packshot, contained not cropped; generic USDA foods have the glyph.',
            'Subtitle packs brand · Food/Drink · serving so the tiles can be all nutrition.',
            'Tiles follow the grid basis toggle (per serving / per 100 g/ml) and show the other basis underneath.',
            'Allergen section carries the not-medical-advice line; the grid filter says "Hide items listing…", never "Safe for…".',
            'Full panel loads lazily on open (QUERY_BUDGET.md): 60–150 nutrients for USDA Foundation foods.'
        ]
    }
};
/** Layout for a type, falling back to one built from its default-visible bindings. */
export function detailsFor(typeId, heading, binds) {
    const known = DETAILS[typeId];
    if (known)
        return known;
    const tiles = [PERSPECTIVES, AVG_RATING];
    for (const col of COLUMNS) {
        if (col.pinned || col.id === 'description' || col.id === 'tags' || col.id === 'updatedAt' || col.id === 'id')
            continue;
        if (binds(col))
            tiles.push({ col: col.id });
    }
    const sections = [];
    const description = COLUMNS.find((c) => c.id === 'description');
    if (description && binds(description))
        sections.push({ label: 'Description', col: 'description', kind: 'text' });
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
//# sourceMappingURL=details.js.map