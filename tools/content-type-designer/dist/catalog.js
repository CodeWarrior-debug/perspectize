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
            paper: b('Paper', 'required', 'api', 'name (title)', true, { tooltip: 'Paper title from Crossref' })
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
            paper: b('First author', 'required', 'api', "response->'authors'->0->>'name'", true)
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
            purchase: b('Channel', 'optional', 'user', "response->>'salesChannel'", false)
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
            place: b('Visit length', 'optional', 'user', 'length + length_units', false, { unit: 'minutes' })
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
            paper: b('Published', 'required', 'api', "response->>'issued'", true)
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
        bindings: Object.fromEntries(TYPES.filter((t) => t.id !== 'claim' && t.id !== 'perspective').map((t) => [
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
            claim: b('Verdict', 'typical', 'user', "response->>'verdict'", true, { tooltip: 'PLANNED — not written by CreateClaim today. Unverified / supported / contested / refuted' })
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
            place: b('Place ID', 'required', 'api', "response->>'placeId'", false)
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
            b('Tags', 'optional', t.ingestion === 'api' ? 'api' : 'user', "response->'tags'", false)
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
            paper: b('Abstract', 'typical', 'api', "response->>'abstract'", false)
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
//# sourceMappingURL=catalog.js.map