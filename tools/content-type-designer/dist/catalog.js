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
        thumbnail: 'i.ytimg.com/vi/<id>/mqdefault.jpg'
    },
    {
        id: 'movie',
        label: 'Movie',
        plural: 'Movies',
        enumValue: 'MOVIE',
        gist: 'A theatrical or streaming feature film, independent of where it is watched.',
        ingestion: 'api',
        enrichment: 'TMDB (/search/movie then /movie/{id})',
        urlRequired: false,
        urlPattern: 'optional: themoviedb.org/movie/<id> | imdb.com/title/<tt>',
        identity: 'tmdbId (fallback: title + release year)',
        icon: 'film',
        accent: '#0F9D8C',
        sharesUrlSpace: true,
        thumbnail: 'TMDB poster_path (w185)'
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
        thumbnail: 'none — book-with-cross icon tile (h-8 w-10, bg-muted text-primary); click opens url'
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
        enrichment: 'The Met Collection API — GET collectionapi.metmuseum.org/public/collection/v1/objects/{objectID}; keyless, CC0 open-access images; ~14k hits for search?medium=Paintings&hasImages=true. Accept only objectName = "Painting" (classification is blank for some departments, e.g. The American Wing). Phase 2: Wikidata (P31 = Q3305213) for paintings outside the Met',
        urlRequired: true,
        urlPattern: 'metmuseum.org/art/collection/search/<objectID> (phase 2: wikidata.org/wiki/<Q-id>)',
        identity: 'met:<objectID>; also store the Wikidata QID from objectWikidata_URL as the cross-source dedup key',
        icon: 'palette',
        accent: '#8E3B46',
        sharesUrlSpace: false,
        thumbnail: 'primaryImageSmall (images.metmuseum.org web-large JPEG, CC0). When blank (isPublicDomain = false, e.g. Monet 437127) fall back to Wikidata P18 → commons.wikimedia.org/wiki/Special:FilePath/<file>?width=400 with its Commons attribution, else a palette icon tile. Click opens url (objectURL)',
        detect: {
            hosts: ['metmuseum.org', 'www.metmuseum.org'],
            path: '^/art/collection/search/(\\d+)/?$',
            examples: [
                'https://www.metmuseum.org/art/collection/search/436535',
                'https://www.metmuseum.org/art/collection/search/437127?ft=monet',
                'https://www.metmuseum.org/art/collection/search?q=vermeer'
            ]
        },
        detailOnly: [
            { label: 'Artist bio', path: "response->>'artistDisplayBio'" },
            { label: 'Dimensions', path: "response->>'dimensions'" },
            { label: 'Credit line', path: "response->>'creditLine'" },
            { label: 'Image rights', path: "response->>'isPublicDomain' (+ Commons attribution when the image is the fallback)" }
        ]
    }
];
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
            movie: b('Film', 'required', 'api', 'name + poster_path', true, { tooltip: 'Title and poster from TMDB' }),
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
            bible: b('Passage', 'required', 'derived', 'display_title ?? name (CanonicalPassageName)', true, {
                tooltip: 'Your title for the passage if one was set, otherwise the reference (e.g. "Micah 6:8"). Sorts in canonical Bible order, not A–Z.',
                appearance: 'Icon tile instead of a thumbnail. Serif 13px title, line-clamp-2. When display_title is set, the reference appears as an 11px muted subtitle (line-clamp-1 on the title). Sort comparator: verse_start_id, so Genesis precedes 1 Corinthians.'
            }),
            painting: b('Painting', 'required', 'api', 'name + image_url (primaryImageSmall, Commons fallback)', true, {
                tooltip: 'Title and image from The Met collection. Click opens the painting on metmuseum.org.',
                appearance: 'Thumbnail in the existing slot with object-fit: contain on a neutral mat, not cover — cropping a painting misrepresents it (portraits are tall, Washington Crossing the Delaware is 1.7:1). Palette icon tile when no image. Commons-sourced images carry a small "ⓘ" with the attribution in the tooltip.'
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
        bindings: Object.fromEntries(TYPES.map((t) => [t.id, b('Type', 'required', 'derived', 'content_type', true)]))
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
        bindings: Object.fromEntries(TYPES.map((t) => [t.id, b('Category', 'optional', 'user', 'primary_category_id', true)]))
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
            movie: b('Genre', 'optional', 'api', "response->'genres'->0->>'name'", false),
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
            movie: b('Director', 'typical', 'api', "response->'credits'->>'director'", true),
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
            movie: b('Runtime', 'required', 'api', 'length + length_units', true, { unit: 'minutes', tooltip: 'Theatrical runtime from TMDB' }),
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
            movie: b('Released', 'required', 'api', "response->>'releaseDate'", true),
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
                appearance: 'Display response->>\'objectDate\' verbatim; never reformat to a full date. The value path is the sort key: integer objectBeginDate (negative for BCE) — note the Vermeer sample: shown "ca. 1662", sorted as 1657. Mixed with YouTube publishedAt this column spans centuries vs days — sort by Type first.'
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
            movie: b('Votes', 'optional', 'api', "response->>'voteCount'", false, { tooltip: 'Number of TMDB ratings' })
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
            movie: b('Score', 'typical', 'api', "response->>'voteAverage' × 10", true, { tooltip: 'TMDB average score, scaled to a percentage' }),
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
            movie: b('Watched', 'typical', 'user', "response->>'progressStatus'", true),
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
            movie: b('TMDB ID', 'required', 'api', "response->>'tmdbId'", false),
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
        bindings: Object.fromEntries(TYPES.map((t) => [
            t.id,
            t.id === 'bible'
                ? b('Tags', 'optional', 'derived', '[testament, division] → tags', false, {
                    tooltip: 'PLANNED (Q10, answer box unchecked) — e.g. "Old Testament, Major Prophets". Redundant with Genre while that column exists.'
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
            movie: b('Synopsis', 'typical', 'api', "response->>'overview'", false),
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
export const SAMPLE_FULL = {
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
//# sourceMappingURL=catalog.js.map