/**
 * Seed data for the content-type designer.
 *
 * The catalog is intentionally *not* YouTube-shaped. Every grid column is
 * defined generically ("creator", "length", "date") and then *bound* per
 * content type with its own label, unit, source and tooltip. That binding is
 * what lets a single-type view read as purpose-built ("Channel", "Director",
 * "Author") while a multi-type view collapses to one honest generic header
 * instead of a row of half-empty type-specific columns.
 */

export type TypeId =
  | 'youtube'
  | 'movie'
  | 'book'
  | 'article'
  | 'podcast'
  | 'music'
  | 'claim'
  | 'joke'
  | 'purchase'
  | 'perspective'
  | 'place'
  | 'paper'
  | 'bible'
  | 'tvShow'
  | 'tvSeason'
  | 'tvEpisode'
  | 'painting';

export type Applicability = 'required' | 'typical' | 'optional';
export type Source = 'api' | 'scrape' | 'user' | 'derived' | 'internal';
export type ValueType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'money'
  | 'duration'
  | 'date'
  | 'url'
  | 'image'
  | 'enum'
  | 'tags'
  | 'rating'
  | 'percent'
  | 'ref'
  | 'person'
  | 'boolean';

export type Ingestion = 'api' | 'scrape' | 'manual' | 'url-only' | 'internal';
export type Storage = 'universal-column' | 'jsonb' | 'promoted-column' | 'derived';

export interface ContentTypeProfile {
  id: TypeId;
  label: string;
  plural: string;
  enumValue: string;
  /** One-line description of what a row of this type *is*. */
  gist: string;
  ingestion: Ingestion;
  /** Named enrichment source, or 'none' for manual-only types. */
  enrichment: string;
  urlRequired: boolean;
  urlPattern: string;
  /** Natural-key for duplicate detection when URL is absent or non-unique. */
  identity: string;
  icon: string;
  accent: string;
  /** Types where the same URL may legitimately exist under another type. */
  sharesUrlSpace: boolean;
  thumbnail: string;
  /**
   * How the Add Content card recognises a pasted link as this type. Checked
   * after the app's built-in rules (YouTube, Bible Gateway) and before the
   * "any other URL is never guessed" fallthrough in detectContentType.ts.
   */
  detect?: DetectRule;
  /** Fields shown only in the details modal — never grid columns. */
  detailOnly?: { label: string; path: string }[];
  /** Every type needs one; undefined means "not decided yet" and the spec flags it. */
  discover?: DiscoverDecision;
}

export type DiscoverPlacement = 'search-and-feed' | 'feed-only' | 'search-only' | 'not-on-discover';
export type FeedKind = 'trending' | 'daily' | 'curated' | 'recent' | 'none';

/** Whether and how a type appears on the Discover page (routes/discover/+page.svelte). */
export interface DiscoverDecision {
  placement: DiscoverPlacement;
  /** shipped = what the app does today; proposed = decided here, not built. */
  status: 'shipped' | 'proposed';
  /** Search endpoint and how results become cards; blank when there is no search. */
  search: string;
  /**
   * in-app: the app calls a search API and renders cards. hand-off: the box
   * opens the source's own search in a new tab and the user pastes a link
   * back — for sources whose search API is too scarce or costly to call.
   */
  searchMode?: 'in-app' | 'hand-off';
  /** Heading shown above the feed when the search box is empty. */
  feedLabel: string;
  feedKind: FeedKind;
  /** Endpoint plus the ranking signal — "trending" must name what it counts. */
  feedSource: string;
  refresh: string;
  fetchFrom: 'browser' | 'backend';
  filters: string[];
  /** Why this placement — required, especially for not-on-discover. */
  reason: string;
}

export interface DetectRule {
  /** Exact hostnames accepted (lowercase). */
  hosts: string[];
  /** RegExp source matched against the URL pathname; capture group 1 is the external id. */
  path: string;
  /** Inputs offered as one-click examples in the Add Content tester. */
  examples: string[];
}

export interface Binding {
  /** Header text when this type is the only one selected. */
  label: string;
  applicability: Applicability;
  source: Source;
  /** Where the value comes from: JSONB path, column name, or a note. */
  path: string;
  unit?: string;
  /** Type-specific header tooltip; falls back to the column's generic tooltip. */
  tooltip?: string;
  /**
   * What the cell's hover popover shows and what its copy button copies
   * (CellPopover tooltipSpec). Free text; defaults to "the displayed text,
   * copy copies the raw value".
   */
  cellTip?: string;
  /**
   * Another place that shows this value when the column is hidden (e.g. the
   * Item subtitle). A required field with a carrier is not "lost" in a mixed
   * view — the review reports it as covered instead of as an error.
   */
  carriedBy?: string;
  /** Visible by default when this type is the only one selected. */
  defaultVisible: boolean;
  /**
   * How the cell should look for this type — font, icon, subtitle, muting.
   * Free text; carried into the spec so the renderer is decided up front.
   */
  appearance?: string;
}

export interface ColumnDef {
  id: string;
  /** Header text whenever more than one bound type is selected. */
  generic: string;
  group: 'identity' | 'attribution' | 'scale' | 'reception' | 'temporal' | 'economics' | 'epistemic' | 'system';
  valueType: ValueType;
  tooltip: string;
  storage: Storage;
  sortable: boolean;
  filterable: boolean;
  /** Rendering when a selected type has no binding for this column. */
  gapFallback: 'em-dash' | 'blank' | 'hide-column' | 'substitute';
  align?: 'left' | 'right' | 'center';
  width?: number;
  /** Always shown regardless of type selection (grid chrome). */
  pinned?: boolean;
  /**
   * Dropped when exactly one type is filtered in, even if pinned — every row
   * would say the same thing (the Type column is the case in point).
   */
  hideWhenSolo?: boolean;
  bindings: Partial<Record<TypeId, Binding>>;
}

export const TYPES: ContentTypeProfile[] = [
  {
    id: 'youtube',
    label: 'YouTube video',
    plural: 'YouTube videos',
    enumValue: 'YOUTUBE',
    gist: 'A single video hosted on YouTube, identified by its video ID.',
    ingestion: 'api',
    enrichment: 'YouTube Data API v3 (videos.list: snippet, contentDetails, statistics)',
    urlRequired: true,
    urlPattern: 'youtube.com/watch?v=<id> | youtu.be/<id> | youtube.com/shorts/<id>',
    identity: 'videoId',
    icon: 'play-badge',
    accent: '#FF0033',
    sharesUrlSpace: false,
    thumbnail: 'i.ytimg.com/vi/<id>/mqdefault.jpg',
    discover: {
      placement: 'search-and-feed',
      status: 'shipped',
      search:
        'youtube.com/results?search_query=… in a new tab. search.list is capped at 100 calls/day per project (signing users in does not change that), so the app never calls it; a YouTube link pasted into the same box is added directly',
      searchMode: 'hand-off',
      feedLabel: 'Trending on YouTube',
      feedKind: 'trending',
      feedSource: 'videos.list?chart=mostPopular&regionCode=US (1 unit per call) — YouTube\'s own popularity chart, via the youtubeTrending GraphQL query',
      refresh: 'backend cache per region + page, 1 h (YOUTUBE_TRENDING_CACHE_TTL_SECONDS)',
      fetchFrom: 'backend',
      filters: [],
      reason: 'Shipped on claude/content-type-visual-media-wrao93: routes/discover/+page.svelte, lib/services/youtubeApi.ts, youtube.CachingClient.GetTrending.'
    }
  },
  {
    // TMDB family (2026-09-27 plan): movie, TV show, TV season, TV episode.
    // Every level has its own canonical themoviedb.org URL, so the family keeps
    // the global UNIQUE(url) — the url is regenerated from ids, never stored as pasted.
    id: 'movie',
    label: 'Movie',
    plural: 'Movies',
    enumValue: 'MOVIE',
    gist: 'A theatrical or streaming feature film, independent of where it is watched.',
    ingestion: 'api',
    enrichment: 'TMDB /search/movie, then /movie/{id}?append_to_response=credits,release_dates,external_ids,keywords',
    urlRequired: false,
    urlPattern: 'optional input: themoviedb.org/movie/<id>[-slug] | imdb.com/title/<tt> (resolved via /find) — or search by title; stored url is always regenerated as themoviedb.org/movie/<id>',
    identity: 'TMDB movie id (enforced through the canonical url UNIQUE)',
    icon: 'film',
    accent: '#0F9D8C',
    sharesUrlSpace: false,
    thumbnail: 'TMDB poster_path — 2:3 tile (w92 in the grid, w342 in details)'
  },
  {
    id: 'book',
    label: 'Book',
    plural: 'Books',
    enumValue: 'BOOK',
    gist: 'A published book — a work, not a specific physical copy.',
    ingestion: 'api',
    enrichment: 'Open Library (/isbn/{isbn}.json, /search.json) with Google Books fallback',
    urlRequired: false,
    urlPattern: 'optional: openlibrary.org/works/<id>',
    identity: 'ISBN-13 (fallback: title + primary author)',
    icon: 'book',
    accent: '#8B5E3C',
    sharesUrlSpace: true,
    thumbnail: 'covers.openlibrary.org/b/isbn/<isbn>-M.jpg'
  },
  {
    id: 'article',
    label: 'Blog article',
    plural: 'Blog articles',
    enumValue: 'ARTICLE',
    gist: 'A web article or blog post at a canonical URL.',
    ingestion: 'scrape',
    enrichment: 'Open Graph / JSON-LD scrape (og:title, og:image, article:published_time)',
    urlRequired: true,
    urlPattern: 'any http(s) URL; canonicalised via <link rel="canonical">',
    identity: 'canonical URL',
    icon: 'document',
    accent: '#3B6FD4',
    sharesUrlSpace: false,
    thumbnail: 'og:image (fallback: favicon on neutral tile)'
  },
  {
    id: 'podcast',
    label: 'Podcast episode',
    plural: 'Podcast episodes',
    enumValue: 'PODCAST_EPISODE',
    gist: 'One episode of a podcast series, addressed by its RSS GUID.',
    ingestion: 'api',
    enrichment: 'iTunes Search API for the show + RSS feed parse for the episode',
    urlRequired: false,
    urlPattern: 'optional: episode page URL or enclosure URL',
    identity: 'RSS <guid> (fallback: feedUrl + episode title)',
    icon: 'mic',
    accent: '#7A4FD6',
    sharesUrlSpace: true,
    thumbnail: 'itunes:image or channel artwork'
  },
  {
    id: 'music',
    label: 'Music track',
    plural: 'Music tracks',
    enumValue: 'MUSIC_TRACK',
    gist: 'A recorded track/song as a work, not a particular streaming listing.',
    ingestion: 'api',
    enrichment: 'MusicBrainz recording lookup (ISRC) + Cover Art Archive',
    urlRequired: false,
    urlPattern: 'optional: streaming URL, used only as a convenience link',
    identity: 'ISRC (fallback: artist + title + release)',
    icon: 'note',
    accent: '#D64F8A',
    sharesUrlSpace: true,
    thumbnail: 'Cover Art Archive release front image'
  },
  {
    id: 'claim',
    label: 'Propositional truth claim',
    plural: 'Truth claims',
    enumValue: 'CLAIM',
    gist: 'A single proposition stated so it can be affirmed or denied.',
    ingestion: 'manual',
    enrichment: 'none — the proposition text is authored, not fetched',
    urlRequired: false,
    urlPattern: 'n/a — a source URL is an attribute, not the identity',
    identity: 'normalised proposition text (case/punctuation folded)',
    icon: 'scales',
    accent: '#C79A17',
    sharesUrlSpace: true,
    thumbnail: 'none — render the proposition text as the tile'
  },
  {
    id: 'joke',
    label: 'Joke',
    plural: 'Jokes',
    enumValue: 'JOKE',
    gist: 'A joke or bit, stored as text with an attributed teller where known.',
    ingestion: 'manual',
    enrichment: 'none — user-entered text',
    urlRequired: false,
    urlPattern: 'optional: link to a performance clip',
    identity: 'normalised setup + punchline hash',
    icon: 'smile',
    accent: '#E0812B',
    sharesUrlSpace: true,
    thumbnail: 'none — render the setup line as the tile'
  },
  {
    id: 'purchase',
    label: 'Purchase',
    plural: 'Purchases',
    enumValue: 'PURCHASE',
    gist: 'Something the user bought — the transaction, not the product page.',
    ingestion: 'manual',
    enrichment: 'none by default; optional merchant/product lookup later',
    urlRequired: false,
    urlPattern: 'optional: product or receipt URL',
    identity: 'merchant + orderId (fallback: merchant + item + purchase date)',
    icon: 'receipt',
    accent: '#2E9E5B',
    sharesUrlSpace: true,
    thumbnail: 'merchant favicon, or product image when a URL is supplied'
  },
  {
    id: 'perspective',
    label: "Another person's perspective",
    plural: 'Perspectives',
    enumValue: 'PERSPECTIVE',
    gist: 'A named third party’s stated take, which itself becomes perspectiveable content.',
    ingestion: 'internal',
    enrichment: 'internal — references an existing content row plus a person record',
    urlRequired: false,
    urlPattern: 'optional: where the take was published',
    identity: 'holder + subjectContentId',
    icon: 'quote',
    accent: '#5B6472',
    sharesUrlSpace: true,
    thumbnail: 'holder avatar, falling back to subject content thumbnail'
  },
  {
    id: 'place',
    label: 'Place visit',
    plural: 'Place visits',
    enumValue: 'PLACE_VISIT',
    gist: 'A visit to a physical place — restaurant, venue, park.',
    ingestion: 'api',
    enrichment: 'OpenStreetMap Nominatim (or Google Places) for the place record',
    urlRequired: false,
    urlPattern: 'optional: map or venue URL',
    identity: 'placeId + visit date',
    icon: 'pin',
    accent: '#1F8FBF',
    sharesUrlSpace: true,
    thumbnail: 'static map tile at the place coordinates'
  },
  {
    id: 'paper',
    label: 'Research paper',
    plural: 'Research papers',
    enumValue: 'PAPER',
    gist: 'A scholarly article identified by DOI.',
    ingestion: 'api',
    enrichment: 'Crossref (/works/{doi}) with OpenAlex fallback for citation counts',
    urlRequired: false,
    urlPattern: 'optional: doi.org/<doi> or publisher URL',
    identity: 'DOI',
    icon: 'flask',
    accent: '#6552C9',
    sharesUrlSpace: true,
    thumbnail: 'none — render journal + year tile'
  },
  {
    // Mirrors feature/bible-outbound-links (PRs #403/#406/#407/#416), the most
    // advanced bible branch as of 2026-09-24 — nothing is on main yet. Every
    // passage field is a real `content` column; CreateFromPassage writes no
    // response JSONB, so bindings below point at columns or bible_book joins.
    id: 'bible',
    label: 'Bible passage',
    plural: 'Bible passages',
    enumValue: 'BIBLE_PASSAGE',
    gist: 'A contiguous range of verses within one book of the Bible (e.g. Isaiah 52:13-53:12), not a specific translation of it.',
    ingestion: 'manual',
    enrichment:
      'none external — reference parsed locally (PassagePicker / free text / pasted Bible Gateway URL); text served from seeded bible_verse_text (BSB, CC0) via passageText()',
    urlRequired: false,
    urlPattern: 'optional input: biblegateway.com/passage/?search=<ref> — parsed, then discarded; url is always regenerated by CanonicalPassageURL',
    identity: 'verse_start_id + verse_end_id (global KJV-versification ordinals), enforced through the canonical url UNIQUE',
    icon: 'book-cross',
    accent: '#7B4B2A',
    sharesUrlSpace: false,
    thumbnail: 'none — book-with-cross icon tile (h-8 w-10, bg-muted text-primary); click opens url',
    discover: {
      placement: 'feed-only',
      status: 'proposed',
      search: '',
      feedLabel: 'Verse of the day',
      feedKind: 'daily',
      feedSource:
        'biblegateway.com/votd/get/?format=json&version=NIV (keyless, undocumented widget feed; BSB is not an accepted version) — keep only votd.reference, parse it with the existing reference parser, show the passage text from seeded BSB. Fallback: labs.bible.org/api/?passage=votd&type=json',
      refresh: 'once a day, cached by the backend',
      fetchFrom: 'backend',
      filters: [],
      reason:
        'Searching passages is already covered: the Add Content card parses typed references. A daily verse is the one discovery feed the type naturally has. Backend fetch because Bible Gateway sends no CORS header, and caching keeps the card up if the undocumented feed breaks.'
    }
  },
  {
    // Research 2026-09-26: The Met Collection API won on every axis that
    // matters here — keyless, CC0 images, one request per painting, 80 req/s.
    // Harvard (non-commercial only), Rijksmuseum (old API 410 Gone; new Linked
    // Art API needs 3 hops per image), Europeana (per-item rights) and AIC
    // (60 req/min, ~2k public-domain paintings) were ruled out as primary.
    // Wikidata (~408k paintings with images) is the phase-2 source.
    id: 'painting',
    label: 'Painting',
    plural: 'Paintings',
    enumValue: 'PAINTING',
    gist: 'A fine-art painting as a work held in a collection — not house, decorative or protective painting.',
    ingestion: 'api',
    enrichment:
      'The Met Collection API — GET collectionapi.metmuseum.org/public/collection/v1/objects/{objectID}; keyless, CC0 open-access images; ~14k hits for search?medium=Paintings&hasImages=true. Accept only objectName = "Painting" (classification is blank for some departments, e.g. The American Wing). Phase 2: Wikidata (P31 = Q3305213) for paintings outside the Met',
    urlRequired: true,
    urlPattern: 'metmuseum.org/art/collection/search/<objectID> (phase 2: wikidata.org/wiki/<Q-id>)',
    identity: 'met:<objectID>; also store the Wikidata QID from objectWikidata_URL as the cross-source dedup key',
    icon: 'palette',
    accent: '#8E3B46',
    sharesUrlSpace: false,
    thumbnail:
      'primaryImageSmall (images.metmuseum.org web-large JPEG, CC0). When blank (isPublicDomain = false, e.g. Monet 437127) fall back to Wikidata P18 → commons.wikimedia.org/wiki/Special:FilePath/<file>?width=400 with its Commons attribution, else a palette icon tile. Click opens url (objectURL)',
    detect: {
      hosts: ['metmuseum.org', 'www.metmuseum.org'],
      path: '^/art/collection/search/(\\d+)/?$',
      examples: [
        'https://www.metmuseum.org/art/collection/search/436535',
        'https://www.metmuseum.org/art/collection/search/437127?ft=monet',
        'https://www.metmuseum.org/art/collection/search?q=vermeer'
      ]
    },
    discover: {
      placement: 'search-and-feed',
      status: 'proposed',
      search:
        'Met /search?medium=Paintings&hasImages=true&q=… returns object IDs only; fetch /objects/{id} per card (~24 a page, client-side paging over the ID list). Re-check objectName = "Painting" and a non-blank image (both filters leak: a gold icon and a fan came back for medium=Paintings; hasImages kept Monet 437127), and skip 404s (search returns deleted IDs, e.g. 12765).',
      feedLabel: 'Trending paintings',
      feedKind: 'trending',
      feedSource:
        'The Met has no popularity data. Rank the 421 Met highlights (isHighlight=true&medium=Paintings) by 7-day English Wikipedia pageviews: Met objectWikidata_URL → enwiki sitelink → wikimedia.org/api/rest_v1/metrics/pageviews/per-article. Highlights with no enwiki article (2 of the 6 samples) sort after, by title; label the feed "Featured" if pageviews are unavailable.',
      refresh: 'daily backend job; the page reads the stored ranking',
      fetchFrom: 'backend',
      filters: ['Era (dateBegin/dateEnd)', 'Department', 'On view now (isOnView)'],
      reason:
        'Paintings are browsed, not pasted: most users will find one on Discover rather than arrive with a Met URL. Ranking runs on the backend because it takes ~840 lookups; search can stay in the browser (the Met sends Access-Control-Allow-Origin: *, add collectionapi.metmuseum.org to connect-src).'
    },
    detailOnly: [
      { label: 'Artist bio', path: "response->>'artistDisplayBio'" },
      { label: 'Dimensions', path: "response->>'dimensions'" },
      { label: 'Credit line', path: "response->>'creditLine'" },
      { label: 'Image rights', path: "response->>'isPublicDomain' (+ Commons attribution when the image is the fallback)" }
    ]
  },
  {
    id: 'tvShow',
    label: 'TV show',
    plural: 'TV shows',
    enumValue: 'TV_SHOW',
    gist: 'A television or streaming series as a whole — every season and episode under one TMDB tv id.',
    ingestion: 'api',
    enrichment: 'TMDB /search/tv, then /tv/{id}?append_to_response=credits,content_ratings,external_ids,keywords',
    urlRequired: false,
    urlPattern: 'optional input: themoviedb.org/tv/<id>[-slug] | imdb.com/title/<tt> (via /find) — stored url regenerated as themoviedb.org/tv/<id>',
    identity: 'TMDB tv id',
    icon: 'tv',
    accent: '#1E7FA8',
    sharesUrlSpace: false,
    thumbnail: 'TMDB poster_path — 2:3 tile'
  },
  {
    id: 'tvSeason',
    label: 'TV season',
    plural: 'TV seasons',
    enumValue: 'TV_SEASON',
    gist: 'One season of a series (season 0 is "Specials"), addressed by show id + season number.',
    ingestion: 'api',
    enrichment: 'TMDB /tv/{id}/season/{n} (episodes, air dates, runtimes) + the parent /tv/{id} for network, genres and certification',
    urlRequired: false,
    urlPattern: 'optional input: themoviedb.org/tv/<id>/season/<n> — or pick show → season; stored url regenerated',
    identity: 'TMDB tv id + season_number (TMDB also issues a season _id — store it, dedupe on the pair). Adding a season force-adds its show; parent_content_id → show',
    icon: 'layers',
    accent: '#3A6EA5',
    sharesUrlSpace: false,
    thumbnail: 'season poster_path, falling back to the show poster — 2:3 tile'
  },
  {
    id: 'tvEpisode',
    label: 'TV episode',
    plural: 'TV episodes',
    enumValue: 'TV_EPISODE',
    gist: 'A single episode of a series, addressed by show id + season number + episode number.',
    ingestion: 'api',
    enrichment: 'TMDB /tv/{id}/season/{n}/episode/{e}?append_to_response=credits,external_ids + the parent /tv/{id}',
    urlRequired: false,
    urlPattern: 'optional input: themoviedb.org/tv/<id>/season/<n>/episode/<e> — or pick show → season → episode; stored url regenerated',
    identity: 'TMDB tv id + season_number + episode_number. Adding an episode force-adds its season and show; parent_content_id → season',
    icon: 'clapperboard',
    accent: '#5A55B5',
    sharesUrlSpace: false,
    thumbnail: 'still_path — 16:9 tile (same shape as a YouTube thumbnail), falling back to the season/show poster'
  }
];

/** The TMDB family — one enrichment source, four levels of the same catalogue. */
export const TMDB_TYPES: TypeId[] = ['movie', 'tvShow', 'tvSeason', 'tvEpisode'];
const isTmdb = (id: TypeId): boolean => TMDB_TYPES.includes(id);

const b = (
  label: string,
  applicability: Applicability,
  source: Source,
  path: string,
  defaultVisible: boolean,
  extra: Partial<Binding> = {}
): Binding => ({ label, applicability, source, path, defaultVisible, ...extra });

export const COLUMNS: ColumnDef[] = [
  {
    id: 'perspectize',
    generic: '',
    group: 'system',
    valueType: 'boolean',
    tooltip: 'Perspectize — add or edit your perspective',
    storage: 'derived',
    sortable: false,
    filterable: false,
    gapFallback: 'em-dash',
    align: 'center',
    width: 48,
    pinned: true,
    bindings: Object.fromEntries(
      TYPES.map((t) => [t.id, b('', 'required', 'derived', 'perspective join', true)])
    )
  },
  {
    id: 'item',
    generic: 'Item',
    group: 'identity',
    valueType: 'text',
    tooltip: 'Title and thumbnail for the item',
    storage: 'universal-column',
    sortable: true,
    filterable: true,
    gapFallback: 'substitute',
    width: 200,
    pinned: true,
    bindings: {
      youtube: b('Video', 'required', 'api', 'name + snippet.thumbnails', true, { tooltip: 'Video title and thumbnail from the YouTube API' }),
      movie: b('Film', 'required', 'api', 'name (title) + poster_path', true, {
        tooltip: 'Film title and poster from TMDB. Click the title for details; click the poster to open TMDB.',
        cellTip: 'Title, original title when it differs, release year. Copy copies the title.',
        appearance: '2:3 poster tile (24×36, w92) instead of a 16:9 thumbnail; title line-clamp-2; release year as an 11px muted subtitle.'
      }),
      book: b('Book', 'required', 'api', 'name + cover edition', true, { tooltip: 'Title and cover from Open Library' }),
      article: b('Article', 'required', 'scrape', 'name + og:image', true, { tooltip: 'Headline and lead image scraped from the page' }),
      podcast: b('Episode', 'required', 'api', 'name + episode artwork', true, { tooltip: 'Episode title and show artwork' }),
      music: b('Track', 'required', 'api', 'name + cover art', true, { tooltip: 'Track title and release cover art' }),
      claim: b('Claim', 'required', 'user', 'name (the proposition)', true, { tooltip: 'The proposition as stated; no image' }),
      joke: b('Joke', 'required', 'user', 'name (setup line)', true, { tooltip: 'Setup line; full text in the description column' }),
      purchase: b('Item bought', 'required', 'user', 'name', true, { tooltip: 'What was purchased' }),
      perspective: b('Take', 'required', 'internal', 'name (summary of the take)', true, { tooltip: 'One-line summary of the perspective held' }),
      place: b('Place', 'required', 'api', 'name + map tile', true, { tooltip: 'Place name and location tile' }),
      paper: b('Paper', 'required', 'api', 'name (title)', true, { tooltip: 'Paper title from Crossref' }),
      tvShow: b('Show', 'required', 'api', 'name + poster_path', true, {
        tooltip: 'Series title and poster from TMDB. Click the title for details; click the poster to open TMDB.',
        cellTip: 'Title, original title when it differs, air years. Copy copies the title.',
        appearance: '2:3 poster tile; subtitle = air years, open-ended while running ("2022–").'
      }),
      tvSeason: b('Season', 'required', 'api', 'name + poster_path (season, else show)', true, {
        tooltip: 'Season name from TMDB — usually "Season N", but can be "Specials" or a named arc.',
        cellTip: 'Show › season name, episode count. Copy copies "Show — Season N".',
        appearance: '2:3 poster tile; title = season name; subtitle = show name, so the row still reads when the Show column is hidden (mixed-type views).'
      }),
      tvEpisode: b('Episode', 'required', 'api', 'name + still_path', true, {
        tooltip: 'Episode title and still frame from TMDB. Click the title for details; click the still to open TMDB.',
        cellTip: 'Show › S5 E14 › title. Copy copies "Show S05E14 — Title".',
        appearance: '16:9 still tile (48×27, w185) — the YouTube thumbnail shape, not a poster; subtitle "Show · S5 E14" so the title never floats alone.'
      }),
      bible: b('Passage', 'required', 'derived', 'display_title ?? name (CanonicalPassageName)', true, {
        tooltip: 'Your title for the passage if one was set, otherwise the reference (e.g. "Micah 6:8"). Sorts in canonical Bible order, not A–Z.',
        appearance:
          'Icon tile instead of a thumbnail. Serif 13px title, line-clamp-2. When display_title is set, the reference appears as an 11px muted subtitle (line-clamp-1 on the title). Sort comparator: verse_start_id, so Genesis precedes 1 Corinthians.'
      }),
      painting: b('Painting', 'required', 'api', 'name + image_url (primaryImageSmall, Commons fallback)', true, {
        tooltip: 'Title and image from The Met collection. Click opens the painting on metmuseum.org.',
        appearance:
          'Thumbnail in the existing slot with object-fit: contain on a neutral mat, not cover — cropping a painting misrepresents it (portraits are tall, Washington Crossing the Delaware is 1.7:1). Palette icon tile when no image. Commons-sourced images carry a small "ⓘ" with the attribution in the tooltip.'
      })
    }
  },
  {
    id: 'type',
    generic: 'Type',
    group: 'identity',
    valueType: 'enum',
    tooltip: 'Content type',
    storage: 'universal-column',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    width: 72,
    pinned: true,
    hideWhenSolo: true,
    bindings: Object.fromEntries(
      TYPES.map((t) => [t.id, b('Type', 'required', 'derived', 'content_type', true)])
    )
  },
  {
    id: 'series',
    generic: 'Series',
    group: 'identity',
    valueType: 'ref',
    tooltip: 'The larger work this item belongs to',
    // Decision 2026-09-27: parents are force-added, so seasons/episodes link
    // through a real content.parent_content_id FK (migration). Movie's
    // Collection binding is still a response JSONB path.
    storage: 'promoted-column',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    bindings: {
      tvSeason: b('Show', 'required', 'derived', 'parent_content_id → content.name (the show; response.showName is the denormalised sort value)', true, {
        tooltip: "The series this season belongs to. Opens the show's own row, which always exists: adding a season adds its show.",
        cellTip: 'Show name and air years. Copy copies the show name.',
        appearance: 'Link-styled text, no poster. Sorts A–Z by show name.',
        carriedBy: 'Item subtitle'
      }),
      tvEpisode: b('Show', 'required', 'derived', 'parent_content_id → season → parent_content_id → content.name (response.showName for sort)', true, {
        tooltip: "The series this episode belongs to. Opens the show's own row, which always exists: adding an episode adds its season and show.",
        cellTip: 'Show name and air years. Copy copies the show name.',
        appearance: 'Link-styled text, no poster. Sorts A–Z by show name, then by No.',
        carriedBy: 'Item subtitle'
      }),
      movie: b('Collection', 'optional', 'api', "response->'belongs_to_collection'->>'name'", false, {
        tooltip: 'TMDB collection (franchise), e.g. "Dune Collection". Blank for standalone films.'
      })
    }
  },
  {
    id: 'position',
    generic: 'No.',
    group: 'identity',
    valueType: 'text',
    tooltip: 'Where this item sits inside its series',
    storage: 'jsonb',
    sortable: true,
    filterable: false,
    gapFallback: 'em-dash',
    width: 84,
    bindings: {
      tvEpisode: b('No.', 'required', 'api', "response->>'seasonNumber' + response->>'episodeNumber'", true, {
        unit: 'season·episode',
        tooltip: 'Season and episode number. Sorts by season, then episode (so S1 E10 follows S1 E9), with Specials (season 0) after every regular season.',
        cellTip: 'Absolute position too ("episode 60 of 62"). Copy copies "S05E14".',
        appearance: 'Monospace "S5 · E14"; specials read "S0 · E3". Sort key: (season 0 → 10000, else season) × 1000 + episode, so Specials sort last ascending and first descending.',
        carriedBy: 'Item subtitle'
      }),
      tvSeason: b('No.', 'required', 'api', "response->>'seasonNumber'", false, {
        unit: 'season',
        tooltip: 'Season number. Specials (season 0) sort after every regular season. Usually repeats the season name, so off by default.',
        appearance: '"S5"; season 0 renders "S0 · Specials". Sort key: season 0 → 10000, else the season number.'
      })
    }
  },
  {
    id: 'category',
    generic: 'Category',
    group: 'identity',
    valueType: 'text',
    tooltip: 'Wikidata category',
    storage: 'universal-column',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    bindings: Object.fromEntries(
      TYPES.map((t) => [
        t.id,
        isTmdb(t.id)
          ? b('Category', 'optional', 'user', 'primary_category_id', false, {
              tooltip: 'Wikidata category — off by default for TMDB types, where Genre does the same job from the source.'
            })
          : b('Category', 'optional', 'user', 'primary_category_id', true)
      ])
    )
  },
  {
    id: 'genre',
    generic: 'Genre',
    group: 'identity',
    valueType: 'enum',
    tooltip: 'The literary form or genre of the item',
    // Mostly a response JSONB path; bible derives it through a bible_book join
    // instead (source 'derived'), which the per-type path makes explicit.
    storage: 'jsonb',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    bindings: {
      bible: b('Genre', 'required', 'derived', 'bible_book.division + bible_book.testament (via verse_start_id → book)', true, {
        tooltip:
          'Canonical division of the book: Torah, History, Wisdom, Major/Minor Prophets, Gospels, Acts, Pauline/General Epistles, Apocalyptic. OT/NT shown after it. From data/bible/books.json, not user-entered.',
        appearance: 'Division as a quiet pill; testament as a muted "· OT" / "· NT" suffix. Filter is a set filter over the 10 divisions in canonical order, not alphabetical.'
      }),
      movie: b('Genre', 'typical', 'api', "response->'genres'[].name", true, {
        tooltip: 'TMDB movie genres — the first is shown, all are in the popover.',
        cellTip: 'Multi mode: every genre as a checklist, "Copy selected" / "Copy all", nothing copied by default.',
        appearance: 'First genre as a quiet pill with a "+2" counter when there are more.'
      }),
      tvShow: b('Genre', 'typical', 'api', "response->'genres'[].name", true, {
        tooltip: 'TMDB TV genres — a separate list from movie genres ("Sci-Fi & Fantasy", not "Science Fiction").',
        cellTip: 'Multi mode: every genre as a checklist, "Copy selected" / "Copy all".',
        appearance: 'Same pill + counter as movies. The genre filter must map TV and movie genre names onto one list.'
      }),
      tvSeason: b('Genre', 'optional', 'derived', "parent show response->'genres'", false, {
        tooltip: 'Inherited from the show — TMDB has no per-season genres.'
      }),
      tvEpisode: b('Genre', 'optional', 'derived', "parent show response->'genres'", false, {
        tooltip: 'Inherited from the show — TMDB has no per-episode genres.'
      }),
      book: b('Subject', 'optional', 'api', "response->'subjects'->>0", false),
      music: b('Genre', 'optional', 'api', "response->'tags'->0->>'name'", false),
      podcast: b('Genre', 'optional', 'api', "response->>'primaryGenreName'", false),
      painting: b('Medium', 'typical', 'api', "response->>'medium'", true, {
        tooltip: 'Materials as the museum records them, e.g. "Oil on canvas", "Oil on oak", "Tempera and gold on wood".',
        appearance: 'Plain text, line-clamp-1. Filter is free-text contains, not a set filter — the Met does not use a controlled vocabulary here.'
      })
    }
  },
  {
    id: 'certification',
    generic: 'Age rating',
    group: 'identity',
    valueType: 'enum',
    tooltip: 'Official audience certification (US: MPA for films, TV Parental Guidelines for series)',
    storage: 'jsonb',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    align: 'center',
    bindings: {
      movie: b('Rated', 'typical', 'api', "release_dates.results[iso_3166_1='US'] → type 3 (theatrical) certification", true, {
        unit: 'MPA scale',
        tooltip: 'US MPA rating from TMDB release_dates (theatrical). Blank when TMDB has none — blank is not "Unrated".',
        cellTip: 'Rating plus the country it came from ("US · theatrical"). Copy copies "PG-13".',
        appearance: 'Bordered monospace badge "PG-13". Sort comparator follows the scale G < PG < PG-13 < R < NC-17, not A–Z.'
      }),
      tvShow: b('TV rating', 'typical', 'api', "content_ratings.results[iso_3166_1='US'].rating", false, {
        unit: 'TV Parental Guidelines',
        tooltip: 'US TV Parental Guidelines rating from TMDB content_ratings.',
        appearance: 'Same badge; comparator TV-Y < TV-Y7 < TV-G < TV-PG < TV-14 < TV-MA.'
      }),
      tvSeason: b('TV rating', 'optional', 'derived', 'parent show content_ratings (US)', false, {
        unit: 'TV Parental Guidelines',
        tooltip: 'Inherited from the show — TMDB certifies series, not seasons.'
      }),
      tvEpisode: b('TV rating', 'optional', 'derived', 'parent show content_ratings (US)', false, {
        unit: 'TV Parental Guidelines',
        tooltip: 'Inherited from the show — TMDB certifies series, not episodes.'
      })
    }
  },
  {
    id: 'creator',
    generic: 'Creator',
    group: 'attribution',
    valueType: 'text',
    tooltip: 'Who made or is responsible for this item',
    storage: 'promoted-column',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    bindings: {
      youtube: b('Channel', 'required', 'api', "response->>'channelTitle'", true),
      movie: b('Director', 'typical', 'api', "credits.crew[job='Director'].name", true, {
        tooltip: 'Director(s) from TMDB credits; co-directors are joined with "&".',
        cellTip: 'Director(s) and writer(s). Copy copies the director names.'
      }),
      tvShow: b('Created by', 'typical', 'api', "response->'created_by'[].name", false, {
        tooltip: 'Series creators from TMDB created_by. Often empty for unscripted TV.'
      }),
      tvEpisode: b('Director', 'typical', 'api', "credits.crew[job='Director'].name", true, {
        tooltip: 'Episode director from TMDB credits. Writers are in the popover and the details view.',
        cellTip: 'Director(s) and writer(s) of this episode. Copy copies the director names.'
      }),
      book: b('Author', 'required', 'api', "response->>'author'", true),
      article: b('Author', 'typical', 'scrape', "response->>'author'", true, { tooltip: 'Byline from the page, when one is published' }),
      podcast: b('Show', 'required', 'api', "response->>'showTitle'", true),
      music: b('Artist', 'required', 'api', "response->>'artist'", true),
      claim: b('Claimant', 'optional', 'user', "response->>'claimant'", true, { tooltip: 'PLANNED — not written by CreateClaim today. Who asserts the claim, if attributed' }),
      joke: b('Comedian', 'optional', 'user', "response->>'teller'", true),
      purchase: b('Merchant', 'required', 'user', "response->>'merchant'", true),
      perspective: b('Holder', 'required', 'internal', "response->>'holder'", true, { tooltip: 'The person whose perspective this is' }),
      place: b('Operator', 'optional', 'api', "response->>'operator'", false),
      paper: b('First author', 'required', 'api', "response->'authors'->0->>'name'", true),
      painting: b('Artist', 'typical', 'api', "response->>'artistDisplayName'", true, {
        tooltip: 'The artist as the museum attributes the work — may read "Workshop of…", "Attributed to…" or be blank for anonymous works.',
        appearance: 'Name, with artistDisplayBio (e.g. "Dutch, Leiden 1606–1669 Amsterdam") as an 11px muted subtitle.'
      })
    }
  },
  {
    id: 'venue',
    generic: 'Published in',
    group: 'attribution',
    valueType: 'text',
    tooltip: 'The outlet, platform, or place this item appeared in',
    storage: 'jsonb',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    bindings: {
      youtube: b('Platform', 'optional', 'derived', "'YouTube'", false),
      movie: b('Studio', 'optional', 'api', "response->'production_companies'->0->>'name'", false),
      tvShow: b('Network', 'typical', 'api', "response->'networks'->0->>'name'", true, {
        tooltip: 'Original broadcaster or streamer (TMDB networks) — where it premiered, not where it streams today.',
        appearance: 'Network name, with a 16px monochrome logo when TMDB has a logo_path.'
      }),
      tvSeason: b('Network', 'optional', 'derived', 'parent show networks[0]', false),
      tvEpisode: b('Network', 'optional', 'derived', 'parent show networks[0]', false),
      book: b('Publisher', 'typical', 'api', "response->>'publisher'", false),
      article: b('Site', 'required', 'scrape', "response->>'siteName'", true),
      podcast: b('Network', 'optional', 'api', "response->>'network'", false),
      music: b('Label', 'optional', 'api', "response->>'label'", false),
      paper: b('Journal', 'required', 'api', "response->>'containerTitle'", true),
      place: b('Locality', 'typical', 'api', "response->>'locality'", true),
      purchase: b('Channel', 'optional', 'user', "response->>'salesChannel'", false),
      bible: b('Book', 'required', 'derived', 'bible_book.name (via verse_start_id)', false, {
        tooltip: 'The book of the Bible, and its place among the 66. Already the first word of the reference, so off by default.',
        appearance: 'Book name with a muted "#23 of 66". Sorts by bible_book.id (canonical order).'
      }),
      painting: b('Collection', 'typical', 'api', "response->>'repository'", false, {
        tooltip: 'The museum that holds the painting, and its department. Constant while the Met is the only source, so off by default; turn on once Wikidata paintings arrive.',
        appearance: 'Museum name with response->>\'department\' as a muted subtitle, e.g. "The Met · European Paintings".'
      })
    }
  },
  {
    id: 'length',
    generic: 'Length',
    group: 'scale',
    valueType: 'duration',
    tooltip: 'How long the item is, in its own natural unit',
    storage: 'universal-column',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    align: 'right',
    bindings: {
      youtube: b('Length', 'required', 'api', 'length + length_units', true, { unit: 'seconds → h:mm:ss', tooltip: 'Video duration from the YouTube API' }),
      movie: b('Runtime', 'required', 'api', 'length + length_units', true, {
        unit: 'minutes',
        tooltip: 'Runtime from TMDB, in minutes.',
        cellTip: 'Exact minutes ("167 min"). Copy copies 167.',
        appearance: '"2h 47m", right-aligned; sorts on the minute value.'
      }),
      tvSeason: b('Runtime', 'typical', 'derived', "Σ response->'episodes'[].runtime → length, length_units = 'minutes'", true, {
        unit: 'minutes',
        tooltip: "Total runtime of the season: the sum of its episodes' TMDB runtimes. Episodes with no runtime are skipped, so read it as a floor.",
        cellTip: 'Total and average per episode ("12h 32m · ~47m each"). Copy copies the minutes.',
        appearance: '"12h 32m", right-aligned.'
      }),
      tvEpisode: b('Runtime', 'typical', 'api', "response->>'runtime' → length", true, {
        unit: 'minutes',
        tooltip: 'Episode runtime from TMDB, in minutes.',
        cellTip: 'Exact minutes. Copy copies the number.',
        appearance: '"47m", right-aligned.'
      }),
      book: b('Pages', 'typical', 'api', 'length + length_units', true, { unit: 'pages', tooltip: 'Page count of the referenced edition' }),
      article: b('Read time', 'typical', 'derived', 'length + length_units', true, { unit: 'minutes (words ÷ 220)', tooltip: 'Estimated read time from word count' }),
      podcast: b('Length', 'required', 'api', 'length + length_units', true, { unit: 'seconds → h:mm:ss' }),
      music: b('Length', 'required', 'api', 'length + length_units', true, { unit: 'seconds → m:ss' }),
      paper: b('Pages', 'optional', 'api', 'length + length_units', false, { unit: 'pages' }),
      joke: b('Words', 'optional', 'derived', 'length + length_units', false, { unit: 'words' }),
      place: b('Visit length', 'optional', 'user', 'length + length_units', false, { unit: 'minutes' }),
      // Decision 2026-09-24: word count in the BSB, superseding the ANSWERS doc's Q11 answer
      // (verse count). Neither is written by CreateFromPassage today.
      bible: b(
        'Words - BSB',
        'typical',
        'derived',
        "Σ words of bible_verse_text (translation 'BSB') for verse_start_id..verse_end_id → length, length_units = 'words'",
        true,
        {
          unit: 'words (BSB)',
          tooltip:
            'PLANNED — not written by CreateFromPassage today. Word count of the passage in the Berean Standard Bible; other translations differ. Counted once when the passage is added.',
          appearance:
            'Right-aligned integer with thousands separator, e.g. "453". The unit lives in the header, not the cell. Sorting alongside other types raises the mixed-unit alert (filter to one type, or sort by Type then Length).'
        }
      )
    }
  },
  {
    id: 'episodes',
    generic: 'Episodes',
    group: 'scale',
    valueType: 'number',
    tooltip: 'How many episodes the item contains',
    storage: 'jsonb',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    align: 'right',
    bindings: {
      tvShow: b('Episodes', 'typical', 'api', "response->>'number_of_episodes' (+ number_of_seasons)", true, {
        unit: 'episodes',
        tooltip: 'Episodes aired so far across all regular seasons (TMDB number_of_episodes). The season count sits underneath.',
        cellTip: 'Per-season breakdown ("S1 7 · S2 13 · …"). Copy copies the episode count.',
        appearance: '"62" with an 11px muted "5 seasons" subtitle.'
      }),
      tvSeason: b('Episodes', 'typical', 'api', "jsonb_array_length(response->'episodes')", true, {
        unit: 'episodes',
        tooltip: 'Episodes in this season on TMDB — for a current season this includes announced, not-yet-aired ones.'
      })
    }
  },
  {
    id: 'date',
    generic: 'Date',
    group: 'temporal',
    valueType: 'date',
    tooltip: 'The date that matters most for this item',
    storage: 'jsonb',
    sortable: true,
    filterable: true,
    gapFallback: 'substitute',
    bindings: {
      youtube: b('Published', 'required', 'api', "response->>'publishedAt'", true),
      movie: b('Released', 'required', 'api', "response->>'release_date'", true, {
        tooltip: 'Primary release date from TMDB. The US theatrical date can differ; both are in the details view.',
        cellTip: 'Primary and US theatrical dates. Copy copies the ISO date.'
      }),
      tvShow: b('First aired', 'required', 'api', "response->>'first_air_date'", true, {
        tooltip: 'Premiere date of the series. The last air date and the next episode are in the details view.',
        cellTip: 'First and last air dates, and the next episode when one is scheduled.'
      }),
      tvSeason: b('Premiered', 'typical', 'api', "response->>'air_date'", true, {
        tooltip: "Air date of the season's first episode.",
        cellTip: 'Premiere and finale dates.'
      }),
      tvEpisode: b('Aired', 'required', 'api', "response->>'air_date'", true, {
        tooltip: 'Original air date. A future date means announced but not aired yet.'
      }),
      book: b('Published', 'typical', 'api', "response->>'firstPublishDate'", true),
      article: b('Published', 'typical', 'scrape', "response->>'publishedTime'", true),
      podcast: b('Aired', 'required', 'api', "response->>'pubDate'", true),
      music: b('Released', 'typical', 'api', "response->>'releaseDate'", true),
      claim: b('Asserted', 'optional', 'user', "response->>'assertedAt'", true, { tooltip: 'PLANNED — not written by CreateClaim today' }),
      joke: b('First told', 'optional', 'user', "response->>'firstToldAt'", false),
      purchase: b('Purchased', 'required', 'user', "response->>'purchasedAt'", true),
      perspective: b('Stated', 'typical', 'internal', "response->>'statedAt'", true),
      place: b('Visited', 'required', 'user', "response->>'visitedAt'", true),
      paper: b('Published', 'required', 'api', "response->>'issued'", true),
      painting: b('Painted', 'typical', 'api', "(response->>'objectBeginDate')::int", true, {
        tooltip: 'When the painting was made, as the museum dates it — often approximate ("ca. 1662") or a range ("1884–86").',
        appearance:
          'Display response->>\'objectDate\' verbatim; never reformat to a full date. The value path is the sort key: integer objectBeginDate (negative for BCE) — note the Vermeer sample: shown "ca. 1662", sorted as 1657. Mixed with YouTube publishedAt this column spans centuries vs days — sort by Type first.'
      })
    }
  },
  {
    id: 'releaseStatus',
    generic: 'Release status',
    group: 'temporal',
    valueType: 'enum',
    tooltip: 'Where the item is in its production / release lifecycle, per the source',
    storage: 'jsonb',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    bindings: {
      tvShow: b('Status', 'typical', 'api', "response->>'status'", true, {
        tooltip: 'TMDB series status: Returning Series, In Production, Planned, Ended, Canceled or Pilot. It goes stale until "Update source data" runs.',
        cellTip: 'Status, plus "Next: S3 E1 · <date>" when TMDB has next_episode_to_air.',
        appearance: 'Dot + label: green Returning, grey Ended, red Canceled.'
      }),
      movie: b('Status', 'optional', 'api', "response->>'status'", false, {
        tooltip: 'Rumored / Planned / In Production / Post Production / Released / Canceled. Almost always "Released" for something watched, so off by default.'
      }),
      tvEpisode: b('Episode type', 'optional', 'api', "response->>'episode_type'", false, {
        tooltip: 'TMDB episode_type: standard, mid_season or finale. Handy for finding finales.'
      })
    }
  },
  {
    id: 'audience',
    generic: 'Audience',
    group: 'reception',
    valueType: 'number',
    tooltip: 'How many people have consumed this item, where a public count exists',
    storage: 'jsonb',
    sortable: true,
    filterable: false,
    gapFallback: 'em-dash',
    align: 'right',
    bindings: {
      youtube: b('Views', 'required', 'api', "response->>'viewCount'", true, { tooltip: 'View count from the YouTube API' }),
      podcast: b('Plays', 'optional', 'api', "response->>'playCount'", false, { tooltip: 'Rarely published; usually blank' }),
      music: b('Plays', 'optional', 'api', "response->>'playCount'", false),
      paper: b('Citations', 'typical', 'api', "response->>'citationCount'", true, { tooltip: 'Citation count from OpenAlex' }),
      movie: b('Votes', 'optional', 'api', "response->>'vote_count'", false, { tooltip: 'Number of TMDB user votes behind the Score.' }),
      tvShow: b('Votes', 'optional', 'api', "response->>'vote_count'", false, { tooltip: 'Number of TMDB user votes behind the Score.' }),
      tvEpisode: b('Votes', 'optional', 'api', "response->>'vote_count'", false, { tooltip: 'Number of TMDB user votes behind the Score.' })
    }
  },
  {
    id: 'approval',
    generic: 'Approval',
    group: 'reception',
    valueType: 'percent',
    tooltip: 'Positive reception as a share of total reception',
    storage: 'derived',
    sortable: true,
    filterable: false,
    gapFallback: 'em-dash',
    align: 'right',
    bindings: {
      youtube: b('% Liked', 'typical', 'derived', 'likeCount ÷ viewCount', true, { tooltip: 'Likes as a percentage of views' }),
      movie: b('Score', 'typical', 'api', "response->>'vote_average' × 10", true, {
        tooltip: 'TMDB user score (vote_average × 10). Community votes, not critics.',
        cellTip: 'Score with its vote count ("81% from 6,912 votes"). Copy copies the raw 0–10 average.',
        appearance: '"81%" right-aligned; muted when vote_count < 50, too few votes to mean much.'
      }),
      tvShow: b('Score', 'typical', 'api', "response->>'vote_average' × 10", true, {
        tooltip: 'TMDB user score for the series as a whole (vote_average × 10).',
        cellTip: 'Score with its vote count. Copy copies the raw 0–10 average.',
        appearance: 'As for films.'
      }),
      tvSeason: b('Score', 'optional', 'api', "response->>'vote_average' × 10", false, {
        tooltip: 'TMDB season score. Seasons carry no vote count, so 3 votes and 3,000 look the same — off by default.'
      }),
      tvEpisode: b('Score', 'typical', 'api', "response->>'vote_average' × 10", true, {
        tooltip: 'TMDB user score for this episode (vote_average × 10).',
        cellTip: 'Score with its vote count. Copy copies the raw 0–10 average.',
        appearance: 'As for films; episode vote counts are small, so the muted state is common.'
      }),
      book: b('Score', 'optional', 'api', "response->>'ratingsAverage' × 20", false)
    }
  },
  {
    id: 'rating',
    generic: 'Rating',
    group: 'reception',
    valueType: 'rating',
    tooltip: 'Your own 1–5 rating of the item',
    storage: 'promoted-column',
    sortable: true,
    filterable: true,
    gapFallback: 'blank',
    align: 'center',
    bindings: Object.fromEntries(
      TYPES.filter((t) => t.id !== 'claim' && t.id !== 'perspective' && t.id !== 'bible').map((t) => [
        t.id,
        b('Rating', 'optional', 'user', "response->>'userRating'", true, {
          tooltip: 'Your rating — user-entered, never fetched'
        })
      ])
    )
  },
  {
    id: 'amount',
    generic: 'Amount',
    group: 'economics',
    valueType: 'money',
    tooltip: 'What this item cost',
    storage: 'jsonb',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    align: 'right',
    bindings: {
      purchase: b('Price', 'required', 'user', "(response->>'amountMinor')::bigint", true, { unit: 'minor units + currency code' }),
      place: b('Spend', 'optional', 'user', "(response->>'amountMinor')::bigint", true, { unit: 'minor units + currency code' }),
      book: b('Price paid', 'optional', 'user', "(response->>'amountMinor')::bigint", false),
      movie: b('Ticket', 'optional', 'user', "(response->>'amountMinor')::bigint", false)
    }
  },
  {
    id: 'stance',
    generic: 'Stance',
    group: 'epistemic',
    valueType: 'enum',
    tooltip: 'Where the holder stands on the proposition',
    storage: 'jsonb',
    sortable: true,
    filterable: true,
    gapFallback: 'hide-column',
    bindings: {
      claim: b('Stance', 'required', 'user', "response->>'stance'", true, { tooltip: 'PLANNED — not written by CreateClaim today. Affirm / deny / undecided' }),
      perspective: b('Stance', 'required', 'internal', "response->>'stance'", true, { tooltip: 'Agrees / disagrees / mixed on the subject' })
    }
  },
  {
    id: 'confidence',
    generic: 'Confidence',
    group: 'epistemic',
    valueType: 'percent',
    tooltip: 'How strongly the position is held, 0–100',
    storage: 'jsonb',
    sortable: true,
    filterable: false,
    gapFallback: 'hide-column',
    align: 'right',
    bindings: {
      claim: b('Confidence', 'typical', 'user', "(response->>'confidence')::int", true, { tooltip: 'PLANNED — not written by CreateClaim today' }),
      perspective: b('Confidence', 'optional', 'internal', "(response->>'confidence')::int", false)
    }
  },
  {
    id: 'subject',
    generic: 'About',
    group: 'epistemic',
    valueType: 'ref',
    tooltip: 'The content or claim this item is about',
    // 'promoted-column' is accurate for perspective (domain.Perspective.ContentID is a real FK
    // column) but not for claim, which stores its link inside response JSONB — see the claim
    // binding's comment below. ColumnDef only has one storage value per column, so this is a
    // known modeling gap in the tool rather than a claim-specific bug; flagging here so it isn't
    // read as "claim also has a promoted column."
    storage: 'promoted-column',
    sortable: false,
    filterable: true,
    gapFallback: 'em-dash',
    bindings: {
      perspective: b('About', 'required', 'internal', 'subject_content_id → content', true),
      // Backend field is response.parentContentId (JSONB), not a promoted column, and it's
      // currently required (ContentService.CreateClaim rejects parentContentID <= 0). Product
      // direction (2026-09-12): a claim should NOT need a parent — this stays 'optional' to
      // reflect that target, and relaxing the backend constraint is tracked with the universal
      // Add Content modal work, not done standalone. Update this note once that ships.
      claim: b('Source', 'optional', 'user', "response->>'parentContentId' → content", false, { tooltip: 'The content the claim was drawn from, if any — not required' })
    }
  },
  {
    id: 'status',
    generic: 'Status',
    group: 'temporal',
    valueType: 'enum',
    tooltip: 'Where you are with this item',
    storage: 'jsonb',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    bindings: {
      book: b('Reading', 'typical', 'user', "response->>'progressStatus'", true, { tooltip: 'Want to read / reading / finished / abandoned' }),
      movie: b('Watched', 'typical', 'user', "response->>'progressStatus'", false, {
        tooltip: 'Want to watch / watched — yours, never fetched. Off by default to keep the film view at 10 columns.'
      }),
      tvShow: b('Watching', 'optional', 'user', "response->>'progressStatus'", false, {
        tooltip: 'Plan to watch / watching / caught up / finished / dropped. "Caught up" exists because a returning show cannot be finished.'
      }),
      tvSeason: b('Watched', 'optional', 'user', "response->>'progressStatus'", false),
      tvEpisode: b('Watched', 'optional', 'user', "response->>'progressStatus'", false),
      youtube: b('Watched', 'optional', 'user', "response->>'progressStatus'", false),
      podcast: b('Listened', 'optional', 'user', "response->>'progressStatus'", false),
      article: b('Read', 'optional', 'user', "response->>'progressStatus'", false),
      paper: b('Read', 'optional', 'user', "response->>'progressStatus'", false),
      claim: b('Verdict', 'typical', 'user', "response->>'verdict'", true, { tooltip: 'PLANNED — not written by CreateClaim today. Unverified / supported / contested / refuted' }),
      painting: b('Seen', 'optional', 'user', "response->>'progressStatus'", false, { tooltip: 'Want to see / seen in person / seen in reproduction only' })
    }
  },
  {
    id: 'identifier',
    generic: 'External ID',
    group: 'identity',
    valueType: 'text',
    tooltip: 'The stable third-party identifier used for deduplication',
    storage: 'jsonb',
    sortable: false,
    filterable: true,
    gapFallback: 'em-dash',
    bindings: {
      youtube: b('Video ID', 'required', 'api', "response->>'videoId'", false),
      movie: b('TMDB ID', 'required', 'api', "response->>'tmdbId'", false, {
        tooltip: 'TMDB movie id — the dedupe key. The IMDb id (tt…) is stored beside it from external_ids.',
        appearance: 'Monospace "693134"; the popover links themoviedb.org/movie/693134.'
      }),
      tvShow: b('TMDB ID', 'required', 'api', "response->>'tmdbId'", false, { appearance: 'Monospace "tv/1396".' }),
      tvSeason: b('TMDB key', 'required', 'api', "tmdbShowId + seasonNumber", false, { appearance: 'Monospace "tv/1396/season/5".' }),
      tvEpisode: b('TMDB key', 'required', 'api', "tmdbShowId + seasonNumber + episodeNumber", false, { appearance: 'Monospace "tv/1396/S05E14".' }),
      book: b('ISBN', 'typical', 'api', "response->>'isbn13'", false),
      podcast: b('GUID', 'required', 'api', "response->>'guid'", false),
      music: b('ISRC', 'typical', 'api', "response->>'isrc'", false),
      paper: b('DOI', 'required', 'api', "response->>'doi'", false),
      purchase: b('Order #', 'optional', 'user', "response->>'orderId'", false),
      place: b('Place ID', 'required', 'api', "response->>'placeId'", false),
      bible: b('Verse IDs', 'required', 'internal', 'verse_start_id–verse_end_id', false, {
        tooltip: 'Global verse ordinals (Genesis 1:1 = 1, John 3:16 = 26,137, Revelation 22:21 = 31,102). Duplicates are caught by the canonical url.',
        appearance: 'Monospace "18710–18724". Debug column — leave in the picker.'
      }),
      painting: b('Met ID', 'required', 'api', "response->>'objectID'", false, {
        tooltip: 'The Met object ID; the Wikidata QID beside it (response->>\'wikidataQid\') is the key that will dedupe the same painting across sources.',
        appearance: 'Monospace "met:436535 · Q18689458". Debug column — leave in the picker.'
      })
    }
  },
  {
    id: 'tags',
    generic: 'Tags',
    group: 'identity',
    valueType: 'tags',
    tooltip: 'Keywords describing the item',
    storage: 'jsonb',
    sortable: false,
    filterable: true,
    gapFallback: 'blank',
    bindings: Object.fromEntries(
      TYPES.filter((t) => t.id !== 'tvSeason' && t.id !== 'tvEpisode').map((t) => [
        t.id,
        isTmdb(t.id)
          ? b('Keywords', 'optional', 'api', "keywords (append_to_response=keywords)", false, {
              tooltip: 'TMDB keywords — community-curated, sometimes noisy. TMDB has none for seasons or episodes.'
            })
          : t.id === 'bible'
          ? b('Tags', 'optional', 'derived', '[testament, division] → tags', false, {
              tooltip: 'PLANNED (Q10, answer box unchecked) — e.g. "Old Testament, Major Prophets". Redundant with Genre while that column exists.'
            })
          : b('Tags', 'optional', t.ingestion === 'api' ? 'api' : 'user', "response->'tags'", false)
      ])
    )
  },
  {
    id: 'description',
    generic: 'Description',
    group: 'identity',
    valueType: 'longtext',
    tooltip: 'Long-form text for the item',
    storage: 'jsonb',
    sortable: false,
    filterable: false,
    gapFallback: 'blank',
    bindings: {
      youtube: b('Description', 'typical', 'api', "response->>'description'", false),
      movie: b('Synopsis', 'typical', 'api', "response->>'overview'", false, { tooltip: 'TMDB overview. The tagline sits above it in the details view.' }),
      tvShow: b('Overview', 'typical', 'api', "response->>'overview'", false),
      tvSeason: b('Overview', 'optional', 'api', "response->>'overview'", false, { tooltip: 'Season overview — often empty on TMDB.' }),
      tvEpisode: b('Overview', 'typical', 'api', "response->>'overview'", false, {
        tooltip: 'Episode overview. It spoils the plot, so it is off by default and blurred until hovered.',
        appearance: 'Blurred (filter: blur) in the popover and the details view until hovered or focused for 600ms.'
      }),
      book: b('Blurb', 'optional', 'api', "response->>'description'", false),
      article: b('Excerpt', 'typical', 'scrape', "response->>'excerpt'", false),
      podcast: b('Show notes', 'typical', 'api', "response->>'summary'", false),
      music: b('Notes', 'optional', 'user', "response->>'notes'", false),
      claim: b('Context', 'typical', 'user', "response->>'context'", false, { tooltip: 'PLANNED — not written by CreateClaim today' }),
      joke: b('Full text', 'required', 'user', "response->>'body'", true, { tooltip: 'The joke in full — the setup alone is the title' }),
      purchase: b('Notes', 'optional', 'user', "response->>'notes'", false),
      perspective: b('The take', 'required', 'internal', "response->>'body'", true),
      place: b('Notes', 'optional', 'user', "response->>'notes'", false),
      paper: b('Abstract', 'typical', 'api', "response->>'abstract'", false),
      bible: b('Text (BSB)', 'typical', 'internal', 'passageText(startVerseId, endVerseId) → bible_verse_text', false, {
        tooltip: 'Opening words of the passage in the Berean Standard Bible (public domain). Full text lives in the details modal.',
        appearance:
          'Serif, muted, line-clamp-1 of the first verse. Off by default: one passageText call per visible row unless the list query is batched.'
      })
    }
  },
  {
    id: 'createdAt',
    generic: 'Date Added',
    group: 'system',
    valueType: 'date',
    tooltip: 'Date added to Perspectize',
    storage: 'universal-column',
    sortable: true,
    filterable: true,
    gapFallback: 'em-dash',
    bindings: Object.fromEntries(
      TYPES.map((t) => [t.id, b('Date Added', 'required', 'derived', 'created_at', true)])
    )
  },
  {
    id: 'updatedAt',
    generic: 'Updated',
    group: 'system',
    valueType: 'date',
    tooltip: 'Last updated in Perspectize',
    storage: 'universal-column',
    sortable: true,
    filterable: false,
    gapFallback: 'em-dash',
    bindings: Object.fromEntries(
      TYPES.map((t) => [t.id, b('Updated', 'required', 'derived', 'updated_at', false)])
    )
  },
  {
    id: 'id',
    generic: 'Content ID',
    group: 'system',
    valueType: 'number',
    tooltip: 'Internal content record ID',
    storage: 'universal-column',
    sortable: true,
    filterable: false,
    gapFallback: 'em-dash',
    align: 'right',
    bindings: Object.fromEntries(
      TYPES.map((t) => [t.id, b('Content ID', 'required', 'derived', 'id', false)])
    )
  }
];

export const GROUP_LABELS: Record<ColumnDef['group'], string> = {
  identity: 'Identity',
  attribution: 'Attribution',
  scale: 'Scale',
  reception: 'Reception',
  temporal: 'Time & progress',
  economics: 'Economics',
  epistemic: 'Epistemic',
  system: 'System'
};

/**
 * A preview cell: plain text, or text with a muted subtitle line (e.g. a
 * passage's reference under its user-set title).
 */
export type SampleCell =
  | string
  | {
      text: string;
      /** Muted second line in the cell. */
      sub?: string;
      /** Thumbnail: a key into thumbs.ts, or an image URL. */
      img?: string;
      /** Where the thumbnail links (the source page). */
      href?: string;
      /** Cell popover body, when it says more than the cell (full list, both dates, vote count…). */
      tip?: string;
      /** What the popover's copy button copies — the raw value, not the display text. */
      copy?: string;
      /** Sort key when the display text does not sort correctly as text ("2h 47m", "S5 · E14"). */
      sort?: number;
      /** Multi-mode popover: a checklist with Copy selected / Copy all (genres, keywords). */
      items?: string[];
    };

/**
 * One sample row: values keyed by column id, plus any extra keys the details
 * view reads (cast, writers, tagline, episode list…), and `detail:<label>` keys
 * for modal-only fields. The grid ignores keys that are not column ids.
 */
export type SampleRow = Record<string, SampleCell>;

/**
 * Illustrative rows rendered under the header strip so a column decision can
 * be judged on real-looking values, not just its header. Keyed by column id;
 * a column a row does not mention renders the column's gap fallback.
 */
export const SAMPLES: Partial<Record<TypeId, SampleRow[]>> = {
  // TMDB family. Titles, ids, credits, dates and episode numbers are real;
  // scores, vote counts, budgets/revenue, whole-season runtimes, perspective
  // counts and "added" dates are illustrative. Extra keys (cast, writers, tagline,
  // seasonList, episodeList, prev/next…) feed the details view only.
  movie: [
    {
      year: '2024',
      item: { text: 'Dune: Part Two', sub: '2024', tip: 'Dune: Part Two (2024)', copy: 'Dune: Part Two' },
      series: 'Dune Collection',
      genre: { text: 'Science Fiction +1', items: ['Science Fiction', 'Adventure'] },
      certification: { text: 'PG-13', tip: 'PG-13 · US · theatrical', copy: 'PG-13', sort: 3 },
      creator: { text: 'Denis Villeneuve', tip: 'Directed by Denis Villeneuve · Written by Denis Villeneuve, Jon Spaihts', copy: 'Denis Villeneuve' },
      venue: 'Legendary Pictures',
      length: { text: '2h 47m', tip: '167 min', copy: '167', sort: 167 },
      date: { text: '2024-02-27', tip: 'Primary release 2024-02-27 · US theatrical 2024-03-01', copy: '2024-02-27' },
      releaseStatus: 'Released',
      audience: { text: '6,912', sort: 6912 },
      approval: { text: '81%', tip: '81% from 6,912 votes', copy: '8.1', sort: 81 },
      rating: '5 / 5',
      identifier: { text: '693134', tip: 'themoviedb.org/movie/693134 · IMDb tt15239678', copy: '693134' },
      tags: { text: 'desert, messiah, sequel +3', items: ['desert', 'messiah', 'sequel', 'based on novel or book', 'space opera', 'prophecy'] },
      description: 'Paul Atreides unites with the Fremen while on a path of revenge against the conspirators who destroyed his family.',
      createdAt: '2026-09-21',
      tmdbUrl: 'https://www.themoviedb.org/movie/693134',
      imdb: 'tt15239678',
      tagline: 'Long live the fighters.',
      writers: 'Denis Villeneuve; Jon Spaihts',
      cast: 'Timothée Chalamet — Paul Atreides; Zendaya — Chani; Rebecca Ferguson — Lady Jessica; Javier Bardem — Stilgar; Austin Butler — Feyd-Rautha',
      budget: '$190,000,000',
      revenue: '$714,444,358',
      usRelease: '2024-03-01 (theatrical)',
      perspectives: '3',
      avgRating: '4.3',
      updatedAt: '2026-09-25'
    },
    {
      year: '2023',
      item: { text: 'Oppenheimer', sub: '2023', copy: 'Oppenheimer' },
      genre: { text: 'Drama +1', items: ['Drama', 'History'] },
      certification: { text: 'R', tip: 'R · US · theatrical', copy: 'R', sort: 4 },
      creator: { text: 'Christopher Nolan', tip: 'Written and directed by Christopher Nolan', copy: 'Christopher Nolan' },
      venue: 'Syncopy',
      length: { text: '3h 1m', tip: '181 min', copy: '181', sort: 181 },
      date: { text: '2023-07-19', tip: 'Primary release 2023-07-19 · US theatrical 2023-07-21', copy: '2023-07-19' },
      releaseStatus: 'Released',
      audience: { text: '10,433', sort: 10433 },
      approval: { text: '81%', tip: '81% from 10,433 votes', copy: '8.1', sort: 81 },
      identifier: { text: '872585', copy: '872585' },
      tags: { text: 'atomic bomb, biography +2', items: ['atomic bomb', 'biography', 'physicist', 'world war ii'] },
      description: 'The story of J. Robert Oppenheimer and the development of the atomic bomb during the Second World War.',
      createdAt: '2026-09-14',
      tmdbUrl: 'https://www.themoviedb.org/movie/872585',
      imdb: 'tt15398776',
      tagline: 'The world forever changes.',
      writers: 'Christopher Nolan',
      cast: 'Cillian Murphy — J. Robert Oppenheimer; Emily Blunt — Kitty Oppenheimer; Matt Damon — Leslie Groves; Robert Downey Jr. — Lewis Strauss',
      budget: '$100,000,000',
      revenue: '$975,000,000',
      usRelease: '2023-07-21 (theatrical)',
      perspectives: '5',
      avgRating: '4.0',
      updatedAt: '2026-09-14'
    },
    {
      year: '2001',
      item: { text: 'Spirited Away', sub: '2001 · 千と千尋の神隠し', tip: 'Spirited Away (2001) · original title 千と千尋の神隠し', copy: 'Spirited Away' },
      genre: { text: 'Animation +2', items: ['Animation', 'Family', 'Fantasy'] },
      certification: { text: 'PG', tip: 'PG · US · theatrical', copy: 'PG', sort: 2 },
      creator: { text: 'Hayao Miyazaki', tip: 'Written and directed by Hayao Miyazaki', copy: 'Hayao Miyazaki' },
      venue: 'Studio Ghibli',
      length: { text: '2h 5m', tip: '125 min', copy: '125', sort: 125 },
      date: '2001-07-20',
      releaseStatus: 'Released',
      audience: { text: '17,120', sort: 17120 },
      approval: { text: '85%', tip: '85% from 17,120 votes', copy: '8.5', sort: 85 },
      rating: '5 / 5',
      identifier: { text: '129', copy: '129' },
      tags: { text: 'witch, spirit +2', items: ['witch', 'spirit', 'bathhouse', 'coming of age'] },
      description: 'A ten-year-old girl wanders into a world of spirits and must work in a bathhouse to free her parents.',
      createdAt: '2026-09-06',
      tmdbUrl: 'https://www.themoviedb.org/movie/129',
      imdb: 'tt0245429',
      originalTitle: '千と千尋の神隠し',
      writers: 'Hayao Miyazaki',
      cast: 'Rumi Hiiragi — Chihiro (voice); Miyu Irino — Haku (voice); Mari Natsuki — Yubaba (voice)',
      budget: '$19,000,000',
      revenue: '$274,925,095',
      perspectives: '1',
      avgRating: '5.0',
      updatedAt: '2026-09-06'
    },
    {
      year: '2010',
      item: { text: 'Inception', sub: '2010', copy: 'Inception' },
      genre: { text: 'Action +2', items: ['Action', 'Science Fiction', 'Adventure'] },
      certification: { text: 'PG-13', tip: 'PG-13 · US · theatrical', copy: 'PG-13', sort: 3 },
      creator: { text: 'Christopher Nolan', tip: 'Written and directed by Christopher Nolan', copy: 'Christopher Nolan' },
      venue: 'Legendary Pictures',
      length: { text: '2h 28m', tip: '148 min', copy: '148', sort: 148 },
      date: '2010-07-15',
      releaseStatus: 'Released',
      audience: { text: '37,504', sort: 37504 },
      approval: { text: '84%', tip: '84% from 37,504 votes', copy: '8.4', sort: 84 },
      identifier: { text: '27205', copy: '27205' },
      tags: { text: 'dream, heist +2', items: ['dream', 'heist', 'subconscious', 'mind'] },
      description: 'A thief who steals secrets through dream-sharing is offered a chance to have his record erased — if he can plant an idea instead.',
      createdAt: '2026-08-30',
      tmdbUrl: 'https://www.themoviedb.org/movie/27205',
      imdb: 'tt1375666',
      tagline: 'Your mind is the scene of the crime.',
      writers: 'Christopher Nolan',
      cast: 'Leonardo DiCaprio — Dom Cobb; Joseph Gordon-Levitt — Arthur; Elliot Page — Ariadne; Tom Hardy — Eames',
      budget: '$160,000,000',
      revenue: '$839,030,630',
      perspectives: '2',
      avgRating: '4.5',
      updatedAt: '2026-09-02'
    }
  ],
  tvShow: [
    {
      item: { text: 'Breaking Bad', sub: '2008–2013', copy: 'Breaking Bad' },
      genre: { text: 'Drama +1', items: ['Drama', 'Crime'] },
      certification: { text: 'TV-MA', copy: 'TV-MA', sort: 6 },
      creator: 'Vince Gilligan',
      venue: 'AMC',
      episodes: { text: '62', sub: '5 seasons', tip: 'S1 7 · S2 13 · S3 13 · S4 13 · S5 16 (+ Specials)', copy: '62', sort: 62 },
      date: { text: '2008-01-20', tip: 'First aired 2008-01-20 · Last aired 2013-09-29', copy: '2008-01-20' },
      releaseStatus: { text: '● Ended', copy: 'Ended' },
      audience: { text: '15,208', sort: 15208 },
      approval: { text: '89%', tip: '89% from 15,208 votes', copy: '8.9', sort: 89 },
      rating: '5 / 5',
      identifier: { text: 'tv/1396', copy: '1396' },
      tags: { text: 'drug dealer, chemistry +2', items: ['drug dealer', 'chemistry teacher', 'new mexico', 'cancer'] },
      description: 'A high-school chemistry teacher diagnosed with terminal cancer turns to making methamphetamine to secure his family’s future.',
      createdAt: '2026-09-01',
      tmdbUrl: 'https://www.themoviedb.org/tv/1396',
      imdb: 'tt0903747',
      years: '2008–2013',
      lastAired: '2013-09-29 · S5 E16 “Felina”',
      seasonList: 'Season 1 · 7 eps · 2008; Season 2 · 13 eps · 2009; Season 3 · 13 eps · 2010; Season 4 · 13 eps · 2011; Season 5 · 16 eps · 2012 ✓; Specials · 11 eps (season 0 — always last) ✓',
      cast: 'Bryan Cranston — Walter White; Aaron Paul — Jesse Pinkman; Anna Gunn — Skyler White; Dean Norris — Hank Schrader',
      perspectives: '4',
      avgRating: '4.8',
      updatedAt: '2026-09-20'
    },
    {
      item: { text: 'Severance', sub: '2022–', copy: 'Severance' },
      genre: { text: 'Drama +2', items: ['Drama', 'Mystery', 'Sci-Fi & Fantasy'] },
      certification: { text: 'TV-MA', copy: 'TV-MA', sort: 6 },
      creator: 'Dan Erickson',
      venue: 'Apple TV+',
      episodes: { text: '19', sub: '2 seasons', tip: 'S1 9 · S2 10', copy: '19', sort: 19 },
      date: { text: '2022-02-18', tip: 'First aired 2022-02-18 · Last aired 2025-03-21 · no next episode scheduled on TMDB', copy: '2022-02-18' },
      releaseStatus: { text: '● Returning Series', tip: 'Returning Series — renewed; no next episode date on TMDB yet', copy: 'Returning Series' },
      audience: { text: '2,410', sort: 2410 },
      approval: { text: '84%', tip: '84% from 2,410 votes', copy: '8.4', sort: 84 },
      identifier: { text: 'tv/95396', copy: '95396' },
      tags: { text: 'workplace, memory +1', items: ['workplace', 'memory', 'corporation'] },
      description: 'Office workers whose memories have been surgically split between work and personal life begin to question the arrangement.',
      createdAt: '2026-09-17',
      tmdbUrl: 'https://www.themoviedb.org/tv/95396',
      imdb: 'tt11280740',
      years: '2022–',
      lastAired: '2025-03-21 · S2 E10 “Cold Harbor”',
      nextEpisode: 'None scheduled on TMDB',
      seasonList: 'Season 1 · 9 eps · 2022 ✓; Season 2 · 10 eps · 2025',
      cast: 'Adam Scott — Mark Scout; Britt Lower — Helly R.; Zach Cherry — Dylan G.; John Turturro — Irving B.',
      perspectives: '2',
      avgRating: '4.5',
      updatedAt: '2026-09-17'
    },
    {
      item: { text: 'The Office', sub: '2005–2013', tip: 'The Office (US, 2005–2013)', copy: 'The Office' },
      genre: { text: 'Comedy', items: ['Comedy'] },
      certification: { text: 'TV-14', copy: 'TV-14', sort: 5 },
      creator: 'Greg Daniels',
      venue: 'NBC',
      episodes: { text: '201', sub: '9 seasons', tip: 'S1 6 · S2 22 · S3 25 · S4 19 · S5 28 · S6 26 · S7 26 · S8 24 · S9 25 (TMDB splits some double episodes)', copy: '201', sort: 201 },
      date: { text: '2005-03-24', tip: 'First aired 2005-03-24 · Last aired 2013-05-16', copy: '2005-03-24' },
      releaseStatus: { text: '● Ended', copy: 'Ended' },
      audience: { text: '4,121', sort: 4121 },
      approval: { text: '86%', tip: '86% from 4,121 votes', copy: '8.6', sort: 86 },
      identifier: { text: 'tv/2316', copy: '2316' },
      description: 'A mockumentary about the everyday lives of the employees of a paper company’s Scranton branch.',
      createdAt: '2026-09-09',
      tmdbUrl: 'https://www.themoviedb.org/tv/2316',
      imdb: 'tt0386676',
      years: '2005–2013',
      lastAired: '2013-05-16 · S9 E23 “Finale”',
      seasonList: 'Season 1 · 6 eps · 2005; Season 2 · 22 eps · 2005 ✓; Season 3 · 25 eps · 2006; … 6 more',
      cast: 'Steve Carell — Michael Scott; Rainn Wilson — Dwight Schrute; John Krasinski — Jim Halpert; Jenna Fischer — Pam Beesly',
      perspectives: '1',
      avgRating: '4.0',
      updatedAt: '2026-09-09'
    }
  ],
  tvSeason: [
    {
      item: { text: 'Season 5', sub: 'Breaking Bad', tip: 'Breaking Bad › Season 5 · 16 episodes', copy: 'Breaking Bad — Season 5' },
      series: { text: 'Breaking Bad', tip: 'Breaking Bad (2008–2013) · added with this item if it was new', copy: 'Breaking Bad' },
      position: { text: 'S5', sort: 5 },
      genre: { text: 'Drama +1', items: ['Drama', 'Crime'] },
      certification: { text: 'TV-MA', sort: 6 },
      creator: 'Vince Gilligan',
      venue: 'AMC',
      length: { text: '12h 32m', tip: '752 min total · ~47m per episode', copy: '752', sort: 752 },
      episodes: { text: '16', sort: 16 },
      date: { text: '2012-07-15', tip: 'Premiered 2012-07-15 · Finale 2013-09-29', copy: '2012-07-15' },
      approval: { text: '88%', tip: '88% — TMDB gives no vote count for seasons', copy: '8.8', sort: 88 },
      identifier: { text: 'tv/1396/season/5', copy: '1396/5' },
      description: 'Walt and Jesse build a new operation — and the walls start closing in.',
      createdAt: '2026-09-12',
      tmdbUrl: 'https://www.themoviedb.org/tv/1396/season/5',
      finale: '2013-09-29',
      episodeList: 'E1 · Live Free or Die · 2012-07-15; E2 · Madrigal · 2012-07-22; E3 · Hazard Pay · 2012-07-29; … ; E14 · Ozymandias · 2013-09-15 ✓; E15 · Granite State · 2013-09-22; E16 · Felina · 2013-09-29 ✓',
      perspectives: '2',
      avgRating: '4.5',
      updatedAt: '2026-09-12'
    },
    {
      item: { text: 'Specials', sub: 'Breaking Bad', tip: 'Breaking Bad › Specials (season 0) · extras, sorted after Season 5', copy: 'Breaking Bad — Specials' },
      series: { text: 'Breaking Bad', tip: 'Breaking Bad (2008–2013)', copy: 'Breaking Bad' },
      position: { text: 'S0 · Specials', tip: 'Season 0 on TMDB, sorted after every regular season', copy: 'S00', sort: 10000 },
      genre: { text: 'Drama +1', items: ['Drama', 'Crime'] },
      certification: { text: 'TV-MA', sort: 6 },
      creator: 'Vince Gilligan',
      venue: 'AMC',
      episodes: { text: '11', sort: 11 },
      date: { text: '2009-02-17', tip: 'Illustrative: specials air throughout the run, so this date says little about order', copy: '2009-02-17' },
      identifier: { text: 'tv/1396/season/0', copy: '1396/0' },
      description: 'Minisodes and extras released alongside the series.',
      createdAt: '2026-09-22',
      tmdbUrl: 'https://www.themoviedb.org/tv/1396/season/0',
      episodeList: 'E1; E2; E3; … ; E11 — minisodes and extras, titles from TMDB, in episode-number order',
      perspectives: '0',
      avgRating: '—',
      updatedAt: '2026-09-22'
    },
    {
      item: { text: 'Season 1', sub: 'Severance', tip: 'Severance › Season 1 · 9 episodes', copy: 'Severance — Season 1' },
      series: { text: 'Severance', tip: 'Severance (2022–) · added with this item if it was new', copy: 'Severance' },
      position: { text: 'S1', sort: 1 },
      genre: { text: 'Drama +2', items: ['Drama', 'Mystery', 'Sci-Fi & Fantasy'] },
      certification: { text: 'TV-MA', sort: 6 },
      creator: 'Dan Erickson',
      venue: 'Apple TV+',
      length: { text: '7h 32m', tip: '452 min total · ~50m per episode', copy: '452', sort: 452 },
      episodes: { text: '9', sort: 9 },
      date: { text: '2022-02-18', tip: 'Premiered 2022-02-18 (E1 and E2 together) · Finale 2022-04-08', copy: '2022-02-18' },
      approval: { text: '86%', tip: '86% — TMDB gives no vote count for seasons', copy: '8.6', sort: 86 },
      identifier: { text: 'tv/95396/season/1', copy: '95396/1' },
      createdAt: '2026-09-18',
      tmdbUrl: 'https://www.themoviedb.org/tv/95396/season/1',
      finale: '2022-04-08',
      episodeList: 'E1 · Good News About Hell · 2022-02-18; E2 · Half Loop · 2022-02-18; E3 · In Perpetuity · 2022-02-25; … ; E9 · The We We Are · 2022-04-08 ✓',
      perspectives: '1',
      avgRating: '5.0',
      updatedAt: '2026-09-18'
    },
    {
      item: { text: 'Season 2', sub: 'The Office', tip: 'The Office › Season 2 · 22 episodes', copy: 'The Office — Season 2' },
      series: { text: 'The Office', tip: 'The Office (2005–2013) · added with this item if it was new', copy: 'The Office' },
      position: { text: 'S2', sort: 2 },
      genre: { text: 'Comedy', items: ['Comedy'] },
      certification: { text: 'TV-14', sort: 5 },
      creator: 'Greg Daniels',
      venue: 'NBC',
      length: { text: '8h 4m', tip: '484 min total · ~22m per episode', copy: '484', sort: 484 },
      episodes: { text: '22', sort: 22 },
      date: { text: '2005-09-20', tip: 'Premiered 2005-09-20 · Finale 2006-05-11', copy: '2005-09-20' },
      approval: { text: '84%', tip: '84% — TMDB gives no vote count for seasons', copy: '8.4', sort: 84 },
      rating: '4 / 5',
      identifier: { text: 'tv/2316/season/2', copy: '2316/2' },
      createdAt: '2026-09-10',
      tmdbUrl: 'https://www.themoviedb.org/tv/2316/season/2',
      finale: '2006-05-11',
      episodeList: 'E1 · The Dundies · 2005-09-20 ✓; E2 · Sexual Harassment · 2005-09-27; E3 · Office Olympics · 2005-10-04; … ; E22 · Casino Night · 2006-05-11',
      perspectives: '1',
      avgRating: '4.0',
      updatedAt: '2026-09-10'
    }
  ],
  tvEpisode: [
    {
      item: { text: 'Ozymandias', sub: 'Breaking Bad · S5 E14', tip: 'Breaking Bad › Season 5 › E14 “Ozymandias”', copy: 'Breaking Bad S05E14 — Ozymandias' },
      series: { text: 'Breaking Bad', tip: 'Breaking Bad (2008–2013) · added with this item if it was new', copy: 'Breaking Bad' },
      position: { text: 'S5 · E14', tip: 'Season 5, episode 14 · episode 60 of 62', copy: 'S05E14', sort: 5014 },
      genre: { text: 'Drama +1', items: ['Drama', 'Crime'] },
      certification: { text: 'TV-MA', sort: 6 },
      creator: { text: 'Rian Johnson', tip: 'Directed by Rian Johnson · Written by Moira Walley-Beckett', copy: 'Rian Johnson' },
      venue: 'AMC',
      length: { text: '47m', tip: '47 min', copy: '47', sort: 47 },
      date: '2013-09-15',
      releaseStatus: 'standard',
      audience: { text: '1,610', sort: 1610 },
      approval: { text: '93%', tip: '93% from 1,610 votes', copy: '9.3', sort: 93 },
      rating: '5 / 5',
      identifier: { text: 'tv/1396/S05E14', copy: '1396/5/14' },
      description: 'Everything Walt has built comes apart in a single afternoon in the desert.',
      createdAt: '2026-09-13',
      tmdbUrl: 'https://www.themoviedb.org/tv/1396/season/5/episode/14',
      seasonName: 'Season 5',
      writers: 'Moira Walley-Beckett',
      guestStars: 'Steven Michael Quezada — Steven Gomez; Michael Bowen — Jack Welker',
      prev: 'S5 E13 · To’hajiilee',
      next: 'S5 E15 · Granite State',
      perspectives: '6',
      avgRating: '4.9',
      updatedAt: '2026-09-13'
    },
    {
      item: { text: 'Felina', sub: 'Breaking Bad · S5 E16', tip: 'Breaking Bad › Season 5 › E16 “Felina” · series finale', copy: 'Breaking Bad S05E16 — Felina' },
      series: { text: 'Breaking Bad', tip: 'Breaking Bad (2008–2013) · added with this item if it was new', copy: 'Breaking Bad' },
      position: { text: 'S5 · E16', tip: 'Season 5, episode 16 · episode 62 of 62', copy: 'S05E16', sort: 5016 },
      genre: { text: 'Drama +1', items: ['Drama', 'Crime'] },
      certification: { text: 'TV-MA', sort: 6 },
      creator: { text: 'Vince Gilligan', tip: 'Written and directed by Vince Gilligan', copy: 'Vince Gilligan' },
      venue: 'AMC',
      length: { text: '55m', tip: '55 min', copy: '55', sort: 55 },
      date: '2013-09-29',
      releaseStatus: 'finale',
      audience: { text: '1,122', sort: 1122 },
      approval: { text: '91%', tip: '91% from 1,122 votes', copy: '9.1', sort: 91 },
      identifier: { text: 'tv/1396/S05E16', copy: '1396/5/16' },
      description: 'Walt returns to New Mexico to settle his affairs one last time.',
      createdAt: '2026-09-15',
      tmdbUrl: 'https://www.themoviedb.org/tv/1396/season/5/episode/16',
      seasonName: 'Season 5',
      writers: 'Vince Gilligan',
      guestStars: 'Jesse Plemons — Todd Alquist; Laura Fraser — Lydia Rodarte-Quayle',
      prev: 'S5 E15 · Granite State',
      perspectives: '3',
      avgRating: '4.7',
      updatedAt: '2026-09-15'
    },
    {
      item: { text: 'The We We Are', sub: 'Severance · S1 E9', tip: 'Severance › Season 1 › E9 “The We We Are” · season finale', copy: 'Severance S01E09 — The We We Are' },
      series: { text: 'Severance', tip: 'Severance (2022–) · added with this item if it was new', copy: 'Severance' },
      position: { text: 'S1 · E9', tip: 'Season 1, episode 9 · episode 9 of 19', copy: 'S01E09', sort: 1009 },
      genre: { text: 'Drama +2', items: ['Drama', 'Mystery', 'Sci-Fi & Fantasy'] },
      certification: { text: 'TV-MA', sort: 6 },
      creator: { text: 'Ben Stiller', tip: 'Directed by Ben Stiller · Written by Dan Erickson', copy: 'Ben Stiller' },
      venue: 'Apple TV+',
      length: { text: '40m', tip: '40 min', copy: '40', sort: 40 },
      date: '2022-04-08',
      releaseStatus: 'finale',
      audience: { text: '402', sort: 402 },
      approval: { text: '92%', tip: '92% from 402 votes', copy: '9.2', sort: 92 },
      identifier: { text: 'tv/95396/S01E09', copy: '95396/1/9' },
      description: 'The innies get a few hours on the outside, and each learns something they were never meant to.',
      createdAt: '2026-09-19',
      tmdbUrl: 'https://www.themoviedb.org/tv/95396/season/1/episode/9',
      seasonName: 'Season 1',
      writers: 'Dan Erickson',
      prev: 'S1 E8 · What’s for Dinner?',
      next: 'S2 E1 · Hello, Ms. Cobel',
      perspectives: '2',
      avgRating: '5.0',
      updatedAt: '2026-09-19'
    },
    {
      item: { text: 'The Dundies', sub: 'The Office · S2 E1', tip: 'The Office › Season 2 › E1 “The Dundies”', copy: 'The Office S02E01 — The Dundies' },
      series: { text: 'The Office', tip: 'The Office (2005–2013) · added with this item if it was new', copy: 'The Office' },
      position: { text: 'S2 · E1', tip: 'Season 2, episode 1 · episode 7 of 201', copy: 'S02E01', sort: 2001 },
      genre: { text: 'Comedy', items: ['Comedy'] },
      certification: { text: 'TV-14', sort: 5 },
      creator: { text: 'Greg Daniels', tip: 'Directed by Greg Daniels · Written by Mindy Kaling', copy: 'Greg Daniels' },
      venue: 'NBC',
      length: { text: '22m', tip: '22 min', copy: '22', sort: 22 },
      date: '2005-09-20',
      releaseStatus: 'standard',
      audience: { text: '288', sort: 288 },
      approval: { text: '78%', tip: '78% from 288 votes', copy: '7.8', sort: 78 },
      identifier: { text: 'tv/2316/S02E01', copy: '2316/2/1' },
      description: 'Michael hosts the annual office awards at a local restaurant.',
      createdAt: '2026-09-10',
      tmdbUrl: 'https://www.themoviedb.org/tv/2316/season/2/episode/1',
      seasonName: 'Season 2',
      writers: 'Mindy Kaling',
      prev: 'S1 E6 · Hot Girl',
      next: 'S2 E2 · Sexual Harassment',
      perspectives: '1',
      avgRating: '4.0',
      updatedAt: '2026-09-10'
    }
  ],
  // Illustrative only — made-up channels and figures, there so a mixed
  // YouTube + Bible passage selection has something to sort against.
  youtube: [
    {
      item: 'Expository sermon: The Beatitudes (Matthew 5:1-12)',
      creator: 'Example Church',
      length: '52:14',
      date: '2025-03-09',
      audience: '18,402',
      approval: '4.1%',
      category: 'Sermon',
      createdAt: '2026-09-03'
    },
    {
      item: 'Overview: Isaiah 40–66 in eight minutes',
      creator: 'Example Bible Project',
      length: '8:05',
      date: '2024-11-21',
      audience: '1,204,881',
      approval: '3.2%',
      category: 'Bible study',
      createdAt: '2026-09-11'
    },
    {
      item: 'Q&A: Reading Revelation without fear',
      creator: 'Example Seminary',
      length: '1:12:40',
      date: '2026-01-15',
      audience: '6,730',
      approval: '5.0%',
      createdAt: '2026-09-19'
    }
  ],
  // One passage per canonical division (data/bible/books.json on
  // feature/bible-outbound-links). Verse ids and opening lines are real —
  // computed from versesPerChapter and copied from data/bible/bsb.tsv.
  // Titles are the optional, set-once display_title; untitled rows show the
  // reference alone. Single-verse, same-chapter and cross-chapter references
  // are all represented so each CanonicalPassageName shape appears.
  bible: [
    {
      item: 'Deuteronomy 6:4-9',
      genre: 'Torah · OT',
      venue: 'Deuteronomy · #5',
      length: '105',
      identifier: '5091–5096',
      description: 'Hear, O Israel: The LORD our God, the LORD is One.',
      category: 'Shema',
      createdAt: '2026-09-02'
    },
    {
      item: 'Ruth 1:16-17',
      genre: 'History · OT',
      venue: 'Ruth · #8',
      length: '72',
      identifier: '7144–7145',
      description: 'But Ruth replied: “Do not urge me to leave you or to turn from following you…',
      createdAt: '2026-09-04'
    },
    {
      item: { text: 'The Lord is my shepherd', sub: 'Psalms 23:1-6' },
      genre: 'Wisdom · OT',
      venue: 'Psalms · #19',
      length: '120',
      identifier: '14237–14242',
      description: 'A Psalm of David. The LORD is my shepherd; I shall not want.',
      category: 'Psalm 23',
      createdAt: '2026-09-05'
    },
    {
      item: { text: 'The Suffering Servant', sub: 'Isaiah 52:13-53:12' },
      genre: 'Major Prophets · OT',
      venue: 'Isaiah · #23',
      length: '453',
      identifier: '18710–18724',
      description: 'Behold, My Servant will prosper; He will be raised and lifted up and highly exalted.',
      category: 'Messianic prophecy',
      createdAt: '2026-09-08'
    },
    {
      item: 'Micah 6:8',
      genre: 'Minor Prophets · OT',
      venue: 'Micah · #33',
      length: '31',
      identifier: '22657',
      description: 'He has shown you, O man, what is good. And what does the LORD require of you…',
      category: 'Social justice',
      createdAt: '2026-09-10'
    },
    {
      item: { text: 'The Word became flesh', sub: 'John 1:1-14' },
      genre: 'Gospels · NT',
      venue: 'John · #43',
      length: '224',
      identifier: '26046–26059',
      description: 'In the beginning was the Word, and the Word was with God, and the Word was God.',
      category: 'Incarnation',
      createdAt: '2026-09-12'
    },
    {
      item: 'Acts 2:42-47',
      genre: 'Acts · NT',
      venue: 'Acts · #44',
      length: '109',
      identifier: '26992–26997',
      description: 'They devoted themselves to the apostles’ teaching and to the fellowship, to the breaking of bread…',
      createdAt: '2026-09-15'
    },
    {
      item: { text: 'The Way of Love', sub: '1 Corinthians 13:1-13' },
      genre: 'Pauline Epistles · NT',
      venue: '1 Corinthians · #46',
      length: '269',
      identifier: '28667–28679',
      description: 'If I speak in the tongues of men and of angels, but have not love, I am only a ringing gong…',
      category: 'Love',
      createdAt: '2026-09-18'
    },
    {
      item: 'James 1:2-4',
      genre: 'General Epistles · NT',
      venue: 'James · #59',
      length: '41',
      identifier: '30269–30271',
      description: 'Consider it pure joy, my brothers, when you encounter trials of many kinds,',
      createdAt: '2026-09-20'
    },
    {
      item: 'Revelation 21:1-4',
      genre: 'Apocalyptic · NT',
      venue: 'Revelation · #66',
      length: '117',
      identifier: '31055–31058',
      description: 'Then I saw a new heaven and a new earth, for the first heaven and earth had passed away…',
      category: 'New creation',
      createdAt: '2026-09-23'
    }
  ],
  // Real Met records, fetched 2026-09-26 from /public/collection/v1/objects/{id}.
  // Chosen to exercise the edge cases: an approximate date (Vermeer, sorted by
  // objectBeginDate 1657), a blank classification (Leutze, The American Wing —
  // why the gate is objectName), a non-oil-on-canvas medium (Bruegel), and a
  // painting with no open-access image (Monet 437127 → Commons fallback).
  painting: [
    {
      item: { text: 'Wheat Field with Cypresses', sub: 'met:436535', img: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP-42549-001.jpg', href: 'https://www.metmuseum.org/art/collection/search/436535' },
      genre: 'Oil on canvas',
      creator: 'Vincent van Gogh',
      venue: 'The Met · European Paintings',
      date: '1889',
      identifier: 'met:436535 · Q18689458',
      'detail:Artist bio': 'Dutch, Zundert 1853–1890 Auvers-sur-Oise',
      'detail:Dimensions': '28 13/16 × 36 3/4 in. (73.2 × 93.4 cm)',
      'detail:Credit line': 'Purchase, The Annenberg Foundation Gift, 1993',
      'detail:Image rights': 'Public domain (CC0)',
      tags: 'Landscapes, Cypresses, Summer',
      category: 'Post-Impressionism',
      createdAt: '2026-09-26'
    },
    {
      item: { text: 'Young Woman with a Water Pitcher', sub: 'met:437881', img: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP353257.jpg', href: 'https://www.metmuseum.org/art/collection/search/437881' },
      genre: 'Oil on canvas',
      creator: 'Johannes Vermeer',
      venue: 'The Met · European Paintings',
      date: 'ca. 1662',
      identifier: 'met:437881 · Q386453',
      'detail:Artist bio': 'Dutch, Delft 1632–1675 Delft',
      'detail:Dimensions': '18 x 16 in. (45.7 x 40.6 cm)',
      'detail:Credit line': 'Marquand Collection, Gift of Henry G. Marquand, 1889',
      'detail:Image rights': 'Public domain (CC0)',
      tags: 'Interiors, Women, Maps, Pitchers',
      category: 'Dutch Golden Age',
      createdAt: '2026-09-26'
    },
    {
      item: { text: 'Washington Crossing the Delaware', sub: 'met:11417', img: 'https://images.metmuseum.org/CRDImages/ad/web-large/DP215410.jpg', href: 'https://www.metmuseum.org/art/collection/search/11417' },
      genre: 'Oil on canvas',
      creator: 'Emanuel Leutze',
      venue: 'The Met · The American Wing',
      date: '1851',
      identifier: 'met:11417 · Q509806',
      tags: 'Soldiers, American Revolution, George Washington',
      category: 'History painting',
      createdAt: '2026-09-26'
    },
    {
      item: { text: 'The Harvesters', sub: 'met:435809', img: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP119115.jpg', href: 'https://www.metmuseum.org/art/collection/search/435809' },
      genre: 'Oil on oak',
      creator: 'Pieter Bruegel the Elder',
      venue: 'The Met · European Paintings',
      date: '1565',
      identifier: 'met:435809 · Q776175',
      tags: 'Food, Landscapes, Working, Eating',
      createdAt: '2026-09-26'
    },
    {
      item: { text: 'Bridge over a Pond of Water Lilies', sub: 'met:437127 · image via Commons', img: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bridge%20Over%20a%20Pond%20of%20Water%20Lilies%2C%20Claude%20Monet%201899.jpg?width=400', href: 'https://www.metmuseum.org/art/collection/search/437127' },
      genre: 'Oil on canvas',
      creator: 'Claude Monet',
      venue: 'The Met · European Paintings',
      date: '1899',
      identifier: 'met:437127 · Q19905213',
      'detail:Dimensions': '36 1/2 x 29 in. (92.7 x 73.7 cm)',
      'detail:Image rights': 'Not open access at the Met — image from Wikimedia Commons (public domain)',
      tags: 'Bridges, Ponds, Water Lilies',
      category: 'Impressionism',
      createdAt: '2026-09-26'
    }
  ]
};

/**
 * One fully populated row per type — every binding the type declares has a
 * value — for the preview's "Full" state. Types without one get labelled
 * placeholders for the missing cells instead.
 */
export const SAMPLE_FULL: Partial<Record<TypeId, SampleRow>> = {
  painting: {
    item: {
      text: 'Young Woman with a Water Pitcher',
      sub: 'met:437881',
      img: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP353257.jpg',
      href: 'https://www.metmuseum.org/art/collection/search/437881'
    },
    genre: 'Oil on canvas',
    creator: { text: 'Johannes Vermeer', sub: 'Dutch, Delft 1632–1675 Delft' },
    venue: { text: 'The Met', sub: 'European Paintings' },
    date: 'ca. 1662',
    rating: '★★★★★',
    status: 'Seen in person',
    identifier: 'met:437881 · Q386453',
    tags: 'Interiors, Women, Maps, Pitchers',
    category: 'Dutch Golden Age',
    createdAt: '2026-09-26',
    updatedAt: '2026-09-26',
    id: '4812',
    'detail:Artist bio': 'Dutch, Delft 1632–1675 Delft',
    'detail:Dimensions': '18 x 16 in. (45.7 x 40.6 cm)',
    'detail:Credit line': 'Marquand Collection, Gift of Henry G. Marquand, 1889',
    'detail:Image rights': 'Public domain (CC0)'
  }
};
