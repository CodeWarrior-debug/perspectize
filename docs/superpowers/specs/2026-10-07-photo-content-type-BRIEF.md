> **BRAINSTORM BRIEF, NOT AN APPROVED SPEC. Awaiting the owner's answers to the open questions.**

# Photo content type: brainstorm brief

Research date: 2026-10-06. Written without a design approved; no code, migration or plan exists. Web facts below were fetched on that date from the URLs in the source list; anything not verified is marked **UNVERIFIED**.

## 1. Understanding write-back

**What the user said**
- They want a new content type for **photos**: a photograph is the thing people record perspectives on.
- It is explicitly not an "art" type and not a "painting" type.
- They asked whether the images could come from Google Images or Unsplash.

**My assumptions (please confirm or correct)**
- The unit of content is one photograph (a single image with a credit), not an album, a photographer or a stock-photo search.
- Users add a photo the way they add a YouTube video: find or paste something, and Perspectize stores a record and shows it in the Activity grid.
- Success means: a user can add a photo in under a minute, sees it as a thumbnail in the grid and a large image in the details view, and records a perspective (rating, text, categories) like any other type.
- Success also means no ToS violation, no broken images over time, and no hosting bill surprise.
- Photos are public content by default; private user photos are not a launch goal.

## 2. Repo context (verified in the worktree)

- `ContentType` values today: `YOUTUBE_VIDEO`, `CLAIM`, `BIBLE_PASSAGE` (`backend/internal/core/domain/content.go`). A photo type would be `PHOTO` (GraphQL/Go uppercase, DB lowercase `photo`, per `.claude/docs/ADDING_CONTENT_TYPE.md`).
- There is no `image_url` / `thumbnail` column in backend code or migrations. YouTube thumbnails are derived on the frontend from the stored API `response` JSONB. The TMDB design (`docs/superpowers/specs/2026-09-27-tmdb-content-types-design.md`) hot-links `image.tmdb.org` and needs a CSP `img-src` addition.
- **CSP is inconsistent, worth knowing:** `frontend/src/app.html` allows `img-src 'self' data: https:` (any HTTPS image), while the Go `secureheaders.go` sets `img-src 'self' https://i.ytimg.com https://yt3.ggpht.com` (API responses only). So hot-linked photos already render in the SvelteKit app today; the TMDB plan's CSP edit targets the narrower one.
- Dedupe precedent: the canonical URL is the dedupe key under the global `UNIQUE(url)` (Bible passage, TMDB). For a photo, the canonical URL would be the provider's photo page (for example `https://unsplash.com/photos/<id>`), not the image file URL.
- The Discover page already calls YouTube from the browser (`connect-src` includes `https://www.googleapis.com`), so there is a precedent for a browser-held key, but see the Unsplash terms below.

## 3. Source comparison

| Source | Text search | Key / where it lives | Rate limit | Hot-link vs store | Attribution | License / cost | Verdict |
|---|---|---|---|---|---|---|---|
| **Unsplash API** | Yes (`/search/photos`) | Access Key; guidelines say keep it confidential, which may need a server-side proxy | Demo 50/hr; Production 1000/hr after approval | **Hot-linking required** ("must use the hotlinked image URLs returned by the API"); API terms say directly use/embed the returned URLs, so rehosting is out | Required: Unsplash + photographer + profile link with `utm_source` | Unsplash license, free. Must call the **download-tracking endpoint** when a user selects a photo | **Best fit** for search-and-pick; constraints are manageable |
| **Pexels API** | Yes (`/v1/search`) | API key in `Authorization` header; server-side is the sensible place (docs do not state a rule) | 200/hr, 20,000/month default; more on request with attribution | Docs silent on hot-link/caching (**UNVERIFIED**) | "Prominent link to Pexels", photographer credit where possible | Free; Pexels license (details not on the page I fetched) | Good second choice; looser, less documented |
| **Pixabay API** | Yes | API key; docs do not say (**UNVERIFIED**) | 100 requests / 60 s | **Permanent hot-linking not allowed**: you must download to your own server; responses cached 24 h | Show users where images are from | Pixabay Content License, free | Forces rehosting, so storage + moderation burden |
| **Flickr API / Commons** | Yes (`flickr.photos.search`; license filter) | API key; non-commercial free, commercial needs approval and may carry fees | Not stated on ToS page (**UNVERIFIED**); max 30 photos per page | Do not cache/store "other than for reasonable periods"; remove when a photo goes private | Required notice "uses the Flickr API but is not endorsed by SmugMug"; link back | Per-photo licenses set by each owner; you are responsible for compliance | Rich, but per-photo license handling is a legal tax. Skip for v1 |
| **Wikimedia Commons** | Yes (MediaWiki API, `generator=search`) | No key; a meaningful `User-Agent` is mandatory or you may be blocked | Be sequential, back off on 429; no fixed number published on the page I fetched | Hot-linking "not recommended" but possible | Creator attribution + license link when the license requires it (CC BY, CC BY-SA) | Mixed CC licenses plus public domain; Foundation gives no warranty on copyright status | Good for a curated or notable-photo mode; license metadata varies per file |
| **Google Images** (Programmable Search JSON API, `searchType=image`) | Yes | API key + engine id | 100 free queries/day, then $5 per 1,000 up to 10k/day | Results link to third-party pages and images with unknown licenses (Google's results are not a license grant; ToS on storing results **UNVERIFIED**) | n/a | **Closed to new customers; existing customers must migrate by 2027-01-01** | **Not viable.** Rules itself out |
| **User pastes a URL** | n/a | none | n/a | Hot-link whatever they paste, or fetch Open Graph image | Whatever the page says | Unknown license per photo; copyright risk sits with the pasted URL's owner | Cheap, legally murky, and hot-links break |
| **User uploads a file** | n/a | S3-style object storage | n/a | You host it | None built in | User asserts rights; you take on moderation, takedowns, EXIF/GPS privacy | Largest scope; needs bucket plus moderation |

Storage options if rehosting is ever needed: Neon Object Storage is S3-compatible, bucket-per-branch, free during beta, and in a private preview limited to AWS us-east-2 for new projects (limits not found; check before relying on it). Sevalla object storage is S3-compatible on Cloudflare R2, about $0.02/GB-month, zero egress fees (their page).

**Recommendation:** **Unsplash**, behind a thin Go backend proxy, hot-linking its image URLs. Reasons: free, text-searchable, a production tier of 1000/hr, and the rules are explicit and cheap to follow: hot-link, credit, `utm_source`, one download-tracking call. Google Images is closed to new customers, so the user's second idea is out.

## 4. Approaches

**A. Search-and-pick from Unsplash (recommended).**
User types a query in an "Add photo" dialog, picks a result, and Perspectize stores the record: canonical photo-page URL, hot-linked image URLs, photographer, and so on. Backend adapter `backend/internal/adapters/unsplash/` behind a port, like `youtube` and the planned `tmdb`; Access Key through the secret workflow in `.docs/SECURITY.md`.
- Pros: closest to the YouTube flow, no hosting, no moderation of arbitrary uploads (Unsplash curates), attribution data arrives with the API.
- Cons: single-provider dependency; photos deleted on Unsplash would break (mitigate: store a `response` JSONB snapshot and fall back to a placeholder); hot-linking is mandatory so no offline copy; "don't replicate Unsplash's core experience" means a search-to-add dialog is fine but a browsable Unsplash clone is not.
- ToS risk: low if attribution and download tracking are built in from day one. Cost: free. Rough size: about the TMDB adapter, minus the hierarchy complexity.

**B. Paste-a-URL only.**
User pastes a link; Perspectize fetches Open Graph metadata and hot-links the image. 
- Pros: smallest build; works for any source.
- Cons: licenses unknown, no attribution data, hot-link rot, and some hosts block hot-linking (**UNVERIFIED** per host). Weak identity: the same photo has many URLs, so `UNIQUE(url)` dedupes poorly.
- Legal risk: moderate to high (displaying arbitrary third-party images). Only worth it as a fallback if the owner wants "any photo".

**C. Upload.**
User uploads a file to object storage.
- Pros: full control, supports private/own photos.
- Cons: moderation, copyright/takedown process, EXIF GPS stripping, size limits, thumbnailing pipeline, storage cost, and a CSP/auth story for private files. By far the biggest scope; not YAGNI-compatible without a clear need.

**Recommendation:** ship **A**, and consider adding **B** later only if the owner asks. Defer **C**.

## 5. Data model sketch (no SQL)

Follows the existing philosophy (`.planning/v1.1-research/MULTI-CONTENT-TYPE.md`, ADDING_CONTENT_TYPE Decision 3): type-specific fields live in `response` JSONB; promote to a column only when shared by 2+ types and queried/sorted.

- **New `content_type`:** `PHOTO` (DB `photo`). Dedupe: canonical `https://unsplash.com/photos/<id>` stored as `url`; the existing global `UNIQUE(url)` holds.
- **Shared column candidate, `image_url`:** the one real design question. YouTube derives its thumbnail from JSONB and TMDB plans to as well, so photo can too (no migration). A dedicated column becomes justified once a third type needs a grid thumbnail in a common query. Suggest staying in JSONB for now and revisiting during TMDB.
- **JSONB (`response`) fields:** provider and provider photo id; image URLs (thumb, small, regular, full) exactly as the API returns them; photographer name and profile URL; photo page URL; alt text / description (Unsplash supplies `alt_description`); width, height; dominant color (Unsplash `color`, useful as a placeholder background); `downloadLocation` link; license string; fetched-at timestamp.
- **Not stored:** EXIF beyond what the API returns (camera/location is optional and thin; skip for v1).
- **Sortable fields:** probably only date added and rating; no new JSONB sort paths needed. Maybe photo `createdAt` from the provider.
- **Grid rendering:** Type icon (camera); Item cell shows a small thumbnail (provider thumb URL, aspect-preserved) plus alt-text/description as title and photographer as subtitle. Columns that bind: Creator = Photographer, Source = provider, size (dimensions). Length/Views do not apply.
- **Details view:** large image (regular size), credit line "Photo by X on Unsplash" with both links, alt text, dimensions, dominant color as image placeholder, "Update source data" refetch with the existing 6 h cooldown, and the provider attribution at the bottom (as TMDB does).
- **CSP:** add `https://images.unsplash.com` to `img-src` in the Go `secureheaders.go`, and, if the SvelteKit `app.html` is ever tightened from `https:`, there too. Add `https://api.unsplash.com` to `connect-src` only if the browser calls it directly (not recommended; see risks).
- **Content Type Designer (`tools/content-type-designer`):** would plan a `PHOTO` type with bindings for Creator (Photographer), a new generic Media/thumbnail binding, Dimensions, and a details layout with a large image tile and credit line. It would need to be run to produce the column, tooltip and details tables, after the owner answers question 1 (the planner's outputs are only as good as the purpose).

## 6. Risks

- **ToS and attribution:** Unsplash can suspend a key "without notice" for non-compliance; attribution and download tracking must be tested features, not afterthoughts. Production approval (50/hr demo limit is too low for real use) takes a review step.
- **Hot-link breakage:** if a photographer deletes a photo, or Unsplash changes URLs, thumbnails 404. Mitigation: placeholder with dominant color, and a refresh action.
- **Key exposure:** Unsplash guidance says keep the key confidential. Calling from the browser (as Discover does for YouTube) leaks it; use a backend proxy endpoint (and keep it off public repos per `.docs/SECURITY.md`).
- **Bandwidth/proxy:** Hot-linking means Unsplash's CDN serves images, so no Perspectize image-proxy bandwidth. A proxy for images is not needed and would violate the hot-link rule.
- **Accessibility:** every photo needs meaningful alt text. Unsplash's `alt_description` can be null or poor; the UI should allow a user-written alt or fall back to "Photo by X".
- **Privacy:** for approach C, EXIF GPS in uploads is a real leak; not relevant for A.
- **Moderation:** A inherits Unsplash's curation (plus its `content_filter` search parameter); B and C need a moderation and takedown path.
- **Storage cost if rehosting (B/C or Pixabay):** Neon Object Storage is free in beta but preview-limited; Sevalla/R2 is about $0.02/GB-month with no egress fees. Neon Postgres free-tier storage should not hold image bytes.
- **Dedupe:** a photo can appear on several providers; v1 treats provider+id as identity.
- **Provider terms drift:** all of this was read on 2026-10-06; re-check at implementation time.

## 7. Open questions for the owner (most important first)

1. **Purpose and who adds photos?** What are photos for here (perspectives on photography as craft, on subjects/places, a mood board?), and who adds them: admin-curated, any signed-in user, or search-and-add like YouTube? *Suggested default: any signed-in user, search-and-add, as YouTube.*
2. **Is "any photo someone found" in scope, or only photos from a licensed provider?** This decides between approach A alone and A + B. *Default: licensed provider only (Unsplash).*
3. **Is Unsplash acceptable as the single v1 source,** given hot-link-only and mandatory attribution? *Default: yes; Pexels as a fallback adapter later, not now.*
4. **Do you want users' own photos (upload) ever?** If yes it needs moderation, takedown and storage decisions. *Default: no, defer.*
5. **Should photos have a minimum grid thumbnail column now, i.e. promote `image_url` to a shared column** (a migration) or keep it in JSONB until TMDB lands? *Default: JSONB.*
6. **What is the perspective about?** The image itself (composition/mood) or the subject? Does the Compare page need photo-specific fields? *Default: no special fields; the generic rating/text/categories.*
7. **Alt text:** should users be able to write or edit alt text? *Default: show provider alt, fall back to "Photo by X".*
8. **Mature or sensitive photos:** rely on Unsplash's `content_filter=high`? *Default: yes.*
9. **Naming:** `PHOTO` is the proposed value. OK? *Default: yes.*

## 8. Sources (fetched 2026-10-06)

- Unsplash API documentation: https://unsplash.com/documentation
- Unsplash API terms: https://unsplash.com/api-terms
- Unsplash API guidelines: https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines
- Pexels API documentation: https://www.pexels.com/api/documentation/
- Pixabay API documentation: https://pixabay.com/api/docs/
- Flickr API terms of use: https://www.flickr.com/services/api/tos/
- Wikimedia Commons reuse guidance: https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
- MediaWiki API etiquette: https://www.mediawiki.org/wiki/API:Etiquette
- Google Custom Search JSON API overview (closed to new customers, 2027-01-01): https://developers.google.com/custom-search/v1/overview
- Neon Object Storage docs (via search, not fully read): https://neon.com/docs/storage/overview and https://neon.com/docs/storage/buckets
- Sevalla object storage (via search, not fully read): https://www.sevalla.com/object-storage
- Repo: `.claude/docs/ADDING_CONTENT_TYPE.md`, `docs/superpowers/specs/2026-09-27-tmdb-content-types-design.md`, `tools/content-type-designer/README.md`, `backend/internal/adapters/web/middleware/secureheaders.go`, `frontend/src/app.html`

**Could not verify:** Pexels license text and hot-link/caching rules; Pixabay client-side key rule; Flickr numeric rate limit; Google's ToS on storing/showing image results (moot since the API is closed); Neon Object Storage limits and pricing after beta; the Wikimedia numeric rate limit; whether Unsplash production approval has extra conditions for apps with user-added content.
