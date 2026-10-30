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
/**
 * The museum family (2026-10-29): Painting, Sculpture, Drawing, Print and
 * Photograph are independent types fed by the same two APIs. A Met or
 * Europeana URL does not say which one it is, so they share one link rule and
 * the backend routes after fetching. Routing must use the record's own type
 * fields — the Met search `medium=` filter leaks across all five (medium=Prints
 * returned platinum photographs, books and a Daumier drawing; medium=Sculpture a
 * vase, a period room and an oil lamp), and Europeana's what: query matches
 * subjects (what:photograph returned paintings at the Finnish National Gallery).
 */
const MUSEUM_DETECT = {
    hosts: ['metmuseum.org', 'www.metmuseum.org', 'europeana.eu', 'www.europeana.eu'],
    // One pattern for both hosts: group 1 is "436535" (Met) or "90402/SK_A_2344" (Europeana).
    // It does not tie a path shape to its host — the backend re-checks that.
    path: '^/(?:art/collection/search|(?:[a-z]{2}/)?item)/(\\d+(?:/[^/]+)?)/?$',
    routedBy: 'Met objectName + classification; Europeana proxy dcType concept (data.europeana.eu/concept/47 Painting, 51 Sculpture, 35 Drawing, 2538 Print, 48 Photograph), else its Wikidata/Getty AAT URI, else the English label. No match → "Select a type", never a guess',
    examples: [
        'https://www.metmuseum.org/art/collection/search/436535',
        'https://www.metmuseum.org/art/collection/search/242008',
        'https://www.metmuseum.org/art/collection/search/45434',
        'https://www.europeana.eu/en/item/90402/SK_A_2344',
        'https://www.europeana.eu/item/90402/RP_F_00_588',
        'https://www.metmuseum.org/art/collection/search/437127?ft=monet',
        'https://www.europeana.eu/en/search?query=vermeer'
    ]
};
/** Europeana record path plus the per-type gate, shared wording for the family. */
const EUROPEANA_RECORD = 'Europeana Record API v2 — GET api.europeana.eu/record/v2/{datasetId}/{localId}.json?wskey=…; free key, kept on the backend';
export const TYPES = [
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
            search: 'youtube.com/results?search_query=… in a new tab. search.list is capped at 100 calls/day per project (signing users in does not change that), so the app never calls it; a YouTube link pasted into the same box is added directly',
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
        enrichment: 'none external — reference parsed locally (PassagePicker / free text / pasted Bible Gateway URL); text served from seeded bible_verse_text (BSB, CC0) via passageText()',
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
            feedSource: 'biblegateway.com/votd/get/?format=json&version=NIV (keyless, undocumented widget feed; BSB is not an accepted version) — keep only votd.reference, parse it with the existing reference parser, show the passage text from seeded BSB. Fallback: labs.bible.org/api/?passage=votd&type=json',
            refresh: 'once a day, cached by the backend',
            fetchFrom: 'backend',
            filters: [],
            reason: 'Searching passages is already covered: the Add Content card parses typed references. A daily verse is the one discovery feed the type naturally has. Backend fetch because Bible Gateway sends no CORS header, and caching keeps the card up if the undocumented feed breaks.'
        }
    },
    {
        // Research 2026-09-26: The Met Collection API won on every axis that
        // matters here — keyless, CC0 images, one request per painting, 80 req/s.
        // Harvard (non-commercial only), Rijksmuseum (old API 410 Gone; new Linked
        // Art API needs 3 hops per image), Europeana (per-item rights) and AIC
        // (60 req/min, ~2k public-domain paintings) were ruled out as primary.
        // Wikidata (~408k paintings with images) is the phase-2 source.
        //
        // 2026-10-29: Europeana added as the second source, so the seed shows two
        // real catalogues side by side. ~100k open-reuse paintings (what:painting,
        // TYPE:IMAGE, reusability=open) from Rijksmuseum, Mauritshuis, Finnish
        // National Gallery, MNAC and others. Every Europeana binding below names
        // the EDM path it reads; "Met | Europeana" in a path means one path per source.
        // Findings from the five sample records: the same field lives in different
        // EDM properties per provider (Rijksmuseum's dctermsMedium is a credit line,
        // its medium is in dcFormat), dates can arrive URL-encoded ("#1665%2F1665"),
        // records carry no QID for the painting itself, and what:painting leaks
        // photographs (a 1931 funeral came back for "Gallen-Kallela").
        id: 'painting',
        label: 'Painting',
        plural: 'Paintings',
        enumValue: 'PAINTING',
        gist: 'A fine-art painting as a work held in a collection — not house, decorative or protective painting.',
        ingestion: 'api',
        enrichment: 'Two sources, one per URL. (1) The Met Collection API — GET collectionapi.metmuseum.org/public/collection/v1/objects/{objectID}; keyless, CC0 open-access images; 14,422 hits for v1.1/search?medium=Paintings&hasImages=true. Accept only objectName = "Painting" (classification is blank for some departments, e.g. The American Wing). (2) ' +
            'Europeana Record API v2 — GET api.europeana.eu/record/v2/{datasetId}/{localId}.json?wskey=…; free key, kept on the backend. Accept when proxy dcType carries data.europeana.eu/concept/47, Wikidata Q3305213 or Getty AAT 300177435/300054216, or an English label "painting"; type = IMAGE; edmRights set. Phase 2: Wikidata (P31 = Q3305213) for paintings in neither. Any other Met or Europeana record is routed to its own museum type (see MUSEUM_DETECT)',
        urlRequired: true,
        urlPattern: 'metmuseum.org/art/collection/search/<objectID> | europeana.eu/[<lang>/]item/<datasetId>/<localId> (phase 2: wikidata.org/wiki/<Q-id>). Stored url is the canonical source page: objectURL for the Met, edmLandingPage (www.europeana.eu/item/…) for Europeana — never the provider site, which can change',
        identity: 'met:<objectID> | europeana:/<datasetId>/<localId>. Also store the painting\'s Wikidata QID as the cross-source dedup key: the Met gives it (objectWikidata_URL); Europeana does not, so resolve it once on ingest from Wikidata P217 (inventory number, dcIdentifier) scoped by P195 (collection) — the inventory number alone is ambiguous ("670" is both Girl with a Pearl Earring at the Mauritshuis and a Holy Family at the Rijksmuseum)',
        icon: 'palette',
        accent: '#8E3B46',
        sharesUrlSpace: false,
        thumbnail: 'Met: primaryImageSmall (images.metmuseum.org web-large JPEG, CC0); when blank (isPublicDomain = false, e.g. Monet 437127) fall back to Wikidata P18 → commons.wikimedia.org/wiki/Special:FilePath/<file>?width=400 with its Commons attribution. Europeana: europeanaAggregation.edmPreview (api.europeana.eu/thumbnail/v2 — Europeana\'s cached copy, so provider hosts are never hotlinked), allowed for every rights statement because Europeana serves it as a preview; the full-size edmIsShownBy is used only when edmRights is open. Else a palette icon tile. Click opens url',
        detect: MUSEUM_DETECT,
        discover: {
            placement: 'search-and-feed',
            status: 'proposed',
            search: 'One box, two sources, results interleaved and labelled "The Met" / "Europeana". Met: v1.1/search?medium=Paintings&hasImages=true&q=…&offset=…&limit=24 (v1/search was retired 2026-10-01) returns object IDs only; fetch /objects/{id} per card. Re-check objectName = "Painting" and a non-blank image (both filters leak: a gold icon and a fan came back for medium=Paintings; hasImages kept Monet 437127), and skip 404s (search returns deleted IDs, e.g. 12765). Europeana: record/v2/search.json?query=…&qf=TYPE:IMAGE&qf=what:painting&reusability=open&profile=standard, 24 rows a page with cursor paging — one call returns everything a card needs. Re-check the painting gate per item (what:painting matched funeral photographs of Gallen-Kallela).',
            searchMode: 'in-app',
            feedLabel: 'Trending paintings',
            feedKind: 'trending',
            feedSource: 'Neither source has popularity data. Rank the Met painting highlights (v1.1/search?isHighlight=true&medium=Paintings, then the objectName gate) by 7-day English Wikipedia pageviews: Met objectWikidata_URL → enwiki sitelink → wikimedia.org/api/rest_v1/metrics/pageviews/per-article. Highlights with no enwiki article (2 of the 6 samples) sort after, by title; label the feed "Featured" if pageviews are unavailable. Europeana joins the feed only through rows already in Perspectize whose QID resolved — its "featured" galleries are curated stories, not a ranking.',
            refresh: 'daily backend job; the page reads the stored ranking',
            fetchFrom: 'backend',
            filters: ['Source (The Met / Europeana)', 'Era (dateBegin/dateEnd · Europeana year)', 'Department / providing museum', 'On view now (Met GalleryNumber)', 'Open reuse only (rights)'],
            reason: 'Paintings are browsed, not pasted: most users will find one on Discover rather than arrive with a URL. Ranking runs on the backend because it takes ~840 lookups. Met search can stay in the browser (Access-Control-Allow-Origin: *, add collectionapi.metmuseum.org to connect-src); Europeana search goes through the backend because it needs the API key.'
        },
        detailOnly: [
            { label: 'Artist bio', path: "Met response->>'artistDisplayBio' | Europeana agents[creator].begin–end (dates only; no birthplace)" },
            { label: 'Dimensions', path: "Met response->>'dimensions' | Europeana proxy dctermsExtent or dcFormat (free text, provider language)" },
            { label: 'Credit line', path: "Met response->>'creditLine' | Europeana: none reliable (Rijksmuseum puts it in dctermsMedium)" },
            { label: 'Inventory no.', path: "Met response->>'accessionNumber' | Europeana proxy dcIdentifier (the non-URI entry)" },
            { label: 'Provided via', path: "Europeana only: aggregation edmProvider → organizations[].prefLabel (the aggregator, e.g. Dutch Collections for Europe)" },
            { label: 'Image rights', path: "Met response->>'isPublicDomain' (+ Commons attribution when the image is the fallback) | Europeana aggregation edmRights (rightsstatements.org / Creative Commons URI)" }
        ]
    },
    {
        // Museum family. Same sources, link rule, rights model and details layout
        // as Painting; what differs per type is the gate, the identity rule and
        // what Medium / Artist / Date mean. Met counts are v1.1/search hits with
        // hasImages=true, which over-count (the medium= filter leaks).
        id: 'sculpture',
        label: 'Sculpture',
        plural: 'Sculptures',
        enumValue: 'SCULPTURE',
        gist: 'A three-dimensional artwork — statue, bust, relief, statuette or group — held in a collection. Not architecture, furniture or functional objects that happen to be carved or cast.',
        ingestion: 'api',
        enrichment: 'The Met — /objects/{id}; ~21k v1.1/search?medium=Sculpture hits. Accept classification Sculpture, Sculpture-Bronze, Sculpture-Miniature, Stone Sculpture or Bronzes, or objectName "Sculpture" with a blank classification (The American Wing). Reject Sculpture-Architectural (period rooms, tables, wall fountains) and functional objectNames (Oil lamp, Vase). ' +
            `${EUROPEANA_RECORD}. Accept dcType concept/51, Wikidata Q860861 or an English label "sculpture"; ~54k open-reuse hits for what:sculpture`,
        urlRequired: true,
        urlPattern: 'as Painting — metmuseum.org/art/collection/search/<objectID> | europeana.eu/[<lang>/]item/<datasetId>/<localId>; stored url is objectURL or edmLandingPage',
        identity: 'met:<objectID> | europeana:/<datasetId>/<localId>, plus the Wikidata QID as the cross-source key. Bronzes are cast in editions (Degas\' Little Dancer exists in ~28 casts), so a QID is a dedup key only when its P195 names one collection; a QID with several collections groups casts instead of merging them',
        icon: 'statue',
        accent: '#6B6E3A',
        sharesUrlSpace: false,
        thumbnail: 'As Painting: Met primaryImageSmall, Europeana edmPreview, object-fit: contain. Sculpture photos are often a single view of a 3D object — the details view links to additionalImages (Met) for the other angles',
        detect: MUSEUM_DETECT,
        discover: {
            placement: 'search-and-feed',
            status: 'proposed',
            search: 'As Painting with medium=Sculpture (Met) and qf=what:sculpture (Europeana); re-check the gate per card — the Met filter returned a Wedgwood vase and a period room among its highlights.',
            searchMode: 'in-app',
            feedLabel: 'Featured sculpture',
            feedKind: 'trending',
            feedSource: 'The 419 Met sculpture highlights (v1.1/search?isHighlight=true&medium=Sculpture, then the gate) ranked by 7-day English Wikipedia pageviews, as for Painting.',
            refresh: 'daily backend job',
            fetchFrom: 'backend',
            filters: ['Source', 'Material (bronze / marble / wood / terracotta)', 'Era', 'Culture (Met culture — ancient works are mostly anonymous)', 'Open reuse only'],
            reason: 'Same browse-first behaviour as Painting; the Met holds over 400 sculpture highlights, enough for a feed of its own.'
        },
        detailOnly: [
            { label: 'Artist bio', path: "Met artistDisplayBio | Europeana agents[creator].begin–end" },
            { label: 'Culture', path: "Met response->>'culture' + response->>'period' (\"Cypriot · Archaic\") | Europeana: none" },
            { label: 'Dimensions', path: "Met dimensions (H × W × D, sometimes weight) | Europeana dctermsExtent" },
            { label: 'Credit line', path: "Met creditLine | Europeana: none reliable" },
            { label: 'Inventory no.', path: "Met accessionNumber | Europeana dcIdentifier" },
            { label: 'Provided via', path: 'Europeana only: aggregation edmProvider' },
            { label: 'Image rights', path: "Met isPublicDomain | Europeana edmRights" }
        ]
    },
    {
        id: 'drawing',
        label: 'Drawing',
        plural: 'Drawings',
        enumValue: 'DRAWING',
        gist: 'A unique work on paper — chalk, ink, graphite, watercolour, pastel — made by hand, not printed. Includes studies and sketches.',
        ingestion: 'api',
        enrichment: 'The Met — /objects/{id}; ~27k v1.1/search?medium=Drawings hits. Accept classification "Drawings" or objectName "Drawing" (The American Wing leaves classification blank — Cassatt 10405). Mixed objectNames ("Photograph; Drawing", Smithson 284572) are not routed: the user picks. ' +
            `${EUROPEANA_RECORD}. Accept dcType concept/35, Wikidata Q93184 or Getty AAT 300033973, or an English label "drawing"; ~195k open-reuse hits for what:drawing`,
        urlRequired: true,
        urlPattern: 'as Painting',
        identity: 'met:<objectID> | europeana:/<datasetId>/<localId>; drawings are unique, so the QID (when one resolves) dedupes as for Painting. Most Europeana drawings have no QID',
        icon: 'pencil',
        accent: '#5E5A7A',
        sharesUrlSpace: false,
        thumbnail: 'As Painting, object-fit: contain on a paper-tone mat. Drawings are often recto/verso — the image is the recto',
        detect: MUSEUM_DETECT,
        discover: {
            placement: 'search-only',
            status: 'proposed',
            search: 'As Painting with medium=Drawings (Met) and qf=what:drawing (Europeana); re-check the gate per card.',
            searchMode: 'in-app',
            feedLabel: '',
            feedKind: 'none',
            feedSource: '',
            refresh: 'none',
            fetchFrom: 'backend',
            filters: ['Source', 'Medium', 'Era', 'Open reuse only'],
            reason: 'Drawings are rarely on view (light-sensitive, shown in rotation) and few have Wikipedia articles, so a pageview-ranked feed would be thin. Search only until usage says otherwise.'
        },
        detailOnly: [
            { label: 'Artist bio', path: "Met artistDisplayBio | Europeana agents[creator].begin–end" },
            { label: 'Dimensions', path: "Met dimensions | Europeana dctermsExtent" },
            { label: 'Credit line', path: "Met creditLine | Europeana: none reliable" },
            { label: 'Inventory no.', path: "Met accessionNumber | Europeana dcIdentifier" },
            { label: 'Provided via', path: 'Europeana only: aggregation edmProvider' },
            { label: 'Image rights', path: "Met isPublicDomain | Europeana edmRights" }
        ]
    },
    {
        id: 'print',
        label: 'Print',
        plural: 'Prints',
        enumValue: 'PRINT',
        gist: 'One impression of a printed image — engraving, etching, woodcut, lithograph, screenprint. The same print exists in many collections; each impression is its own row.',
        ingestion: 'api',
        enrichment: 'The Met — /objects/{id}; ~85k v1.1/search?medium=Prints hits, the leakiest filter (it matches "platinum print" photographs). Accept classification "Prints" with an objectName containing "Print" (Print, Woodblock print). Reject Books and Albums. ' +
            `${EUROPEANA_RECORD}. Accept dcType concept/2538, Getty AAT 300041273 or Wikidata Q11060274, or an English label "print" / "graphic arts"; ~386k open-reuse hits for what:print`,
        urlRequired: true,
        urlPattern: 'as Painting',
        identity: 'met:<objectID> | europeana:/<datasetId>/<localId> — the impression, never the QID. Wikidata items for prints are the work: Melencolia I (Q1362177) lists 20+ holding collections, and the Met and Rijksmuseum impressions both belong to it. Store the QID as workQid and use it to group "Other impressions", not to merge',
        icon: 'print',
        accent: '#3F6F73',
        sharesUrlSpace: false,
        thumbnail: 'As Painting, object-fit: contain',
        detect: MUSEUM_DETECT,
        discover: {
            placement: 'search-and-feed',
            status: 'proposed',
            search: 'As Painting with medium=Prints (Met) and qf=what:print (Europeana); re-check the gate per card — medium=Prints returned photographs, books and a drawing among its highlights.',
            searchMode: 'in-app',
            feedLabel: 'Featured prints',
            feedKind: 'trending',
            feedSource: 'Met print highlights (v1.1/search?isHighlight=true&medium=Prints, after the gate) ranked by 7-day Wikipedia pageviews of the work\'s article. Collapse impressions of the same workQid to one card.',
            refresh: 'daily backend job',
            fetchFrom: 'backend',
            filters: ['Source', 'Technique', 'Era', 'Open reuse only'],
            reason: 'Famous prints (the Great Wave, Melencolia I) are among the most-viewed artworks on Wikipedia, so a feed works; it must dedupe by work or the same image repeats.'
        },
        detailOnly: [
            { label: 'Artist bio', path: "Met artistDisplayBio | Europeana agents[creator].begin–end" },
            { label: 'Series', path: "Met portfolio, else the title's \"from the series …\" clause | Europeana dctermsIsPartOf" },
            { label: 'Dimensions', path: "Met dimensions (sheet / plate) | Europeana dctermsExtent" },
            { label: 'Inventory no.', path: "Met accessionNumber | Europeana dcIdentifier" },
            { label: 'Other impressions', path: 'rows with the same workQid; Wikidata P195 of the work for collections not in Perspectize' },
            { label: 'Provided via', path: 'Europeana only: aggregation edmProvider' },
            { label: 'Image rights', path: "Met isPublicDomain | Europeana edmRights" }
        ]
    },
    {
        id: 'photograph',
        label: 'Photograph',
        plural: 'Photographs',
        enumValue: 'PHOTOGRAPH',
        gist: 'A photographic print or object held in a collection as a work — not a reproduction photo of another object, and not a photo the user took.',
        ingestion: 'api',
        enrichment: 'The Met — /objects/{id}; ~35k v1.1/search?medium=Photographs hits. Accept classification "Photographs" (objectName Photograph, Photogram, Polaroid, Postcard). ' +
            `${EUROPEANA_RECORD}. Accept dcType concept/48, Getty AAT 300046300 or Wikidata Q125191, or an English label "photograph"; 3.9M open-reuse hits for what:photograph, mostly archival and documentary — filter to art-museum providers or accept that scale. Reject records whose dcType is a painting even if they match (what:photograph returned Finnish National Gallery paintings)`,
        urlRequired: true,
        urlPattern: 'as Painting',
        identity: 'met:<objectID> | europeana:/<datasetId>/<localId> — the print, never the QID. As for Print: Le Gray\'s Great Wave, Sète (Q3209564) is one Wikidata item held by four collections. QID → workQid, grouping only',
        icon: 'camera',
        accent: '#4A4F57',
        sharesUrlSpace: false,
        thumbnail: 'As Painting, object-fit: contain. Many 20th-century photographs are in copyright and have no image at either source — icon tile and a link out',
        detect: MUSEUM_DETECT,
        discover: {
            placement: 'search-and-feed',
            status: 'proposed',
            search: 'As Painting with medium=Photographs (Met) and qf=what:photograph plus a provider filter (Europeana); re-check the gate per card.',
            searchMode: 'in-app',
            feedLabel: 'Featured photographs',
            feedKind: 'trending',
            feedSource: 'Met photograph highlights ranked by 7-day Wikipedia pageviews of the work, impressions collapsed by workQid, as for Print.',
            refresh: 'daily backend job',
            fetchFrom: 'backend',
            filters: ['Source', 'Process', 'Era', 'Open reuse only'],
            reason: 'Same as Print; most Met highlights after 1925 are in copyright, so the feed shows many icon tiles unless filtered to open reuse.'
        },
        detailOnly: [
            { label: 'Artist bio', path: "Met artistDisplayBio | Europeana agents[photographer].begin–end" },
            { label: 'Dimensions', path: "Met dimensions (image / sheet / frame) | Europeana dctermsExtent" },
            { label: 'Credit line', path: "Met creditLine | Europeana: none reliable (Rijksmuseum dctermsMedium)" },
            { label: 'Inventory no.', path: "Met accessionNumber | Europeana dcIdentifier" },
            { label: 'Other prints', path: 'rows with the same workQid' },
            { label: 'Provided via', path: 'Europeana only: aggregation edmProvider' },
            { label: 'Image rights', path: "Met isPublicDomain | Europeana edmRights" }
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
export const TMDB_TYPES = ['movie', 'tvShow', 'tvSeason', 'tvEpisode'];
const isTmdb = (id) => TMDB_TYPES.includes(id);
/** The museum family — independent types sharing the Met + Europeana sources and one link rule. */
export const MUSEUM_TYPES = ['painting', 'sculpture', 'drawing', 'print', 'photograph'];
const ART_IDS = ['sculpture', 'drawing', 'print', 'photograph'];
const isArt = (id) => ART_IDS.includes(id);
/** What each museum type calls the columns whose meaning shifts between them. */
const ART = {
    sculpture: {
        item: 'Sculpture',
        medium: 'Material',
        mediumEg: '"Bronze", "Marble", "Limestone", "Partially tinted bronze, cotton tarlatan…"',
        maker: 'Sculptor',
        date: 'Made',
        dateNote: 'Casts carry two dates. The Met sorts the Degas Little Dancer by its cast (objectBeginDate 1922) although it was modeled in 1881 — show objectDate verbatim and say in the popover which date sorts.'
    },
    drawing: {
        item: 'Drawing',
        medium: 'Medium',
        mediumEg: '"Pen and brown ink", "Black chalk", "Silverpoint…", "Brush and oils over black chalk" (van Gogh\'s Corridor is a drawing in oils)',
        maker: 'Artist',
        date: 'Drawn',
        dateNote: 'Ranges are common ("1480–85", Europeana "Production 1910-1915"); sort on the first year.'
    },
    print: {
        item: 'Print',
        medium: 'Technique',
        mediumEg: '"Engraving", "Woodblock print; ink and color on paper", "Screenprint"',
        maker: 'Printmaker',
        date: 'Made',
        dateNote: 'The date of the design, not of this impression — Hokusai\'s Great Wave reads "ca. 1830–32" but the Met sorts it on objectBeginDate 1820. Later printings say so in objectDate ("1904, printed 1913").'
    },
    photograph: {
        item: 'Photograph',
        medium: 'Process',
        mediumEg: '"Albumen silver print from glass negative", "Gelatin silver print", "Platinum print"',
        maker: 'Photographer',
        date: 'Taken',
        dateNote: 'The negative date. A later print says so in objectDate ("ca. 1932, printed mid-1960s"); Europeana gives ranges ("c.1885 - c.1905").'
    }
};
/** One binding per museum type after Painting, built from ART. */
const forArt = (fn) => Object.fromEntries(ART_IDS.map((id) => [id, fn(ART[id], id)]));
const b = (label, applicability, source, path, defaultVisible, extra = {}) => ({ label, applicability, source, path, defaultVisible, ...extra });
export const COLUMNS = [
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
        bindings: Object.fromEntries(TYPES.map((t) => [t.id, b('', 'required', 'derived', 'perspective join', true)]))
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
                appearance: 'Icon tile instead of a thumbnail. Serif 13px title, line-clamp-2. When display_title is set, the reference appears as an 11px muted subtitle (line-clamp-1 on the title). Sort comparator: verse_start_id, so Genesis precedes 1 Corinthians.'
            }),
            ...forArt((a) => b(a.item, 'required', 'api', "name + image_url — Met title + primaryImageSmall | Europeana proxy dcTitle (en, else the original title, else the first language) + edmPreview", true, {
                tooltip: `Title and image from the museum record (The Met or Europeana). Click the title for details; click the image to open the ${a.item.toLowerCase()} on metmuseum.org or europeana.eu.`,
                cellTip: 'English title, the original-language title when it differs, and the source. Copy copies the displayed title.',
                appearance: 'As Painting: object-fit: contain on a neutral mat, never cropped; type icon tile when the source has no open image (common for 20th-century works). Title line-clamp-2; source id as an 11px muted subtitle.'
            })),
            painting: b('Painting', 'required', 'api', "name + image_url — Met title + primaryImageSmall (Commons fallback) | Europeana proxy dcTitle (en, else the record's first language) + edmPreview", true, {
                tooltip: 'Title and image from the museum record (The Met or Europeana). Click the title for details; click the image to open the painting on metmuseum.org or europeana.eu.',
                cellTip: 'English title, then the original-language title when it differs ("Het melkmeisje"), and the source ("The Met" / "Europeana · Rijksmuseum"). Copy copies the English title.',
                appearance: 'Thumbnail in the existing slot with object-fit: contain on a neutral mat, not cover — cropping a painting misrepresents it (portraits are tall, Washington Crossing the Delaware is 1.7:1, The Night Watch 1.2:1). Palette icon tile when no image. Title line-clamp-2 — Europeana titles can be a sentence (the Night Watch\'s is 107 characters). Subtitle: source id in 11px muted mono. Commons-sourced images carry a small "ⓘ" with the attribution in the tooltip.'
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
        bindings: Object.fromEntries(TYPES.map((t) => [t.id, b('Type', 'required', 'derived', 'content_type', true)]))
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
        bindings: Object.fromEntries(TYPES.map((t) => [
            t.id,
            isTmdb(t.id)
                ? b('Category', 'optional', 'user', 'primary_category_id', false, {
                    tooltip: 'Wikidata category — off by default for TMDB types, where Genre does the same job from the source.'
                })
                : b('Category', 'optional', 'user', 'primary_category_id', true)
        ]))
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
                tooltip: 'Canonical division of the book: Torah, History, Wisdom, Major/Minor Prophets, Gospels, Acts, Pauline/General Epistles, Apocalyptic. OT/NT shown after it. From data/bible/books.json, not user-entered.',
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
            ...forArt((a) => b(a.medium, 'typical', 'api', "Met response->>'medium' | Europeana: English labels from proxy dctermsMedium, dcFormat or dcDescription (\"technique: …\")", true, {
                tooltip: `${a.medium} as the museum records it, e.g. ${a.mediumEg}. Europeana providers each put it in a different field, so its value is rebuilt from English labels.`,
                cellTip: 'The text, then the raw source text when it was rebuilt. Copy copies the displayed text.',
                appearance: 'Plain text, line-clamp-1; free-text contains filter. Blank rather than a non-English word ("technique: lyijykynä" is Finnish for pencil under an English label).'
            })),
            painting: b('Medium', 'typical', 'api', "Met response->>'medium' | Europeana: proxy dcFormat or dctermsMedium or dcDescription, English labels only, normalised to \"<paint> on <support>\"", true, {
                tooltip: 'Materials as the museum records them, e.g. "Oil on canvas", "Oil on oak", "Tempera and gold on wood". Europeana providers each put this in a different field, so its values are rebuilt from the English labels.',
                cellTip: 'The medium, then the raw source text when it was rebuilt ("Europeana: canvas; oil paint (paint)"). Copy copies the displayed medium.',
                appearance: 'Plain text, line-clamp-1. Filter is free-text contains, not a set filter — neither source uses a controlled vocabulary the grid can rely on (Europeana sometimes has Getty AAT URIs, sometimes only "doek").'
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
        // Added with Europeana (2026-10-29): rights vary per item there, and the
        // statement decides whether Perspectize may show the full-size image.
        id: 'rights',
        generic: 'Reuse rights',
        group: 'identity',
        valueType: 'enum',
        tooltip: 'The rights statement the source attaches to the item and its image',
        storage: 'jsonb',
        sortable: true,
        filterable: true,
        gapFallback: 'em-dash',
        align: 'center',
        bindings: {
            ...forArt(() => b('Rights', 'required', 'api', "Met isPublicDomain | Europeana aggregation edmRights URI", true, {
                unit: 'open · restricted · permission',
                tooltip: 'Whether the image may be reused, per the source. Open rows show the full-size image; restricted and permission rows show the source preview, or nothing when there is none, and link out.',
                cellTip: "The statement's full name and URI. Copy copies the URI.",
                appearance: 'As Painting: PD / CC0 / CC BY / BY-NC / © badge, sorted open < restricted < permission.'
            })),
            painting: b('Rights', 'required', 'api', "Met response->>'isPublicDomain' (true → CC0, false → 'Not open access') | Europeana aggregation edmRights URI", true, {
                unit: 'open · restricted · permission',
                tooltip: 'Whether the image may be reused, per the source: open (public domain, CC0, CC BY, CC BY-SA), restricted (NC or ND licences) or permission (in copyright or not evaluated). Open rows show the full-size image; restricted and permission rows show the source preview only and link out.',
                cellTip: 'The statement\'s full name and URI ("Public Domain Mark 1.0 · creativecommons.org/publicdomain/mark/1.0/"). Copy copies the URI.',
                appearance: 'Short badge: "PD", "CC0", "CC BY", "BY-NC" or "©". Green for open, amber for restricted, grey for permission. Sort comparator follows Europeana\'s reusability order (open < restricted < permission), not A–Z.'
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
            ...forArt((a, id) => b(a.maker, 'typical', 'api', "Met artistDisplayName | Europeana dcCreator literal, else the agent with life dates — names with a comma flipped to \"Given Surname\"", true, {
                tooltip: id === 'sculpture'
                    ? 'The sculptor as the museum attributes the work. Ancient works are usually anonymous: the cell then shows the culture ("Cypriot") in muted italics, never a blank.'
                    : id === 'print'
                        ? 'The printmaker — for reproductive prints the designer appears as "after …" in the popover (Met artistRole). Japanese names stay family-name first ("Utagawa Kunisada"): only names written with a comma are flipped.'
                        : id === 'photograph'
                            ? 'The photographer or studio. Europeana agents can list the sitter first (the Breitner photograph names Marie Jordan before Breitner), so pick the agent with life dates, not the first one.'
                            : 'The artist as the museum attributes the work. Europeana agents can be the subject, not the maker: a search for Rembrandt drawings returns portraits of Rembrandt by others.',
                cellTip: 'Name, life dates and the name exactly as the source wrote it. Copy copies the displayed name.',
                appearance: id === 'sculpture'
                    ? 'Name with the life line as a muted subtitle; anonymous → Met culture + period ("Cypriot · Archaic") in muted italics.'
                    : 'Name with the life line as an 11px muted subtitle, as for Painting.'
            })),
            painting: b('Artist', 'typical', 'api', "Met response->>'artistDisplayName' | Europeana proxy dcCreator literal, else the agent with life dates — names with a comma flipped from \"Surname, Given\" to \"Given Surname\"", true, {
                tooltip: 'The artist as the museum attributes the work — may read "Workshop of…", "Attributed to…" or be blank for anonymous works. Europeana names are flipped to "Given Surname" so the same artist sorts together across sources.',
                cellTip: 'Name, life dates and the name exactly as the source wrote it ("Rijn, Rembrandt van"). Copy copies the displayed name.',
                appearance: 'Name, with the life line as an 11px muted subtitle: Met artistDisplayBio ("Dutch, Leiden 1606–1669 Amsterdam"), Europeana agent begin–end years only ("1606–1669"). Never show a URI — MNAC\'s dcCreator is "data.europeana.eu/agent/22714"; resolve it to the agent label. Europeana agents also list sitters (the Night Watch record lists 15, the Breitner photograph names its sitter first); when dcCreator is empty, take the agent with life dates, and only the first one as a last resort.'
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
            ...forArt(() => b('Collection', 'required', 'api', "Met 'The Met' + department | Europeana edmDataProvider → organizations[].prefLabel.en", true, {
                tooltip: 'The museum that holds the object.',
                cellTip: 'Museum, Met department or Europeana aggregator. Copy copies the museum name.',
                appearance: 'Museum name with the Met department or "via Europeana" as a muted subtitle; set filter.'
            })),
            painting: b('Collection', 'required', 'api', "Met 'The Met' + response->>'department' | Europeana aggregation edmDataProvider → organizations[].prefLabel.en", true, {
                tooltip: 'The museum that holds the painting. On by default now that there are two sources: Europeana rows come from dozens of museums.',
                cellTip: 'Museum, department (Met) or aggregator (Europeana: "via Dutch Collections for Europe"), and country. Copy copies the museum name.',
                appearance: 'Museum name with a muted subtitle: the Met department ("European Paintings"), or "via Europeana" for Europeana rows. Set filter over museum names — the list is finite, unlike Medium.'
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
            bible: b('Words - BSB', 'typical', 'derived', "Σ words of bible_verse_text (translation 'BSB') for verse_start_id..verse_end_id → length, length_units = 'words'", true, {
                unit: 'words (BSB)',
                tooltip: 'PLANNED — not written by CreateFromPassage today. Word count of the passage in the Berean Standard Bible; other translations differ. Counted once when the passage is added.',
                appearance: 'Right-aligned integer with thousands separator, e.g. "453". The unit lives in the header, not the cell. Sorting alongside other types raises the mixed-unit alert (filter to one type, or sort by Type then Length).'
            })
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
            ...forArt((a) => b(a.date, 'typical', 'api', "Met (response->>'objectBeginDate')::int | Europeana: first 4-digit year in dctermsCreated, else dcDate", true, {
                unit: 'year',
                tooltip: `When it was made, as the museum dates it. ${a.dateNote}`,
                cellTip: "The source's wording plus the sort year. Copy copies the sort year.",
                appearance: 'objectDate or the cleaned Europeana text verbatim; sorted on the integer year (negative for BCE).'
            })),
            painting: b('Painted', 'typical', 'api', "Met (response->>'objectBeginDate')::int | Europeana: first 4-digit year in proxy dctermsCreated, else dcDate, after URL-decoding", true, {
                unit: 'year',
                tooltip: 'When the painting was made, as the museum dates it — often approximate ("ca. 1662") or a range ("1884–86").',
                cellTip: 'The source\'s own wording plus the sort year ("ca. 1662 · sorted as 1657"). Copy copies the sort year.',
                appearance: 'Display response->>\'objectDate\' verbatim (Met) or the cleaned Europeana text; never reformat to a full date. The value path is the sort key: an integer year (negative for BCE) — note the Vermeer sample: shown "ca. 1662", sorted as 1657. Europeana text needs cleaning before display: the Mauritshuis sends "#1665%2F1665" and "1665 - 1665" (show "1665"), the Finnish National Gallery "Production 1920" (show "1920"). Mixed with YouTube publishedAt this column spans centuries vs days — sort by Type first.'
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
            }),
            ...forArt((a, id) => b('On view', 'optional', 'api', "Met GalleryNumber | Europeana: none", false, {
                tooltip: id === 'sculpture'
                    ? 'Gallery number when the Met has the object on view. Europeana rows are always blank.'
                    : `Rarely filled: ${a.item.toLowerCase()}s are light-sensitive and shown in short rotations, so most Met records have no gallery. Europeana rows are always blank.`,
                appearance: 'Dot + "Gallery 815"; blank when unknown.'
            })),
            painting: b('On view', 'optional', 'api', "Met response->>'GalleryNumber' (non-blank = on view) | Europeana: none", false, {
                tooltip: 'Whether the Met has the painting on view, and in which gallery. Europeana has no gallery data, so its rows are always blank. Goes stale until "Update source data" runs.',
                cellTip: '"On view · Gallery 822". Copy copies the gallery number.',
                appearance: 'Dot + "Gallery 822" for on view; blank (not "Off view") when the source has no data.'
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
            tvEpisode: b('Votes', 'optional', 'api', "response->>'vote_count'", false, { tooltip: 'Number of TMDB user votes behind the Score.' }),
            ...forArt((_a, id) => b('Pageviews', 'optional', 'derived', "response->>'wikiPageviews7d' via the Wikidata QID", false, {
                unit: 'views / 7 days',
                tooltip: id === 'print' || id === 'photograph'
                    ? "Views of the work's English Wikipedia article over 7 days. The article is about the work, so every impression of it shows the same number."
                    : "Views of the object's English Wikipedia article over 7 days. Blank without a QID or an article.",
                appearance: 'Right-aligned integer. Illustrative in the samples.'
            })),
            painting: b('Pageviews', 'optional', 'derived', "response->>'wikiPageviews7d' (Wikidata QID → enwiki sitelink → Wikimedia pageviews API)", false, {
                unit: 'views / 7 days',
                tooltip: 'English Wikipedia views of the painting\'s article over the last 7 days — the same signal the Discover feed ranks by. Neither museum publishes visitor counts. Blank when the painting has no QID or no article.',
                cellTip: 'Views and the article it counted ("en.wikipedia.org/wiki/The_Night_Watch · 7 days to 2026-10-28"). Copy copies the number.',
                appearance: 'Right-aligned integer with thousands separator. Values are illustrative in the samples.'
            })
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
        bindings: Object.fromEntries(TYPES.filter((t) => t.id !== 'claim' && t.id !== 'perspective' && t.id !== 'bible').map((t) => [
            t.id,
            b('Rating', 'optional', 'user', "response->>'userRating'", true, {
                tooltip: 'Your rating — user-entered, never fetched'
            })
        ]))
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
            ...forArt(() => b('Seen', 'optional', 'user', "response->>'progressStatus'", false, { tooltip: 'Want to see / seen in person / seen in reproduction only — yours, never fetched.' })),
            painting: b('Seen', 'optional', 'user', "response->>'progressStatus'", false, {
                tooltip: 'Want to see / seen in person / seen in reproduction only — yours, never fetched.',
                appearance: 'Plain label; "Seen in person" gets a small check. Set filter in that order, not A–Z.'
            })
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
            ...forArt((a, id) => b('Source ID', 'required', 'api', "response->>'sourceId' + response->>'wikidataQid' (Print, Photograph: response->>'workQid')", false, {
                tooltip: id === 'print' || id === 'photograph'
                    ? `The record id at its source — this ${a.item.toLowerCase()}, the dedup key. The QID beside it is the work, shared by every impression in every collection (Melencolia I: 20+), so it groups rows and never merges them.`
                    : id === 'sculpture'
                        ? 'The record id at its source, plus the Wikidata QID that dedupes across sources — unless the QID names several collections, which means casts of an edition: then it groups, not merges.'
                        : 'The record id at its source, plus the Wikidata QID that dedupes across sources when one resolves. Most Europeana drawings have none.',
                cellTip: 'Both ids as links plus the inventory number. Copy copies the source id.',
                appearance: 'Monospace "met:336228 · work Q1362177"; "· no QID" muted when the lookup failed. Debug column.'
            })),
            painting: b('Source ID', 'required', 'api', "response->>'sourceId' ('met:' + objectID | 'europeana:' + record about) + response->>'wikidataQid'", false, {
                tooltip: 'The record id at its source, prefixed with the source. The Wikidata QID beside it (response->>\'wikidataQid\') is the key that dedupes the same painting across sources: the Met supplies it, Europeana rows get it from a Wikidata lookup on ingest, and some never resolve (MNAC\'s Nonell "Study").',
                cellTip: 'Both ids as links (metmuseum.org or europeana.eu, and wikidata.org) plus the inventory number. Copy copies the source id.',
                appearance: 'Monospace "met:436535 · Q18689458" or "europeana:/90402/SK_A_2344 · Q167605"; "· no QID" in muted text when the lookup failed. Debug column — leave in the picker.'
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
        bindings: Object.fromEntries(TYPES.filter((t) => t.id !== 'tvSeason' && t.id !== 'tvEpisode').map((t) => [
            t.id,
            isTmdb(t.id)
                ? b('Keywords', 'optional', 'api', "keywords (append_to_response=keywords)", false, {
                    tooltip: 'TMDB keywords — community-curated, sometimes noisy. TMDB has none for seasons or episodes.'
                })
                : t.id === 'bible'
                    ? b('Tags', 'optional', 'derived', '[testament, division] → tags', false, {
                        tooltip: 'PLANNED (Q10, answer box unchecked) — e.g. "Old Testament, Major Prophets". Redundant with Genre while that column exists.'
                    })
                    : t.id === 'painting' || isArt(t.id)
                        ? b('Subjects', 'optional', 'api', "Met response->'tags'[].term | Europeana proxy dcSubject labels (Iconclass URIs resolved via concepts[].prefLabel.en; unresolved URIs dropped)", false, {
                            tooltip: 'What the painting depicts. The Met tags every highlight; Europeana subjects are often Iconclass codes with no English label, so many Europeana rows are blank.',
                            cellTip: 'Multi mode: every subject as a checklist, "Copy selected" / "Copy all".',
                            appearance: 'First two subjects with a "+N" counter, as for TMDB keywords.'
                        })
                        : b('Tags', 'optional', t.ingestion === 'api' ? 'api' : 'user', "response->'tags'", false)
        ]))
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
            ...forArt(() => b('About', 'optional', 'api', "Met: none | Europeana proxy dcDescription (en, else the first language, flagged)", false, {
                tooltip: 'The museum\'s description. Only Europeana records carry one, and some only in Dutch or Finnish. "technique: …" descriptions are medium, not description, and are dropped.',
                appearance: 'Muted, line-clamp-1; language chip when not English.'
            })),
            painting: b('About', 'optional', 'api', "Met: none in the API | Europeana proxy dcDescription (en, else the first language, flagged)", false, {
                tooltip: 'The museum\'s description of the painting. Only Europeana records carry one — the Met API has no description field — and some are only in Dutch or Finnish.',
                cellTip: 'The full text with its language ("nl" in a muted chip when not English). Copy copies the text.',
                appearance: 'Muted, line-clamp-1. Off by default: blank for every Met row.'
            }),
            bible: b('Text (BSB)', 'typical', 'internal', 'passageText(startVerseId, endVerseId) → bible_verse_text', false, {
                tooltip: 'Opening words of the passage in the Berean Standard Bible (public domain). Full text lives in the details modal.',
                appearance: 'Serif, muted, line-clamp-1 of the first verse. Off by default: one passageText call per visible row unless the list query is batched.'
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
        bindings: Object.fromEntries(TYPES.map((t) => [t.id, b('Date Added', 'required', 'derived', 'created_at', true)]))
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
        bindings: Object.fromEntries(TYPES.map((t) => [t.id, b('Updated', 'required', 'derived', 'updated_at', false)]))
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
        bindings: Object.fromEntries(TYPES.map((t) => [t.id, b('Content ID', 'required', 'derived', 'id', false)]))
    }
];
export const GROUP_LABELS = {
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
 * Illustrative rows rendered under the header strip so a column decision can
 * be judged on real-looking values, not just its header. Keyed by column id;
 * a column a row does not mention renders the column's gap fallback.
 */
export const SAMPLES = {
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
    // Real records from both sources. Met: fetched 2026-09-26 and re-checked
    // 2026-10-29 from /public/collection/v1/objects/{id}. Europeana: fetched
    // 2026-10-29 from record/v2/{id}.json; QIDs resolved the same day via Wikidata
    // P217 + P195. Pageviews, perspective counts, ratings and "added" dates are
    // illustrative. Chosen to exercise the edge cases:
    //   Met — an approximate date (Vermeer, sorted by objectBeginDate 1657), a
    //   blank classification (Leutze, The American Wing — why the gate is
    //   objectName), a non-oil-on-canvas medium (Bruegel), and a painting with no
    //   open-access image (Monet 437127 → Commons fallback).
    //   Europeana — the same artist as a Met row under another name form
    //   ("Vermeer, Johannes"), a 107-character title and 15 agents (Night Watch),
    //   a URL-encoded date and unlabelled dimensions (Mauritshuis), a date as
    //   "Production 1920" (Finnish National Gallery), and a CC BY-NC item whose
    //   creator is a URI, medium is Catalan only and QID never resolves (MNAC).
    // Extra keys (url, wikidata, provider, originalTitle…) feed the details view only.
    painting: [
        {
            item: {
                text: 'Wheat Field with Cypresses',
                sub: 'met:436535',
                img: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP-42549-001.jpg',
                href: 'https://www.metmuseum.org/art/collection/search/436535',
                tip: 'Wheat Field with Cypresses · The Met',
                copy: 'Wheat Field with Cypresses'
            },
            rights: { text: 'CC0', tip: 'Open access at the Met (isPublicDomain = true) · CC0 1.0', copy: 'https://creativecommons.org/publicdomain/zero/1.0/', sort: 0 },
            genre: 'Oil on canvas',
            creator: { text: 'Vincent van Gogh', sub: 'Dutch, Zundert 1853–1890 Auvers-sur-Oise', copy: 'Vincent van Gogh' },
            venue: { text: 'The Met', sub: 'European Paintings', tip: 'The Metropolitan Museum of Art, New York · European Paintings', copy: 'The Met' },
            date: { text: '1889', tip: '1889 · sorted as 1889', copy: '1889', sort: 1889 },
            releaseStatus: { text: '● Gallery 822', tip: 'On view · Gallery 822', copy: '822' },
            audience: { text: '9,840', tip: 'Illustrative: en.wikipedia.org/wiki/Wheat_Field_with_Cypresses · 7 days', copy: '9840', sort: 9840 },
            rating: '5 / 5',
            status: 'Seen in person',
            identifier: { text: 'met:436535 · Q18689458', tip: 'metmuseum.org/art/collection/search/436535 · wikidata.org/wiki/Q18689458 · accession 1993.132', copy: 'met:436535' },
            tags: { text: 'Landscapes, Cypresses +1', items: ['Landscapes', 'Cypresses', 'Summer'] },
            category: 'Post-Impressionism',
            createdAt: '2026-09-26',
            url: 'https://www.metmuseum.org/art/collection/search/436535',
            wikidata: 'Q18689458',
            source: 'The Met',
            'detail:Artist bio': 'Dutch, Zundert 1853–1890 Auvers-sur-Oise',
            'detail:Dimensions': '28 13/16 × 36 3/4 in. (73.2 × 93.4 cm)',
            'detail:Credit line': 'Purchase, The Annenberg Foundation Gift, 1993',
            'detail:Inventory no.': '1993.132',
            'detail:Image rights': 'Public domain (CC0)',
            perspectives: '3',
            avgRating: '4.7',
            updatedAt: '2026-10-29'
        },
        {
            item: {
                text: 'Young Woman with a Water Pitcher',
                sub: 'met:437881',
                img: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP353257.jpg',
                href: 'https://www.metmuseum.org/art/collection/search/437881',
                tip: 'Young Woman with a Water Pitcher · The Met',
                copy: 'Young Woman with a Water Pitcher'
            },
            rights: { text: 'CC0', tip: 'Open access at the Met (isPublicDomain = true) · CC0 1.0', copy: 'https://creativecommons.org/publicdomain/zero/1.0/', sort: 0 },
            genre: 'Oil on canvas',
            creator: { text: 'Johannes Vermeer', sub: 'Dutch, Delft 1632–1675 Delft', tip: 'Johannes Vermeer · Dutch, Delft 1632–1675 Delft · same artist as the Europeana rows "Vermeer, Johannes" and "Johannes Vermeer"', copy: 'Johannes Vermeer' },
            venue: { text: 'The Met', sub: 'European Paintings', copy: 'The Met' },
            date: { text: 'ca. 1662', tip: 'ca. 1662 · sorted as 1657 (objectBeginDate; objectEndDate 1667)', copy: '1657', sort: 1657 },
            releaseStatus: { text: '● Gallery 614', tip: 'On view · Gallery 614', copy: '614' },
            audience: { text: '2,310', tip: 'Illustrative: en.wikipedia.org/wiki/Young_Woman_with_a_Water_Pitcher · 7 days', copy: '2310', sort: 2310 },
            identifier: { text: 'met:437881 · Q386453', tip: 'metmuseum.org/art/collection/search/437881 · wikidata.org/wiki/Q386453 · accession 89.15.21', copy: 'met:437881' },
            tags: { text: 'Interiors, Women +2', items: ['Interiors', 'Women', 'Maps', 'Pitchers'] },
            category: 'Dutch Golden Age',
            createdAt: '2026-09-26',
            url: 'https://www.metmuseum.org/art/collection/search/437881',
            wikidata: 'Q386453',
            source: 'The Met',
            'detail:Artist bio': 'Dutch, Delft 1632–1675 Delft',
            'detail:Dimensions': '18 x 16 in. (45.7 x 40.6 cm)',
            'detail:Credit line': 'Marquand Collection, Gift of Henry G. Marquand, 1889',
            'detail:Inventory no.': '89.15.21',
            'detail:Image rights': 'Public domain (CC0)',
            perspectives: '2',
            avgRating: '4.5',
            updatedAt: '2026-10-29'
        },
        {
            item: {
                text: 'Washington Crossing the Delaware',
                sub: 'met:11417',
                img: 'https://images.metmuseum.org/CRDImages/ad/web-large/DP215410.jpg',
                href: 'https://www.metmuseum.org/art/collection/search/11417',
                tip: 'Washington Crossing the Delaware · The Met · classification is blank (The American Wing), accepted on objectName = "Painting"',
                copy: 'Washington Crossing the Delaware'
            },
            rights: { text: 'CC0', tip: 'Open access at the Met (isPublicDomain = true) · CC0 1.0', copy: 'https://creativecommons.org/publicdomain/zero/1.0/', sort: 0 },
            genre: 'Oil on canvas',
            creator: { text: 'Emanuel Leutze', sub: 'American, Schwäbisch Gmünd 1816–1868 Washington, D.C.', copy: 'Emanuel Leutze' },
            venue: { text: 'The Met', sub: 'The American Wing', copy: 'The Met' },
            date: { text: '1851', copy: '1851', sort: 1851 },
            releaseStatus: { text: '● Gallery 760', tip: 'On view · Gallery 760', copy: '760' },
            audience: { text: '14,605', tip: 'Illustrative: en.wikipedia.org/wiki/Washington_Crossing_the_Delaware_(1851_painting) · 7 days', copy: '14605', sort: 14605 },
            identifier: { text: 'met:11417 · Q509806', tip: 'metmuseum.org/art/collection/search/11417 · wikidata.org/wiki/Q509806 · accession 97.34', copy: 'met:11417' },
            tags: { text: 'Soldiers, American Revolution +5', items: ['Soldiers', 'American Revolution', 'George Washington', 'Men', 'Horses', 'Flags', 'Boats'] },
            category: 'History painting',
            createdAt: '2026-09-26',
            url: 'https://www.metmuseum.org/art/collection/search/11417',
            wikidata: 'Q509806',
            source: 'The Met',
            'detail:Artist bio': 'American, Schwäbisch Gmünd 1816–1868 Washington, D.C.',
            'detail:Dimensions': '149 x 255 in. (378.5 x 647.7 cm)',
            'detail:Credit line': 'Gift of John Stewart Kennedy, 1897',
            'detail:Inventory no.': '97.34',
            'detail:Image rights': 'Public domain (CC0)',
            perspectives: '1',
            avgRating: '4.0',
            updatedAt: '2026-09-26'
        },
        {
            item: {
                text: 'The Harvesters',
                sub: 'met:435809',
                img: 'https://images.metmuseum.org/CRDImages/ep/web-large/DP119115.jpg',
                href: 'https://www.metmuseum.org/art/collection/search/435809',
                copy: 'The Harvesters'
            },
            rights: { text: 'CC0', tip: 'Open access at the Met (isPublicDomain = true) · CC0 1.0', copy: 'https://creativecommons.org/publicdomain/zero/1.0/', sort: 0 },
            genre: 'Oil on oak',
            creator: { text: 'Pieter Bruegel the Elder', sub: 'Netherlandish, Breda (?) ca. 1525–1569 Brussels', copy: 'Pieter Bruegel the Elder' },
            venue: { text: 'The Met', sub: 'European Paintings', copy: 'The Met' },
            date: { text: '1565', copy: '1565', sort: 1565 },
            releaseStatus: { text: '● Gallery 638', tip: 'On view · Gallery 638', copy: '638' },
            audience: { text: '3,075', tip: 'Illustrative: en.wikipedia.org/wiki/The_Harvesters_(Bruegel) · 7 days', copy: '3075', sort: 3075 },
            identifier: { text: 'met:435809 · Q776175', tip: 'metmuseum.org/art/collection/search/435809 · wikidata.org/wiki/Q776175 · accession 19.164', copy: 'met:435809' },
            tags: { text: 'Food, Men +4', items: ['Food', 'Men', 'Women', 'Landscapes', 'Working', 'Eating'] },
            category: 'Northern Renaissance',
            createdAt: '2026-09-26',
            url: 'https://www.metmuseum.org/art/collection/search/435809',
            wikidata: 'Q776175',
            source: 'The Met',
            'detail:Artist bio': 'Netherlandish, Breda (?) ca. 1525–1569 Brussels',
            'detail:Dimensions': 'Overall, including added strips at top, bottom, and right, 46 7/8 x 63 3/4 in. (119 x 162 cm); original painted surface 45 7/8 x 62 7/8 in. (116.5 x 159.5 cm)',
            'detail:Credit line': 'Rogers Fund, 1919',
            'detail:Inventory no.': '19.164',
            'detail:Image rights': 'Public domain (CC0)',
            perspectives: '1',
            avgRating: '5.0',
            updatedAt: '2026-09-26'
        },
        {
            item: {
                text: 'Bridge over a Pond of Water Lilies',
                sub: 'met:437127 · image via Commons',
                img: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bridge%20Over%20a%20Pond%20of%20Water%20Lilies%2C%20Claude%20Monet%201899.jpg?width=400',
                href: 'https://www.metmuseum.org/art/collection/search/437127',
                tip: 'Bridge over a Pond of Water Lilies · The Met · image from Wikimedia Commons (the Met has no open-access image)',
                copy: 'Bridge over a Pond of Water Lilies'
            },
            rights: { text: 'Not OA', tip: 'Not open access at the Met (isPublicDomain = false). The image shown is Wikimedia Commons\' public-domain copy, with its attribution.', copy: 'met:isPublicDomain=false', sort: 2 },
            genre: 'Oil on canvas',
            creator: { text: 'Claude Monet', sub: 'French, Paris 1840–1926 Giverny', copy: 'Claude Monet' },
            venue: { text: 'The Met', sub: 'European Paintings', copy: 'The Met' },
            date: { text: '1899', copy: '1899', sort: 1899 },
            releaseStatus: { text: '● Gallery 819', tip: 'On view · Gallery 819', copy: '819' },
            identifier: { text: 'met:437127 · Q19905213', tip: 'metmuseum.org/art/collection/search/437127 · wikidata.org/wiki/Q19905213 · accession 29.100.113', copy: 'met:437127' },
            tags: { text: 'Bridges, Ponds +1', items: ['Bridges', 'Ponds', 'Water Lilies'] },
            category: 'Impressionism',
            createdAt: '2026-09-26',
            url: 'https://www.metmuseum.org/art/collection/search/437127',
            wikidata: 'Q19905213',
            source: 'The Met',
            'detail:Artist bio': 'French, Paris 1840–1926 Giverny',
            'detail:Dimensions': '36 1/2 x 29 in. (92.7 x 73.7 cm)',
            'detail:Credit line': 'H. O. Havemeyer Collection, Bequest of Mrs. H. O. Havemeyer, 1929',
            'detail:Inventory no.': '29.100.113',
            'detail:Image rights': 'Not open access at the Met — image from Wikimedia Commons (public domain)',
            perspectives: '0',
            avgRating: '—',
            updatedAt: '2026-09-26'
        },
        {
            item: {
                text: 'The Milkmaid',
                sub: 'europeana:/90402/SK_A_2344',
                img: 'https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Fwww.rijksmuseum.nl%2Fassetimage2.jsp%3Fid%3DSK-A-2344&type=IMAGE',
                href: 'https://www.europeana.eu/item/90402/SK_A_2344',
                tip: 'The Milkmaid · original title Het melkmeisje · Europeana · Rijksmuseum',
                copy: 'The Milkmaid'
            },
            rights: { text: 'PD', tip: 'Public Domain Mark 1.0 · open · creativecommons.org/publicdomain/mark/1.0/', copy: 'http://creativecommons.org/publicdomain/mark/1.0/', sort: 0 },
            genre: { text: 'Oil on canvas', tip: 'Oil on canvas · rebuilt from Europeana dcFormat "canvas; oil paint (paint)" (dctermsMedium holds the credit line for this provider)', copy: 'Oil on canvas' },
            creator: { text: 'Johannes Vermeer', sub: '1632–1675', tip: 'Johannes Vermeer · 1632–1675 · source wrote "Vermeer, Johannes" (agents[0].prefLabel.en)', copy: 'Johannes Vermeer' },
            venue: { text: 'Rijksmuseum', sub: 'via Europeana', tip: 'Rijksmuseum, Amsterdam · provided directly to Europeana', copy: 'Rijksmuseum' },
            date: { text: '1660', tip: '1660 · from dctermsCreated', copy: '1660', sort: 1660 },
            audience: { text: '11,920', tip: 'Illustrative: en.wikipedia.org/wiki/The_Milkmaid_(Vermeer) · 7 days', copy: '11920', sort: 11920 },
            rating: '5 / 5',
            status: 'Seen in person',
            identifier: { text: 'europeana:/90402/SK_A_2344 · Q167605', tip: 'europeana.eu/item/90402/SK_A_2344 · wikidata.org/wiki/Q167605 (resolved from P217 "SK-A-2344" + P195 Rijksmuseum) · inventory SK-A-2344', copy: 'europeana:/90402/SK_A_2344' },
            description: 'A maidservant pours milk, entirely absorbed in her work. Except for the stream of milk, everything else is still. Vermeer took this simple everyday activity and made it the subject of an impressive painting – the woman stands like a statue in the brightly lit room. Vermeer also had an eye for how light by means of hundreds of colourful dots plays over the surface of objects.',
            category: 'Dutch Golden Age',
            createdAt: '2026-10-29',
            url: 'https://www.europeana.eu/item/90402/SK_A_2344',
            wikidata: 'Q167605',
            source: 'Europeana',
            originalTitle: 'Het melkmeisje',
            'detail:Artist bio': '1632–1675 (Europeana agent dates only)',
            'detail:Dimensions': 'height 45.5 cm · width 41 cm',
            'detail:Credit line': 'Purchased with the support of the Vereniging Rembrandt (from dctermsMedium)',
            'detail:Inventory no.': 'SK-A-2344',
            'detail:Provided via': 'Rijksmuseum (direct)',
            'detail:Image rights': 'Public Domain Mark 1.0 — open, full-size image allowed',
            perspectives: '4',
            avgRating: '4.8',
            updatedAt: '2026-10-29'
        },
        {
            item: {
                text: 'Militia Company of District II under the Command of Captain Frans Banninck Cocq, Known as the ‘Night Watch’',
                sub: 'europeana:/90402/SK_C_5',
                img: 'https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Flh3.googleusercontent.com%2FJ-mxAE7CPu-DXIOx4QKBtb0GC4ud37da1QK7CzbTIDswmvZHXhLm4Tv2-1H3iBXJWAW_bHm7dMl3j5wv_XiWAg55VOM%3Ds0&type=IMAGE',
                href: 'https://www.europeana.eu/item/90402/SK_C_5',
                tip: 'Full title (107 characters), line-clamped to two lines in the cell · original title Schutters van wijk II onder leiding van kapitein Frans Banninck Cocq, bekend als de ‘Nachtwacht’',
                copy: 'Militia Company of District II under the Command of Captain Frans Banninck Cocq, Known as the ‘Night Watch’'
            },
            rights: { text: 'PD', tip: 'Public Domain Mark 1.0 · open', copy: 'http://creativecommons.org/publicdomain/mark/1.0/', sort: 0 },
            genre: { text: 'Oil on canvas', tip: 'Oil on canvas · rebuilt from dcFormat "canvas; oil paint (paint)"; dctermsMedium says "On loan from the City of Amsterdam"', copy: 'Oil on canvas' },
            creator: {
                text: 'Rembrandt van Rijn',
                sub: '1606–1669',
                tip: 'Rembrandt van Rijn · 1606–1669 · source wrote "Rijn, Rembrandt van" · dcCreator is empty, so this is agents[0]; the other 14 agents are sitters (Willem van Ruytenburch, Jan Ockersen, …)',
                copy: 'Rembrandt van Rijn'
            },
            venue: { text: 'Rijksmuseum', sub: 'via Europeana', tip: 'Rijksmuseum, Amsterdam · provided via Europeana 280', copy: 'Rijksmuseum' },
            date: { text: '1642', copy: '1642', sort: 1642 },
            audience: { text: '21,486', tip: 'Illustrative: en.wikipedia.org/wiki/The_Night_Watch · 7 days', copy: '21486', sort: 21486 },
            identifier: { text: 'europeana:/90402/SK_C_5 · Q219831', tip: 'europeana.eu/item/90402/SK_C_5 · wikidata.org/wiki/Q219831 · inventory SK-C-5', copy: 'europeana:/90402/SK_C_5' },
            category: 'Dutch Golden Age',
            createdAt: '2026-10-29',
            url: 'https://www.europeana.eu/item/90402/SK_C_5',
            wikidata: 'Q219831',
            source: 'Europeana',
            originalTitle: 'Schutters van wijk II onder leiding van kapitein Frans Banninck Cocq, bekend als de ‘Nachtwacht’',
            'detail:Artist bio': '1606–1669 (Europeana agent dates only)',
            'detail:Dimensions': 'height 379.5 cm · width 453.5 cm · weight 337 kg · weight 170 kg',
            'detail:Credit line': 'On loan from the City of Amsterdam (from dctermsMedium)',
            'detail:Inventory no.': 'SK-C-5',
            'detail:Provided via': 'Europeana 280',
            'detail:Image rights': 'Public Domain Mark 1.0 — open, full-size image allowed',
            perspectives: '6',
            avgRating: '4.9',
            updatedAt: '2026-10-29'
        },
        {
            item: {
                text: 'Girl with a Pearl Earring',
                sub: 'europeana:/2021672/resource_document_mauritshuis_670',
                img: 'https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Fwww.mauritshuis.nl%2Fmedia%2Fwlola5to%2F0670_repro_2.jpg&type=IMAGE',
                href: 'https://www.europeana.eu/item/2021672/resource_document_mauritshuis_670',
                tip: 'Girl with a Pearl Earring · original title Meisje met de parel · Europeana · Mauritshuis',
                copy: 'Girl with a Pearl Earring'
            },
            rights: { text: 'PD', tip: 'Public Domain Mark 1.0 · open', copy: 'http://creativecommons.org/publicdomain/mark/1.0/', sort: 0 },
            genre: { text: 'Canvas', tip: 'Only the support is recorded: dctermsMedium "canvas" (nl "doek"). No paint is named, so the medium is not rebuilt to "Oil on canvas".', copy: 'Canvas' },
            creator: { text: 'Johannes Vermeer', sub: '—', tip: 'Johannes Vermeer · from the dcCreator literal; the record has no agent entity, so no life dates', copy: 'Johannes Vermeer' },
            venue: { text: 'Mauritshuis', sub: 'via Europeana', tip: 'Mauritshuis, The Hague · provided via Dutch Collections for Europe', copy: 'Mauritshuis' },
            date: { text: '1665', tip: 'Source sends "#1665%2F1665" and "1665 - 1665"; shown as 1665', copy: '1665', sort: 1665 },
            audience: { text: '38,204', tip: 'Illustrative: en.wikipedia.org/wiki/Girl_with_a_Pearl_Earring · 7 days', copy: '38204', sort: 38204 },
            rating: '4 / 5',
            identifier: {
                text: 'europeana:/2021672/resource_document_mauritshuis_670 · Q185372',
                tip: 'wikidata.org/wiki/Q185372, resolved from P217 "670" + P195 Mauritshuis — "670" alone also matches a Holy Family at the Rijksmuseum (Q17347632)',
                copy: 'europeana:/2021672/resource_document_mauritshuis_670'
            },
            description: 'Girl with a Pearl Earring is Vermeer’s most famous painting. It is not a portrait, but a ‘tronie’ – a painting of an imaginary figure. Tronies depict a certain type or character; in this case a girl in exotic dress, wearing an oriental turban and an improbably large pearl in her ear.',
            category: 'Dutch Golden Age',
            createdAt: '2026-10-29',
            url: 'https://www.europeana.eu/item/2021672/resource_document_mauritshuis_670',
            wikidata: 'Q185372',
            source: 'Europeana',
            originalTitle: 'Meisje met de parel',
            'detail:Dimensions': '65 cm · 39 cm · 44.5 cm · 74 cm (dcFormat, unlabelled — framed and unframed sizes cannot be told apart)',
            'detail:Inventory no.': '670',
            'detail:Provided via': 'Dutch Collections for Europe',
            'detail:Image rights': 'Public Domain Mark 1.0 — open, full-size image allowed',
            perspectives: '5',
            avgRating: '4.6',
            updatedAt: '2026-10-29'
        },
        {
            item: {
                text: 'Portrait of A. Gallen-Kallela',
                sub: 'europeana:/2021012/_27D4FC0D781D36E6EEF294654E19A7D7',
                img: 'https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Fmpfinlandrepox.zetcom.app%2Fimagehelper%2Fdownload%3Fid%3D1228063%26size%3Dextra_large%26org%3D39091&type=IMAGE',
                href: 'https://www.europeana.eu/item/2021012/_27D4FC0D781D36E6EEF294654E19A7D7',
                tip: 'Portrait of A. Gallen-Kallela · fi A. Gallen-Kallelan muotokuva · sv Porträtt av A. Gallen-Kallela · Europeana · Finnish National Gallery',
                copy: 'Portrait of A. Gallen-Kallela'
            },
            rights: { text: 'CC0', tip: 'CC0 1.0 · open', copy: 'http://creativecommons.org/publicdomain/zero/1.0/', sort: 0 },
            genre: { text: 'Oil on canvas', tip: 'Oil on canvas · rebuilt from dctermsMedium "base material: canvas; material: oil" (dcDescription "technique: oil on canvas" agrees)', copy: 'Oil on canvas' },
            creator: { text: 'Ilja Repin', sub: '—', tip: 'Ilja Repin · source wrote "Repin, Ilja" (Finnish transliteration; Wikidata has Ilya Repin) · no agent entity, so no life dates', copy: 'Ilja Repin' },
            venue: { text: 'Finnish National Gallery', sub: 'via Europeana', tip: 'Finnish National Gallery (Ateneum), Helsinki · provided via the National Library of Finland', copy: 'Finnish National Gallery' },
            date: { text: '1920', tip: 'Source sends "Production 1920"; shown as 1920', copy: '1920', sort: 1920 },
            identifier: {
                text: 'europeana:/2021012/_27D4FC0D781D36E6EEF294654E19A7D7 · Q20087079',
                tip: 'wikidata.org/wiki/Q20087079 (P217 "A II 1403" + P195 Finnish National Gallery) · inventory A II 1403',
                copy: 'europeana:/2021012/_27D4FC0D781D36E6EEF294654E19A7D7'
            },
            category: 'Portrait',
            createdAt: '2026-10-29',
            url: 'https://www.europeana.eu/item/2021012/_27D4FC0D781D36E6EEF294654E19A7D7',
            wikidata: 'Q20087079',
            source: 'Europeana',
            'detail:Dimensions': 'teosmitat: 100,0 x 81,0 cm (Finnish only)',
            'detail:Inventory no.': 'A II 1403',
            'detail:Provided via': 'National Library of Finland',
            'detail:Image rights': 'CC0 1.0 — open, full-size image allowed',
            perspectives: '0',
            avgRating: '—',
            updatedAt: '2026-10-29'
        },
        {
            item: {
                text: 'Study',
                sub: 'europeana:/1354/https___catalonica_bnc_cat_catalonicahub_lod_H703130_ent0',
                img: 'https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Fapp.coeli.cat%2Fcoeli%2FMNAC%2FHeritageObject%2FH703130%2FportraitMedia&type=IMAGE',
                href: 'https://www.europeana.eu/item/1354/https___catalonica_bnc_cat_catalonicahub_lod_H703130_ent0',
                tip: 'Study · ca Estudi · es Estudio · Europeana · MNAC · CC BY-NC: Europeana preview only, links out for the full image',
                copy: 'Study'
            },
            rights: { text: 'BY-NC', tip: 'CC BY-NC 4.0 · restricted — preview only; credit Isidre Nonell / MNAC; no full-size image while Perspectize could be commercial', copy: 'http://creativecommons.org/licenses/by-nc/4.0/', sort: 1 },
            creator: { text: 'Isidre Nonell', sub: '—', tip: 'Isidre Nonell · dcCreator\'s first value is the URI data.europeana.eu/agent/22714, resolved to its label; the record\'s agents give no life dates', copy: 'Isidre Nonell' },
            venue: { text: 'MNAC', sub: 'via Europeana', tip: 'Museu Nacional d\'Art de Catalunya, Barcelona · provided via Catalònica', copy: 'National Museum of Art of Catalonia' },
            date: { text: '1906', copy: '1906', sort: 1906 },
            identifier: {
                text: 'europeana:/1354/…H703130_ent0 · no QID',
                tip: 'europeana.eu/item/1354/https___catalonica_bnc_cat_catalonicahub_lod_H703130_ent0 · no Wikidata item for inventory H703130, so this row cannot be deduped across sources',
                copy: 'europeana:/1354/https___catalonica_bnc_cat_catalonicahub_lod_H703130_ent0'
            },
            tags: { text: 'painting', items: ['painting'], tip: 'dcSubject "painting" — the type repeated as a subject; worth filtering out' },
            createdAt: '2026-10-29',
            url: 'https://www.europeana.eu/item/1354/https___catalonica_bnc_cat_catalonicahub_lod_H703130_ent0',
            source: 'Europeana',
            originalTitle: 'Estudi',
            'detail:Dimensions': '100.5 x 80.5 cm',
            'detail:Inventory no.': 'H703130',
            'detail:Provided via': 'Catalònica',
            'detail:Image rights': 'CC BY-NC 4.0 — restricted: Europeana preview only, full image at museunacional.cat',
            perspectives: '0',
            avgRating: '—',
            updatedAt: '2026-10-29'
        }
    ],
    // Museum family samples: 3 Met + 2 Europeana per type, real records fetched
    // 2026-10-29 (Met /objects, Europeana record/v2). Generated from the API
    // JSON, then Europeana values normalised by hand with the rule each one
    // exercises noted in its popover tip. Pageviews, perspective counts, ratings
    // and "added" dates are illustrative.
    sculpture: [
        {
            item: { text: "The Little Fourteen-Year-Old Dancer", sub: "met:196439", img: "https://images.metmuseum.org/CRDImages/es/web-large/DP-14939-001.jpg", href: "https://www.metmuseum.org/art/collection/search/196439", tip: "The Little Fourteen-Year-Old Dancer · The Met", copy: "The Little Fourteen-Year-Old Dancer" },
            rights: { text: "CC0", tip: "Open access at the Met (isPublicDomain = true) · CC0 1.0", copy: "https://creativecommons.org/publicdomain/zero/1.0/", sort: 0 },
            genre: "Partially tinted bronze, cotton tarlatan, silk satin, and wood",
            creator: { text: "Edgar Degas", sub: "French, Paris 1834–1917 Paris", copy: "Edgar Degas" },
            venue: { text: "The Met", sub: "European Sculpture and Decorative Arts", copy: "The Met" },
            date: { text: "modeled 1881, cast 1922, modern tutu", tip: "modeled 1881, cast 1922 — the Met sorts on the cast (objectBeginDate 1922), not the modelling date", copy: "1922", sort: 1922 },
            releaseStatus: { text: "● Gallery 815", tip: "On view · Gallery 815", copy: "815" },
            audience: { text: "18,240", tip: "Illustrative 7-day English Wikipedia views", copy: "18240", sort: 18240 },
            rating: "5 / 5",
            status: "Seen in person",
            identifier: { text: "met:196439 · Q104413012", tip: "metmuseum.org/art/collection/search/196439 · accession 29.100.370", copy: "met:196439" },
            tags: { text: "Girls, Dancers +1", items: ["Girls", "Dancers", "Ballet"] },
            category: "Impressionism",
            createdAt: "2026-10-29",
            url: "https://www.metmuseum.org/art/collection/search/196439",
            wikidata: "Q104413012",
            source: "The Met",
            "detail:Artist bio": "French, Paris 1834–1917 Paris",
            "detail:Dimensions": "Overall (confirmed): H. 38 1/2 x W. 17 1/4 x D. 14 3/8 in. (97.8 x 43.8 x 36.5 cm) [n.b.: fluffiness of skirt skews measurement]",
            "detail:Credit line": "H. O. Havemeyer Collection, Bequest of Mrs. H. O. Havemeyer, 1929",
            "detail:Inventory no.": "29.100.370",
            "detail:Image rights": "Public domain (CC0)",
            perspectives: "4",
            avgRating: "4.7",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Perseus with the Head of Medusa", sub: "met:204758", img: "https://images.metmuseum.org/CRDImages/es/web-large/DP249451.jpg", href: "https://www.metmuseum.org/art/collection/search/204758", tip: "Perseus with the Head of Medusa · The Met", copy: "Perseus with the Head of Medusa" },
            rights: { text: "CC0", tip: "Open access at the Met (isPublicDomain = true) · CC0 1.0", copy: "https://creativecommons.org/publicdomain/zero/1.0/", sort: 0 },
            genre: "Marble",
            creator: { text: "Antonio Canova", sub: "Italian, Possagno 1757–1822 Venice", copy: "Antonio Canova" },
            venue: { text: "The Met", sub: "European Sculpture and Decorative Arts", copy: "The Met" },
            date: { text: "1804–6", tip: "1804–6 · sorted as 1804", copy: "1804", sort: 1804 },
            releaseStatus: { text: "● Gallery 548", tip: "On view · Gallery 548", copy: "548" },
            audience: { text: "2,960", tip: "Illustrative 7-day English Wikipedia views", copy: "2960", sort: 2960 },
            identifier: { text: "met:204758 · Q29383614", tip: "metmuseum.org/art/collection/search/204758 · accession 67.110.1", copy: "met:204758" },
            tags: { text: "Swords, Male Nudes +2", items: ["Swords", "Male Nudes", "Medusa", "Perseus"] },
            category: "Neoclassicism",
            createdAt: "2026-10-29",
            url: "https://www.metmuseum.org/art/collection/search/204758",
            wikidata: "Q29383614",
            source: "The Met",
            "detail:Artist bio": "Italian, Possagno 1757–1822 Venice",
            "detail:Dimensions": "Overall (confirmed): H. 95 1/2 x W. 75 1/2 x D. 40 1/2 in. (242.6 x 191.8 x 102.9 cm)",
            "detail:Credit line": "Fletcher Fund, 1967",
            "detail:Inventory no.": "67.110.1",
            "detail:Image rights": "Public domain (CC0)",
            perspectives: "1",
            avgRating: "4.0",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Limestone Herakles", sub: "met:242008", img: "https://images.metmuseum.org/CRDImages/gr/web-large/DT257600.jpg", href: "https://www.metmuseum.org/art/collection/search/242008", tip: "Limestone Herakles · The Met", copy: "Limestone Herakles" },
            rights: { text: "CC0", tip: "Open access at the Met (isPublicDomain = true) · CC0 1.0", copy: "https://creativecommons.org/publicdomain/zero/1.0/", sort: 0 },
            genre: "Limestone",
            creator: { text: "Cypriot · Archaic", sub: "anonymous", tip: "No artist: the cell shows the Met culture and period instead", copy: "Cypriot · Archaic" },
            venue: { text: "The Met", sub: "Greek and Roman Art", copy: "The Met" },
            date: { text: "ca. 530–520 BCE", tip: "ca. 530–520 BCE · sorted as -530", copy: "-530", sort: -530 },
            identifier: { text: "met:242008 · Q29383713", tip: "metmuseum.org/art/collection/search/242008 · accession 74.51.2455", copy: "met:242008" },
            tags: { text: "Men, Herakles", items: ["Men", "Herakles"] },
            category: "Archaic",
            createdAt: "2026-10-29",
            url: "https://www.metmuseum.org/art/collection/search/242008",
            wikidata: "Q29383713",
            source: "The Met",
            "detail:Culture": "Cypriot · Archaic",
            "detail:Dimensions": "Overall: 78 × 19 × 12 in., 895 lb. (198.1 × 48.3 × 30.5 cm, 406 kg)",
            "detail:Credit line": "The Cesnola Collection, Purchased by subscription, 1874–76",
            "detail:Inventory no.": "74.51.2455",
            "detail:Image rights": "Public domain (CC0)",
            perspectives: "0",
            avgRating: "—",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Saint Giles and the Hind", sub: "europeana:/90402/BK_NM_2731", img: "https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Flh4.ggpht.com%2FhwOtkzIdI7cqrJoGPeyWNqT941l_diwYzePELmGEBIPyOCaHQKsWeSbuyTnH9PMi0drX1P6sHWdDY-USqGaOAed6ILU%3Ds0&type=IMAGE", href: "https://www.europeana.eu/item/90402/BK_NM_2731", tip: "Saint Giles and the Hind · original title Sint-Egidius met hert · Europeana · Rijksmuseum", copy: "Saint Giles and the Hind" },
            rights: { text: "PD", tip: "Public Domain Mark 1.0 · open", copy: "http://creativecommons.org/publicdomain/mark/1.0/", sort: 0 },
            genre: { text: "Oak", tip: "From dcFormat \"oak (wood)\" (Getty AAT 300012264)", copy: "Oak" },
            creator: { text: "Anonymous", sub: "no maker recorded", tip: "dcCreator and agents are both empty — Europeana has no culture field to fall back on", copy: "" },
            venue: { text: "Rijksmuseum", sub: "via Europeana", copy: "Rijksmuseum" },
            date: { text: "1525", copy: "1525", sort: 1525 },
            identifier: { text: "europeana:/90402/BK_NM_2731 · no QID", tip: "europeana.eu/item/90402/BK_NM_2731 · inventory BK-NM-2731 has no Wikidata item", copy: "europeana:/90402/BK_NM_2731" },
            description: "In the Middle Ages, there were countless saints who could protect believers from every disease or disaster. Saint Giles, dressed and shorn like a Benedictine monk, was the patron saint of hunters, foresters, archers and cattle dealers.",
            category: "Late Gothic",
            createdAt: "2026-10-29",
            url: "https://www.europeana.eu/item/90402/BK_NM_2731",
            source: "Europeana",
            originalTitle: "Sint-Egidius met hert",
            "detail:Dimensions": "height 58.5 cm · width 25 cm · depth 22 cm · depth 19.5 cm (base)",
            "detail:Inventory no.": "BK-NM-2731",
            "detail:Provided via": "Rijksmuseum (direct)",
            "detail:Image rights": "Public Domain Mark 1.0 — open, full-size image allowed",
            perspectives: "0",
            avgRating: "—",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Cupid and Psyche", sub: "europeana:/2021012/_132FDAD8CD416B06FB5F01C72851F3E9", img: "https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Fmpfinlandrepox.zetcom.app%2Fimagehelper%2Fdownload%3Fid%3D332185%26size%3Dextra_large%26org%3D39091&type=IMAGE", href: "https://www.europeana.eu/item/2021012/_132FDAD8CD416B06FB5F01C72851F3E9", tip: "Europeana says \"Amor and Psyche\"; shown with Wikidata's English label · sv Amor och Psyche · Finnish National Gallery", copy: "Cupid and Psyche" },
            rights: { text: "CC0", tip: "CC0 1.0 · open", copy: "http://creativecommons.org/publicdomain/zero/1.0/", sort: 0 },
            genre: { text: "Marble", tip: "From dctermsMedium \"material: marble\"", copy: "Marble" },
            creator: { text: "Johan Tobias Sergel", sub: "—", tip: "Source wrote \"Sergel, Johan Tobias\"; the agent has no life dates", copy: "Johan Tobias Sergel" },
            venue: { text: "Finnish National Gallery", sub: "via Europeana", copy: "Finnish National Gallery" },
            date: { text: "1789", tip: "Source sends \"Production 1789, Production 1789\"", copy: "1789", sort: 1789 },
            identifier: { text: "europeana:/2021012/_132FDAD8CD416B06FB5F01C72851F3E9 · Q28056825", tip: "Resolved from P217 \"B I 372\" + P195 Finnish National Gallery — the only one of the eight new Europeana samples with a QID", copy: "europeana:/2021012/_132FDAD8CD416B06FB5F01C72851F3E9" },
            category: "Neoclassicism",
            createdAt: "2026-10-29",
            url: "https://www.europeana.eu/item/2021012/_132FDAD8CD416B06FB5F01C72851F3E9",
            wikidata: "Q28056825",
            source: "Europeana",
            originalTitle: "Amor och Psyche",
            "detail:Inventory no.": "B I 372",
            "detail:Provided via": "National Library of Finland",
            "detail:Image rights": "CC0 1.0 — open, full-size image allowed",
            perspectives: "1",
            avgRating: "4.0",
            updatedAt: "2026-10-29"
        }
    ],
    drawing: [
        {
            item: { text: "Compositional Sketches for the Virgin Adoring the Christ Child, with and without the Infant St. John the Baptist; Diagram of a Perspectival Projection (recto); Slight Doodles (verso)", sub: "met:337494", img: "https://images.metmuseum.org/CRDImages/dp/web-large/DP832657.jpg", href: "https://www.metmuseum.org/art/collection/search/337494", tip: "Compositional Sketches for the Virgin Adoring the Christ Child, with and without the Infant St. John the Baptist; Diagram of a Perspectival Projection (recto); Slight Doodles (verso) · The Met", copy: "Compositional Sketches for the Virgin Adoring the Christ Child, with and without the Infant St. John the Baptist; Diagram of a Perspectival Projection (recto); Slight Doodles (verso)" },
            rights: { text: "CC0", tip: "Open access at the Met (isPublicDomain = true) · CC0 1.0", copy: "https://creativecommons.org/publicdomain/zero/1.0/", sort: 0 },
            genre: "Silverpoint, partly reworked by the artist with pen and dark brown ink on pink prepared paper; lines ruled with metalpoint (recto); pen and brown ink (verso)",
            creator: { text: "Leonardo da Vinci", sub: "Italian, Vinci 1452–1519 Amboise", copy: "Leonardo da Vinci" },
            venue: { text: "The Met", sub: "Drawings and Prints", copy: "The Met" },
            date: { text: "1480–85", tip: "1480–85 · sorted as 1480", copy: "1480", sort: 1480 },
            rating: "5 / 5",
            identifier: { text: "met:337494 · Q29384842", tip: "metmuseum.org/art/collection/search/337494 · accession 17.142.1", copy: "met:337494" },
            tags: { text: "Christ, Saint John the Baptist +1", items: ["Christ", "Saint John the Baptist", "Virgin Mary"] },
            category: "Italian Renaissance",
            createdAt: "2026-10-29",
            url: "https://www.metmuseum.org/art/collection/search/337494",
            wikidata: "Q29384842",
            source: "The Met",
            "detail:Artist bio": "Italian, Vinci 1452–1519 Amboise",
            "detail:Dimensions": "7 5/8 x 6 3/8 in. (19.3 x 16.2 cm)",
            "detail:Credit line": "Rogers Fund, 1917",
            "detail:Inventory no.": "17.142.1",
            "detail:Image rights": "Public domain (CC0)",
            perspectives: "2",
            avgRating: "4.5",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Corridor in the Asylum", sub: "met:336327", img: "https://images.metmuseum.org/CRDImages/dp/web-large/DT365509.jpg", href: "https://www.metmuseum.org/art/collection/search/336327", tip: "Corridor in the Asylum · The Met", copy: "Corridor in the Asylum" },
            rights: { text: "CC0", tip: "Open access at the Met (isPublicDomain = true) · CC0 1.0", copy: "https://creativecommons.org/publicdomain/zero/1.0/", sort: 0 },
            genre: { text: "Brush and oils over black chalk on pink laid paper", tip: "A drawing in oils: the Met classifies it Drawings, so it routes to Drawing, not Painting", copy: "Brush and oils over black chalk on pink laid paper" },
            creator: { text: "Vincent van Gogh", sub: "Dutch, Zundert 1853–1890 Auvers-sur-Oise", copy: "Vincent van Gogh" },
            venue: { text: "The Met", sub: "Drawings and Prints", copy: "The Met" },
            date: { text: "September 1889", tip: "September 1889 · sorted as 1889", copy: "1889", sort: 1889 },
            audience: { text: "1,180", tip: "Illustrative 7-day English Wikipedia views", copy: "1180", sort: 1180 },
            identifier: { text: "met:336327 · Q29384740", tip: "metmuseum.org/art/collection/search/336327 · accession 48.190.2", copy: "met:336327" },
            tags: { text: "Hospitals, Interiors", items: ["Hospitals", "Interiors"] },
            category: "Post-Impressionism",
            createdAt: "2026-10-29",
            url: "https://www.metmuseum.org/art/collection/search/336327",
            wikidata: "Q29384740",
            source: "The Met",
            "detail:Artist bio": "Dutch, Zundert 1853–1890 Auvers-sur-Oise",
            "detail:Dimensions": "25 5/8 x 19 5/16in. (65.1 x 49.1cm)",
            "detail:Credit line": "Bequest of Abby Aldrich Rockefeller, 1948",
            "detail:Inventory no.": "48.190.2",
            "detail:Image rights": "Public domain (CC0)",
            perspectives: "1",
            avgRating: "4.0",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Nurse and Child", sub: "met:10405", href: "https://www.metmuseum.org/art/collection/search/10405", tip: "No open-access image (isPublicDomain = false; Cassatt died 1926 but the Met has not released it) — icon tile, links out", copy: "Nurse and Child" },
            rights: { text: "Not OA", tip: "Not open access at the Met (isPublicDomain = false) — no image is shown", copy: "met:isPublicDomain=false", sort: 2 },
            genre: { text: "Pastel on wove paper (originally blue), mounted on canvas", tip: "Pastel mounted on canvas — still a Drawing by objectName", copy: "Pastel on wove paper (originally blue), mounted on canvas" },
            creator: { text: "Mary Cassatt", sub: "American, Pittsburgh, Pennsylvania 1844–1926 Le Mesnil-Théribus, Oise", copy: "Mary Cassatt" },
            venue: { text: "The Met", sub: "The American Wing", copy: "The Met" },
            date: { text: "1896–97", tip: "1896–97 · sorted as 1896", copy: "1896", sort: 1896 },
            identifier: { text: "met:10405 · Q98224467", tip: "metmuseum.org/art/collection/search/10405 · accession 60.181", copy: "met:10405" },
            tags: { text: "Girls, Women", items: ["Girls", "Women"] },
            category: "Impressionism",
            createdAt: "2026-10-29",
            url: "https://www.metmuseum.org/art/collection/search/10405",
            wikidata: "Q98224467",
            source: "The Met",
            "detail:Artist bio": "American, Pittsburgh, Pennsylvania 1844–1926 Le Mesnil-Théribus, Oise",
            "detail:Culture": "American",
            "detail:Dimensions": "31 1/2 x 26 1/4 in. (80 x 66.7 cm)",
            "detail:Credit line": "Gift of Mrs. Ralph J. Hines, 1960",
            "detail:Inventory no.": "60.181",
            "detail:Image rights": "Not open access at the Met — no image shown",
            perspectives: "0",
            avgRating: "—",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Rainshower in Koli", sub: "europeana:/2021012/_10D16E00175C7935E2A10D19CDD8073B", img: "https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Fmpfinlandrepox.zetcom.app%2Fimagehelper%2Fdownload%3Fid%3D300331%26size%3Dextra_large%26org%3D39091&type=IMAGE", href: "https://www.europeana.eu/item/2021012/_10D16E00175C7935E2A10D19CDD8073B", tip: "The \"en\" title is \"Lanskap från Koli ; Rainshower in Koli\" — Swedish and English joined; the part after \" ; \" is kept · fi Maisema Kolilta", copy: "Rainshower in Koli" },
            rights: { text: "CC0", tip: "CC0 1.0 · open", copy: "http://creativecommons.org/publicdomain/zero/1.0/", sort: 0 },
            creator: { text: "Eero Järnefelt", sub: "—", tip: "Source wrote \"Järnefelt, Eero\"; no agent entity", copy: "Eero Järnefelt" },
            venue: { text: "Finnish National Gallery", sub: "via Europeana", copy: "Finnish National Gallery" },
            date: { text: "1910–1915", tip: "Source sends \"Production 1910-1915\" · sorted as 1910", copy: "1910", sort: 1910 },
            identifier: { text: "europeana:/2021012/_10D16E00175C7935E2A10D19CDD8073B · no QID", tip: "inventory A-1993-108 has no Wikidata item", copy: "europeana:/2021012/_10D16E00175C7935E2A10D19CDD8073B" },
            category: "Landscape",
            createdAt: "2026-10-29",
            url: "https://www.europeana.eu/item/2021012/_10D16E00175C7935E2A10D19CDD8073B",
            source: "Europeana",
            originalTitle: "Maisema Kolilta",
            "detail:Dimensions": "teosmitat: 34,0 x 26,0 cm (Finnish only)",
            "detail:Inventory no.": "A-1993-108",
            "detail:Provided via": "National Library of Finland",
            "detail:Image rights": "CC0 1.0 — open, full-size image allowed",
            perspectives: "0",
            avgRating: "—",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Portret van Rembrandt", sub: "europeana:/90402/RP_T_1887_A_1077", img: "https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Fwww.rijksmuseum.nl%2Fassetimage2.jsp%3Fid%3DRP-T-1887-A-1077&type=IMAGE", href: "https://www.europeana.eu/item/90402/RP_T_1887_A_1077", tip: "Dutch title only — no English in the record. A portrait OF Rembrandt: it matched a search for Rembrandt drawings", copy: "Portret van Rembrandt" },
            rights: { text: "PD", tip: "Public Domain Mark 1.0 · open", copy: "http://creativecommons.org/publicdomain/mark/1.0/", sort: 0 },
            genre: { text: "Chalk and ink on paper", tip: "Rebuilt from dcFormat \"paper; chalk; ink\" (dcType adds \"brush\"); dctermsMedium holds the credit line", copy: "Chalk and ink on paper" },
            creator: { text: "Moses ter Borch", sub: "1645–1667", tip: "dcCreator is empty; the only agent is \"Borch, Moses ter\" (no English label) — not Rembrandt, the sitter", copy: "Moses ter Borch" },
            venue: { text: "Rijksmuseum", sub: "via Europeana", copy: "Rijksmuseum" },
            date: { text: "1660", copy: "1660", sort: 1660 },
            identifier: { text: "europeana:/90402/RP_T_1887_A_1077 · no QID", tip: "inventory RP-T-1887-A-1077 has no Wikidata item", copy: "europeana:/90402/RP_T_1887_A_1077" },
            category: "Dutch Golden Age",
            createdAt: "2026-10-29",
            url: "https://www.europeana.eu/item/90402/RP_T_1887_A_1077",
            source: "Europeana",
            "detail:Artist bio": "1645–1667 (Europeana agent dates only)",
            "detail:Dimensions": "height 129 mm · width 127 mm",
            "detail:Credit line": "Purchased with the support of the Vereniging Rembrandt (from dctermsMedium)",
            "detail:Inventory no.": "RP-T-1887-A-1077",
            "detail:Provided via": "Rijksmuseum (direct)",
            "detail:Image rights": "Public Domain Mark 1.0 — open, full-size image allowed",
            perspectives: "0",
            avgRating: "—",
            updatedAt: "2026-10-29"
        }
    ],
    print: [
        {
            item: { text: "Melencolia I", sub: "met:336228", img: "https://images.metmuseum.org/CRDImages/dp/web-large/DP820348.jpg", href: "https://www.metmuseum.org/art/collection/search/336228", tip: "Melencolia I · The Met", copy: "Melencolia I" },
            rights: { text: "CC0", tip: "Open access at the Met (isPublicDomain = true) · CC0 1.0", copy: "https://creativecommons.org/publicdomain/zero/1.0/", sort: 0 },
            genre: "Engraving",
            creator: { text: "Albrecht Dürer", sub: "German, Nuremberg 1471–1528 Nuremberg", copy: "Albrecht Dürer" },
            venue: { text: "The Met", sub: "Drawings and Prints", copy: "The Met" },
            date: { text: "1514", tip: "1514 · sorted as 1514", copy: "1514", sort: 1514 },
            audience: { text: "16,330", tip: "Illustrative 7-day English Wikipedia views", copy: "16330", sort: 16330 },
            rating: "5 / 5",
            status: "Seen in reproduction only",
            identifier: { text: "met:336228 · work Q1362177", tip: "This impression is the row; Q1362177 is the work, held by 20+ collections — including the Rijksmuseum impression in Europeana", copy: "met:336228" },
            tags: { text: "Contemplation, Putti +2", items: ["Contemplation", "Putti", "Dogs", "Geometry"] },
            category: "Northern Renaissance",
            createdAt: "2026-10-29",
            url: "https://www.metmuseum.org/art/collection/search/336228",
            wikidata: "Q1362177",
            source: "The Met",
            "detail:Artist bio": "German, Nuremberg 1471–1528 Nuremberg",
            "detail:Dimensions": "Sheet: 9 1/2 × 7 3/8 in. (24.1 × 18.7 cm)",
            "detail:Credit line": "Harris Brisbane Dick Fund, 1943",
            "detail:Inventory no.": "43.106.1",
            "detail:Image rights": "Public domain (CC0)",
            perspectives: "5",
            avgRating: "4.6",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Under the Wave off Kanagawa (Kanagawa oki nami ura), also known as The Great Wave, from the series Thirty-six Views of Mount Fuji (Fugaku sanjūrokkei)", sub: "met:45434", img: "https://images.metmuseum.org/CRDImages/as/web-large/DP130155.jpg", href: "https://www.metmuseum.org/art/collection/search/45434", tip: "Under the Wave off Kanagawa (Kanagawa oki nami ura), also known as The Great Wave, from the series Thirty-six Views of Mount Fuji (Fugaku sanjūrokkei) · The Met", copy: "Under the Wave off Kanagawa (Kanagawa oki nami ura), also known as The Great Wave, from the series Thirty-six Views of Mount Fuji (Fugaku sanjūrokkei)" },
            rights: { text: "CC0", tip: "Open access at the Met (isPublicDomain = true) · CC0 1.0", copy: "https://creativecommons.org/publicdomain/zero/1.0/", sort: 0 },
            genre: "Woodblock print; ink and color on paper",
            creator: { text: "Katsushika Hokusai", sub: "Japanese, Tokyo (Edo) 1760–1849 Tokyo (Edo)", copy: "Katsushika Hokusai" },
            venue: { text: "The Met", sub: "Asian Art", copy: "The Met" },
            date: { text: "ca. 1830–32", tip: "ca. 1830–32 · the Met sorts it on objectBeginDate 1820 (objectEndDate 1842)", copy: "1820", sort: 1820 },
            audience: { text: "41,210", tip: "Illustrative 7-day English Wikipedia views", copy: "41210", sort: 41210 },
            rating: "5 / 5",
            status: "Seen in person",
            identifier: { text: "met:45434 · work Q28912605", tip: "Q28912605 is the work; the Art Institute of Chicago holds another impression under the same QID", copy: "met:45434" },
            tags: { text: "Waves, Boats", items: ["Waves", "Boats"] },
            category: "Ukiyo-e",
            createdAt: "2026-10-29",
            url: "https://www.metmuseum.org/art/collection/search/45434",
            wikidata: "Q28912605",
            source: "The Met",
            "detail:Artist bio": "Japanese, Tokyo (Edo) 1760–1849 Tokyo (Edo)",
            "detail:Culture": "Japan · Edo period (1615–1868)",
            "detail:Dimensions": "10 1/8 x 14 15/16 in. (25.7 x 37.9 cm)",
            "detail:Credit line": "H. O. Havemeyer Collection, Bequest of Mrs. H. O. Havemeyer, 1929",
            "detail:Inventory no.": "JP1847",
            "detail:Image rights": "Public domain (CC0)",
            perspectives: "7",
            avgRating: "4.9",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Marilyn", sub: "met:352328", href: "https://www.metmuseum.org/art/collection/search/352328", tip: "In copyright (Warhol, 1967) — no image at the Met; icon tile, links out", copy: "Marilyn" },
            rights: { text: "Not OA", tip: "Not open access at the Met (isPublicDomain = false) — no image is shown", copy: "met:isPublicDomain=false", sort: 2 },
            genre: "Screenprint",
            creator: { text: "Andy Warhol", sub: "American, Pittsburgh, Pennsylvania 1928–1987 New York", copy: "Andy Warhol" },
            venue: { text: "The Met", sub: "Drawings and Prints", copy: "The Met" },
            date: { text: "1967", tip: "1967 · sorted as 1967", copy: "1967", sort: 1967 },
            identifier: { text: "met:352328 · work Q98843233", tip: "metmuseum.org/art/collection/search/352328 · accession 67.855", copy: "met:352328" },
            tags: { text: "Portraits, Women +1", items: ["Portraits", "Women", "Actresses"] },
            category: "Pop art",
            createdAt: "2026-10-29",
            url: "https://www.metmuseum.org/art/collection/search/352328",
            wikidata: "Q98843233",
            source: "The Met",
            "detail:Artist bio": "American, Pittsburgh, Pennsylvania 1928–1987 New York",
            "detail:Dimensions": "Sheet: 6 x 6 in. (15.2 x 15.2 cm)",
            "detail:Credit line": "Gift of Factory Additions, 1967",
            "detail:Inventory no.": "67.855",
            "detail:Image rights": "Not open access at the Met — no image shown",
            perspectives: "2",
            avgRating: "3.5",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Melencolia I", sub: "europeana:/90402/RP_P_OB_11_705", img: "https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Flh3.ggpht.com%2F9991p8xWeiuZiP7zCNQFxS46aiYnjjLEuSPW1SJNAm_ZPQoOT62FKCDmdDNrA-S2h7ij-O7dwLwWtwqYHMn_-Ojv7Bs%3Ds0&type=IMAGE", href: "https://www.europeana.eu/item/90402/RP_P_OB_11_705", tip: "The record has only Dutch titles (\"Melancholie\", \"Melencolia I\"); the second is the work's own title · Rijksmuseum impression of the same work as met:336228", copy: "Melencolia I" },
            rights: { text: "PD", tip: "Public Domain Mark 1.0 · open", copy: "http://creativecommons.org/publicdomain/mark/1.0/", sort: 0 },
            genre: { text: "Engraving", tip: "From dcType \"print; engraving\"; dcFormat adds \"paper\"", copy: "Engraving" },
            creator: { text: "Albrecht Dürer", sub: "1471–1528", tip: "Source wrote \"Dürer, Albrecht\"", copy: "Albrecht Dürer" },
            venue: { text: "Rijksmuseum", sub: "via Europeana", copy: "Rijksmuseum" },
            date: { text: "1514", copy: "1514", sort: 1514 },
            identifier: { text: "europeana:/90402/RP_P_OB_11_705 · work Q1362177", tip: "No QID for this impression; the work Q1362177 would be found by title + maker + date (proposed, not tested). Grouped with met:336228 under \"Other impressions\", never merged", copy: "europeana:/90402/RP_P_OB_11_705" },
            description: "Het melancholische temperament, in de gedaante van een gevleugelde vrouw die peinzend voor zich uitkijkt, de kaak op de linkerhand gesteund, een passer in de hand.",
            category: "Northern Renaissance",
            createdAt: "2026-10-29",
            url: "https://www.europeana.eu/item/90402/RP_P_OB_11_705",
            wikidata: "Q1362177",
            source: "Europeana",
            originalTitle: "Melancholie",
            "detail:Artist bio": "1471–1528 (Europeana agent dates only)",
            "detail:Dimensions": "height 239 mm · width 185 mm (sheet)",
            "detail:Inventory no.": "RP-P-OB-11.705",
            "detail:Other impressions": "met:336228 (The Met) ✓; British Museum; Städel Museum; … 20+ collections on Wikidata",
            "detail:Provided via": "Rijksmuseum (direct)",
            "detail:Image rights": "Public Domain Mark 1.0 — open, full-size image allowed",
            perspectives: "1",
            avgRating: "4.0",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Näyttelijä Iwai Hanshiro V", sub: "europeana:/2021012/_074E21A118EB618FE818A2FFF0398680", img: "https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Fmpfinlandrepox.zetcom.app%2Fimagehelper%2Fdownload%3Fid%3D314110%26size%3Dextra_large%26org%3D39091&type=IMAGE", href: "https://www.europeana.eu/item/2021012/_074E21A118EB618FE818A2FFF0398680", tip: "Finnish title only (\"The actor Iwai Hanshirō V\") — shown as the source wrote it, flagged \"fi\"", copy: "Näyttelijä Iwai Hanshiro V" },
            rights: { text: "CC0", tip: "CC0 1.0 · open", copy: "http://creativecommons.org/publicdomain/zero/1.0/", sort: 0 },
            genre: { text: "Colour woodcut", tip: "From dcDescription \"technique: colour woodcut\"; dcType \"Japanese woodblock print\"", copy: "Colour woodcut" },
            creator: { text: "Utagawa Kunisada", sub: "—", tip: "dcCreator is the URI data.europeana.eu/agent/148341 plus the literal \"Kunisada\"; the agent label \"Utagawa Kunisada\" is family-name first and has no comma, so it is not flipped", copy: "Utagawa Kunisada" },
            venue: { text: "Finnish National Gallery", sub: "via Europeana", copy: "Finnish National Gallery" },
            date: { text: "ca. 1815", tip: "Source sends \"Production 1815, Production n. 1815\" (n. = noin, about)", copy: "1815", sort: 1815 },
            identifier: { text: "europeana:/2021012/_074E21A118EB618FE818A2FFF0398680 · no QID", tip: "inventory A II 841:21 has no Wikidata item", copy: "europeana:/2021012/_074E21A118EB618FE818A2FFF0398680" },
            category: "Ukiyo-e",
            createdAt: "2026-10-29",
            url: "https://www.europeana.eu/item/2021012/_074E21A118EB618FE818A2FFF0398680",
            source: "Europeana",
            "detail:Series": "Antell collections (dctermsIsPartOf — a collection, not a print series)",
            "detail:Dimensions": "lehti: 37,1 x 25,7 cm (sheet, Finnish only)",
            "detail:Inventory no.": "A II 841:21",
            "detail:Provided via": "National Library of Finland",
            "detail:Image rights": "CC0 1.0 — open, full-size image allowed",
            perspectives: "0",
            avgRating: "—",
            updatedAt: "2026-10-29"
        }
    ],
    photograph: [
        {
            item: { text: "[The Great Wave, Sète]", sub: "met:261941", img: "https://images.metmuseum.org/CRDImages/ph/web-large/DP223650.jpg", href: "https://www.metmuseum.org/art/collection/search/261941", tip: "[The Great Wave, Sète] · The Met", copy: "[The Great Wave, Sète]" },
            rights: { text: "CC0", tip: "Open access at the Met (isPublicDomain = true) · CC0 1.0", copy: "https://creativecommons.org/publicdomain/zero/1.0/", sort: 0 },
            genre: "Albumen silver print from glass negative",
            creator: { text: "Gustave Le Gray", sub: "French, 1820–1884", copy: "Gustave Le Gray" },
            venue: { text: "The Met", sub: "Photographs", copy: "The Met" },
            date: { text: "1857", tip: "1857 · sorted as 1857", copy: "1857", sort: 1857 },
            releaseStatus: { text: "● Gallery 852", tip: "On view · Gallery 852", copy: "852" },
            audience: { text: "640", tip: "Illustrative 7-day English Wikipedia views", copy: "640", sort: 640 },
            identifier: { text: "met:261941 · work Q3209564", tip: "Q3209564 is the work, held by four collections (Met, BnF, LACMA, Troyes)", copy: "met:261941" },
            tags: { text: "Seascapes, Waves", items: ["Seascapes", "Waves"] },
            category: "Seascape",
            createdAt: "2026-10-29",
            url: "https://www.metmuseum.org/art/collection/search/261941",
            wikidata: "Q3209564",
            source: "The Met",
            "detail:Artist bio": "French, 1820–1884",
            "detail:Dimensions": "33.7 x 41.4 cm (13 1/4 x 16 5/16 in.)",
            "detail:Credit line": "Gift of John Goldsmith Phillips, 1976",
            "detail:Inventory no.": "1976.646",
            "detail:Image rights": "Public domain (CC0)",
            perspectives: "1",
            avgRating: "4.0",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "View on the Columbia, Cascades", sub: "met:262612", img: "https://images.metmuseum.org/CRDImages/ph/web-large/DT1173.jpg", href: "https://www.metmuseum.org/art/collection/search/262612", tip: "View on the Columbia, Cascades · The Met", copy: "View on the Columbia, Cascades" },
            rights: { text: "CC0", tip: "Open access at the Met (isPublicDomain = true) · CC0 1.0", copy: "https://creativecommons.org/publicdomain/zero/1.0/", sort: 0 },
            genre: "Albumen silver print from glass negative",
            creator: { text: "Carleton E. Watkins", sub: "American, 1829–1916", copy: "Carleton E. Watkins" },
            venue: { text: "The Met", sub: "Photographs", copy: "The Met" },
            date: { text: "1867", tip: "1867 · sorted as 1867", copy: "1867", sort: 1867 },
            identifier: { text: "met:262612 · work Q29384012", tip: "metmuseum.org/art/collection/search/262612 · accession 1979.622", copy: "met:262612" },
            tags: { text: "Rivers, Landscapes", items: ["Rivers", "Landscapes"] },
            category: "Landscape",
            createdAt: "2026-10-29",
            url: "https://www.metmuseum.org/art/collection/search/262612",
            wikidata: "Q29384012",
            source: "The Met",
            "detail:Artist bio": "American, 1829–1916",
            "detail:Dimensions": "40.0 x 52.4 cm (15 3/4 x 20 5/8 in.)",
            "detail:Credit line": "Warner Communications Inc. Purchase Fund and Harris Brisbane Dick Fund, 1979",
            "detail:Inventory no.": "1979.622",
            "detail:Image rights": "Public domain (CC0)",
            perspectives: "0",
            avgRating: "—",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "The Road West", sub: "met:266199", href: "https://www.metmuseum.org/art/collection/search/266199", tip: "In copyright — no image at the Met; icon tile, links out", copy: "The Road West" },
            rights: { text: "Not OA", tip: "Not open access at the Met (isPublicDomain = false) — no image is shown", copy: "met:isPublicDomain=false", sort: 2 },
            genre: "Gelatin silver print",
            creator: { text: "Dorothea Lange", sub: "American, 1895–1965", copy: "Dorothea Lange" },
            venue: { text: "The Met", sub: "Photographs", copy: "The Met" },
            date: { text: "1938", tip: "1938 · sorted as 1938", copy: "1938", sort: 1938 },
            identifier: { text: "met:266199 · work Q98822759", tip: "metmuseum.org/art/collection/search/266199 · accession 1990.1005", copy: "met:266199" },
            tags: { text: "Roads, Landscapes", items: ["Roads", "Landscapes"] },
            category: "Documentary",
            createdAt: "2026-10-29",
            url: "https://www.metmuseum.org/art/collection/search/266199",
            wikidata: "Q98822759",
            source: "The Met",
            "detail:Artist bio": "American, 1895–1965",
            "detail:Dimensions": "17.3 x 24 cm (6 13/16 x 9 7/16 in.)",
            "detail:Credit line": "Purchase, The Horace W. Goldsmith Foundation Gift through Joyce and Robert Menschel and Harriette and Noel Levine Gift, 1990",
            "detail:Inventory no.": "1990.1005",
            "detail:Image rights": "Not open access at the Met — no image shown",
            perspectives: "1",
            avgRating: "4.0",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "La Reine Hortense - Yacht de l'Empereur - Hâvre", sub: "europeana:/90402/RP_F_00_82", img: "https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Fwww.rijksmuseum.nl%2Fassetimage2.jsp%3Fid%3DRP-F-00-82&type=IMAGE", href: "https://www.europeana.eu/item/90402/RP_F_00_82", tip: "No English title. Both titles are tagged \"nl\", but the second is in French — the short title is shown, the Dutch descriptive one is the tagline", copy: "La Reine Hortense - Yacht de l'Empereur - Hâvre" },
            rights: { text: "PD", tip: "Public Domain Mark 1.0 · open", copy: "http://creativecommons.org/publicdomain/mark/1.0/", sort: 0 },
            genre: { text: "Albumen print", tip: "From dcType \"photograph; albumen print\"", copy: "Albumen print" },
            creator: { text: "Gustave Le Gray", sub: "1820–1884", tip: "Two agents: the studio \"Le Gray et Cie\" and \"Le Gray, Gustave\" — the one with life dates wins", copy: "Gustave Le Gray" },
            venue: { text: "Rijksmuseum", sub: "via Europeana", copy: "Rijksmuseum" },
            date: { text: "1856", copy: "1856", sort: 1856 },
            identifier: { text: "europeana:/90402/RP_F_00_82 · no QID", tip: "inventory RP-F-00-82 has no Wikidata item", copy: "europeana:/90402/RP_F_00_82" },
            category: "Marine",
            createdAt: "2026-10-29",
            url: "https://www.europeana.eu/item/90402/RP_F_00_82",
            source: "Europeana",
            originalTitle: "Het keizerlijke jacht 'La Reine Hortense' in de haven van Le Havre, Frankrijk",
            "detail:Artist bio": "1820–1884 (Europeana agent dates only)",
            "detail:Dimensions": "height 325 mm · width 413 mm",
            "detail:Inventory no.": "RP-F-00-82",
            "detail:Provided via": "Rijksmuseum (direct)",
            "detail:Image rights": "Public Domain Mark 1.0 — open, full-size image allowed",
            perspectives: "0",
            avgRating: "—",
            updatedAt: "2026-10-29"
        },
        {
            item: { text: "Marie Jordan Breitner with a Cat in her Lap", sub: "europeana:/90402/RP_F_00_588", img: "https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Fwww.rijksmuseum.nl%2Fassetimage2.jsp%3Fid%3DRP-F-00-588&type=IMAGE", href: "https://www.europeana.eu/item/90402/RP_F_00_588", tip: "Marie Jordan Breitner with a Cat in her Lap · nl Marie Breitner-Jordan met een kat op schoot · Rijksmuseum", copy: "Marie Jordan Breitner with a Cat in her Lap" },
            rights: { text: "PD", tip: "Public Domain Mark 1.0 · open", copy: "http://creativecommons.org/publicdomain/mark/1.0/", sort: 0 },
            genre: { text: "Gelatin silver print", tip: "From dcType \"photograph; gelatin silver print\" (Getty AAT 300139114); dctermsMedium is a bequest credit", copy: "Gelatin silver print" },
            creator: { text: "George Hendrik Breitner", sub: "1857–1923", tip: "agents[0] is the sitter \"Jordan, Marie\" (no dates); agents[1] \"Breitner, George Hendrik\" has life dates and wins", copy: "George Hendrik Breitner" },
            venue: { text: "Rijksmuseum", sub: "via Europeana", copy: "Rijksmuseum" },
            date: { text: "c. 1885–1905", tip: "Source sends \"c.1885 - c.1905\" · sorted as 1885", copy: "1885", sort: 1885 },
            identifier: { text: "europeana:/90402/RP_F_00_588 · no QID", tip: "inventory RP-F-00-588 has no Wikidata item", copy: "europeana:/90402/RP_F_00_588" },
            description: "The photographs in which Breitner recorded his wife exude the tranquil atmosphere of their domestic interior. Marie Jordan was first a model, then the mistress, and later the wife of the famous painter, who was also an amateur photographer.",
            category: "Portrait",
            createdAt: "2026-10-29",
            url: "https://www.europeana.eu/item/90402/RP_F_00_588",
            source: "Europeana",
            originalTitle: "Marie Breitner-Jordan met een kat op schoot",
            "detail:Artist bio": "1857–1923 (Europeana agent dates only)",
            "detail:Dimensions": "photographic paper 300 × 311 mm · image 290 × 311 mm",
            "detail:Credit line": "M.C.J. Breitner-Jordan Bequest, Zeist (from dctermsMedium)",
            "detail:Inventory no.": "RP-F-00-588",
            "detail:Provided via": "Rijksmuseum (direct)",
            "detail:Image rights": "Public Domain Mark 1.0 — open, full-size image allowed",
            perspectives: "2",
            avgRating: "4.5",
            updatedAt: "2026-10-29"
        }
    ]
};
/**
 * One fully populated row per type — every binding the type declares has a
 * value — for the preview's "Full" state. Types without one get labelled
 * placeholders for the missing cells instead.
 */
export const SAMPLE_FULL = {
    // The Milkmaid, because a Europeana row is the harder case: every binding is
    // filled, with the two the Met cannot fill (About) and Europeana cannot fill
    // (On view) given illustrative values and saying so.
    painting: {
        item: {
            text: 'The Milkmaid',
            sub: 'europeana:/90402/SK_A_2344',
            img: 'https://api.europeana.eu/thumbnail/v2/url.json?uri=https%3A%2F%2Fwww.rijksmuseum.nl%2Fassetimage2.jsp%3Fid%3DSK-A-2344&type=IMAGE',
            href: 'https://www.europeana.eu/item/90402/SK_A_2344',
            tip: 'The Milkmaid · original title Het melkmeisje · Europeana · Rijksmuseum',
            copy: 'The Milkmaid'
        },
        rights: { text: 'PD', tip: 'Public Domain Mark 1.0 · open', copy: 'http://creativecommons.org/publicdomain/mark/1.0/', sort: 0 },
        genre: 'Oil on canvas',
        creator: { text: 'Johannes Vermeer', sub: '1632–1675' },
        venue: { text: 'Rijksmuseum', sub: 'via Europeana' },
        date: '1660',
        releaseStatus: { text: '● Gallery 2.12', tip: 'Illustrative — Europeana has no gallery data; this is the Met-only field filled for the Full state' },
        audience: { text: '11,920', sort: 11920 },
        rating: '★★★★★',
        status: 'Seen in person',
        identifier: 'europeana:/90402/SK_A_2344 · Q167605',
        tags: { text: 'Women, Kitchens +2', items: ['Women', 'Kitchens', 'Milk', 'Bread'], tip: 'Illustrative — the record\'s Iconclass codes, as labels' },
        description: 'A maidservant pours milk, entirely absorbed in her work. Except for the stream of milk, everything else is still.',
        category: 'Dutch Golden Age',
        createdAt: '2026-10-29',
        updatedAt: '2026-10-29',
        id: '4831',
        url: 'https://www.europeana.eu/item/90402/SK_A_2344',
        wikidata: 'Q167605',
        source: 'Europeana',
        originalTitle: 'Het melkmeisje',
        'detail:Artist bio': '1632–1675',
        'detail:Dimensions': 'height 45.5 cm · width 41 cm',
        'detail:Credit line': 'Purchased with the support of the Vereniging Rembrandt',
        'detail:Inventory no.': 'SK-A-2344',
        'detail:Provided via': 'Rijksmuseum (direct)',
        'detail:Image rights': 'Public Domain Mark 1.0 — open, full-size image allowed',
        perspectives: '4',
        avgRating: '4.8'
    }
};
//# sourceMappingURL=catalog.js.map