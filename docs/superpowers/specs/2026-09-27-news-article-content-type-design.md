# News Article Content Type — Design

**Status:** Draft · **Date:** 2026-09-27 · **Follows:** `.claude/docs/ADDING_CONTENT_TYPE.md`

Adds news stories alongside YouTube videos, using free APIs for rich metadata and a stored source-bias rating so users see where a story comes from before they form a perspective on it.

## Recommendation

- **Ingest by URL.** A user pastes an article link. The backend uses a publisher API when one exists (The Guardian, NYT), otherwise falls back to reading the page's Open Graph / JSON-LD preview tags.
- **Every article is tagged** with its outlet's bias and factual-reliability rating from a curated, versioned `news_sources` table.
- **Discovery is phase 2.** A "related coverage" panel showing the same story from outlets across the spectrum (via GDELT).

No single free API delivers unbiased news. Balance comes from showing multiple sources with labels, not from picking one neutral provider.

## Decided

- **Naming:** dedicated `NEWS_ARTICLE` enum, shown as "News Article" in the UI.
- **Licensing:** Perspectize is non-commercial for now, so the Guardian and NewsAPI free tiers are usable. Revisit before any commercial launch.
- **Paywall:** boolean `isPaywalled`, shown as a lock badge on the row and detail view. Metadata only; full text is never stored.

### `isPaywalled` detection (first match wins)

1. JSON-LD `isAccessibleForFree: false` → true.
2. Provider: NYT results → true; Guardian → false.
3. `paywall` default on the `news_sources` row for known metered outlets.
4. Otherwise false.

## Still open

- Which bias dataset to cite. Proposal: AllSides for bias (native 5-point scale), Ad Fontes or Media Bias/Fact Check for reliability. Confirm reuse terms with each before going public.

## API options

Free-tier figures are from memory — verify current quotas and terms before implementation.

| Source | Free tier | Metadata | Role |
|---|---|---|---|
| The Guardian Open Platform | Dev key, ~5k calls/day, non-commercial | Headline, byline, section, tags, trail text, thumbnail, word count | Primary adapter |
| NYT Article Search API | 500/day, 5/min | Headline, byline, keywords, section, multimedia, abstract | Secondary adapter |
| Open Graph / JSON-LD | No key | Title, description, image, author, publishedAt, site name | Universal fallback |
| GDELT DOC 2.0 | No key | URL, title, domain, tone, themes | Phase 2: related coverage |
| NewsAPI.org | Dev only, 100/day | Title, source, author, description, image | Prototype only |
| AP / Reuters | Paid | Very rich | Not now |

Guardian and NYT require attribution and prohibit long-term storage of full body text: store metadata and link out.

## Handling political bias

Bias is data about the **source**, not the article. `news_sources` is keyed by domain.

- Bias: integer −2…+2 (LEFT, LEAN_LEFT, CENTER, LEAN_RIGHT, RIGHT) or UNRATED.
- Reliability: HIGH / MIXED / LOW / UNRATED.
- `ratingSource` and `ratedAt` recorded so ratings are auditable.
- Unknown domains are saved as UNRATED, never guessed.
- Bias chip colors use neutral design tokens, not red/blue party colors.

## Decisions against the content-type guide

| Decision | Choice |
|---|---|
| 1. Ingestion | URL + publisher API, preview-tag fallback |
| 2. Metadata | `response` JSONB; sortable: `publishedAt`, `sourceName`, `biasScore` (paths in `helpers.go`) |
| 3. New columns | None on `content`; new `news_sources` table |
| 4. URL rules | Any http(s); canonicalize (strip `utm_*`, AMP, fragments) to keep `UNIQUE(url)` meaningful |
| 5. Form | Unified add popover with type selector |
| 6. Table | Newspaper icon, OG image thumbnail, Source + Bias columns |

## Data model

### Domain (Go)

```go
const ContentTypeNewsArticle ContentType = "NEWS_ARTICLE"

type ArticleMetadata struct {
    Headline    string
    Summary     string
    Authors     []string
    PublishedAt *time.Time
    SourceName  string
    Domain      string
    Section     string
    Tags        []string
    ImageURL    string
    WordCount   *int
    Language    string
    Provider    string // "guardian" | "nyt" | "opengraph"
    IsPaywalled bool
}
```

### GraphQL

```graphql
enum ContentType { YOUTUBE NEWS_ARTICLE }
enum BiasRating { LEFT LEAN_LEFT CENTER LEAN_RIGHT RIGHT UNRATED }
enum Reliability { HIGH MIXED LOW UNRATED }

type NewsSource {
  domain: String!
  name: String!
  bias: BiasRating!
  reliability: Reliability!
  ratingSource: String
  ratedAt: DateTime
}

type Content {
  # existing fields…
  headline: String
  authors: [String!]
  publishedAt: DateTime
  newsSource: NewsSource
  section: String
  tags: [String!]
  isPaywalled: Boolean
}

input CreateContentFromArticleInput { url: String! }

extend type Mutation {
  createContentFromArticle(input: CreateContentFromArticleInput!): Content!
}
```

### Migration (write only — apply manually per environment)

```sql
CREATE TABLE IF NOT EXISTS news_sources (
  domain        TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  bias_score    SMALLINT CHECK (bias_score BETWEEN -2 AND 2),
  reliability   TEXT NOT NULL DEFAULT 'unrated',
  paywall       BOOLEAN NOT NULL DEFAULT false,
  rating_source TEXT,
  rated_at      TIMESTAMPTZ
);
```

## Backend architecture

- **Port:** `ports/services.ArticleClient { GetMetadata(ctx, url) (*ArticleMetadata, error) }`
- **Adapters:** `adapters/news/guardian`, `adapters/news/nyt`, `adapters/news/opengraph`, composed by a router that picks by domain and falls back to Open Graph on error.
- **Service:** `ContentService.CreateFromArticle`: canonicalize URL → uniqueness check → fetch metadata → look up `news_sources` → save.
- **Repository:** `NewsSourceRepository.GetByDomain`; resolver batches via DataLoader.
- **Config:** `GUARDIAN_API_KEY`, `NYT_API_KEY`; adapter disabled if key missing.
- **Safety:** fetcher uses timeout, 2 MB body cap, redirect limit, and blocks private IP ranges (SSRF).

## Link preview rules

The fallback adapter fetches one page when a user pastes its link and reads the preview tags in its header, like a chat app's link preview. It never follows links or crawls.

- Store preview fields only (title, summary, image link, author, date) — never full article text.
- Always link to the original and show the outlet's name.
- Hotlink images by the outlet's URL; don't copy files.
- Honest user agent: `PerspectizeBot/1.0 (+contact link)`.
- One fetch per link on user request, cached, never re-fetched on a schedule.
- Blocked or paywalled page: save whatever tags came back and let the user type the title. Never bypass a block.
- Remove an outlet's data on request; publish a contact address.

General practice, not legal advice. Have a lawyer review before any commercial launch.

## Seeding `news_sources`

Ratings are copied by hand from the public AllSides and Ad Fontes / Media Bias/Fact Check pages into a seed file in the repo, loaded with an idempotent `INSERT … ON CONFLICT (domain) DO UPDATE`, applied manually per environment, and refreshed quarterly. Rating sites are never scraped. Unknown domains are saved as UNRATED so each refresh covers outlets people actually use.

### Starter outlets (~28)

Groups show the expected region of the scale from memory; the seed file stores each outlet's actual published rating.

| Group | Outlets |
|---|---|
| Wire and public | AP News, Reuters, BBC News, NPR, PBS NewsHour |
| Left and lean left | The Guardian, New York Times, Washington Post, CNN, MSNBC, The Atlantic, Vox |
| Center | The Hill, Axios, Bloomberg, Wall Street Journal (news), USA Today, Forbes |
| Lean right and right | Fox News, New York Post, Washington Examiner, National Review, The Dispatch, Reason, Daily Wire |
| International | Al Jazeera English, Financial Times, The Economist |

Paywall defaults: WSJ, FT, Bloomberg, The Economist, Washington Post, NYT, The Atlantic.

## Frontend

- Type selector (YouTube / News Article) in the add popover; URL validator in `lib/utils/article.ts`.
- `useAddArticle` hook; `CREATE_CONTENT_FROM_ARTICLE` in `queries/content.ts`.
- `typeCellRenderer` newspaper icon; `itemCellRenderer` uses OG image with a fallback.
- New Source and Bias columns, lock badge for paywalled rows.

## Rollout

1. Domain enum, schema, Open Graph adapter, service, resolver, tests. Works with no API keys.
2. `news_sources` migration and starter seed; bias/reliability/paywall chips in UI.
3. Guardian + NYT adapters for richer metadata.
4. Phase 2: GDELT-backed "related coverage across the spectrum" panel.
