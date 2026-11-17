# Research: Datamuse `sug` for as-you-type word suggestions

Ticket: [01-datamuse-suggestions](../tickets/01-datamuse-suggestions.md) · Map: [defined-term](../map.md) · Researched 2026-11-14 (cloud session, keyless probes) · Type: `wayfinder:research`

## Recommendation

Do not call Datamuse from the browser; call it from our Go backend, and keep `https://api.datamuse.com` out of `connect-src` in `frontend/src/app.html` (the existing `https://api.perspectize.com` entry already covers a backend route). Datamuse's own docs say that from **1 February 2027** (79 days from today) "an API key will be required in all requests", capped at 100,000 requests per day per key, and a key in browser JavaScript is public, so the key has to live on the server. Separately, `api.datamuse.com` sits behind a CDN that caches the first caller's `access-control-allow-origin` value and does not send `Vary: Origin`, so a browser call can intermittently be blocked by CORS (verified below). A backend route also keeps end users' IP addresses and half-typed text away from a third party that logs queries for the day, and lets us cache by normalised prefix so the daily cap is never near. The terms do not address commercial use, caching or attribution beyond "kindly acknowledge the API in your app's documentation", and ask customer-facing apps to describe themselves and give a traffic estimate; the owner should send that message (it is the only route to a key) before the cutoff. As for suggestion quality, `sug` is good for prefixes, phrases and some typos (`worsh` gives worship*, `seperate` puts `separate` third), but it fails on others (`recieve` never surfaces `receive`), returns an empty list for arbitrary phrases such as "worshipping god", and its list includes corpus misspellings and rare forms. The best keyless alternative is Wiktionary's opensearch (`access-control-allow-origin: *`, every suggestion has a real entry, handles multi-word headwords, no spell correction); keep it as a fallback behind the same backend route in case Datamuse declines or delays a key.

## What was checked and how

All facts below come from Datamuse's own documentation page (downloaded raw and read, not summarised), live `curl` probes of the endpoints, or Wikimedia's own policy pages. Anything not found in those is marked **UNVERIFIED**.

## 1. Terms of use, limits, attribution, caching

Source: [Datamuse API documentation](https://www.datamuse.com/api/) (HTML page, `Last-Modified: Tue, 03 Nov 2026`), sections "Usage limits" and "Privacy", plus the banner at the top of the page. [OneLook about page](https://www.onelook.com/?c=about&sel=api) for the privacy policy and the request-for-information form.

| Topic | What the source says | Status |
|---|---|---|
| Key today | "Until Feburary 1, 2027, you can use this service without restriction and without an API key for up to 100,000 requests per day." | Verified |
| Key from 1 Feb 2027 | Banner: "starting February 1, 2027, an API key will be required in all requests, and access will be limited to 100,000 requests per day per API key. If you are a current user of the API and you do not already have an API key, please reach out to our feedback form with a description of your application." | Verified (see date note below) |
| Daily limit | 100,000 requests per day; "beyond that limit, requests may be rate-limited without notice." | Verified |
| Per-IP limit | The page states none. | Verified absent from the docs; actual enforcement per IP is UNVERIFIED |
| Customer-facing use | "If you'd like to use this in a customer-facing application, or if you need a custom vocabulary, or if you plan to make more than 100,000 requests per day, please describe your application (and a traffic estimate) in a message to us." | Verified |
| Commercial use | Not addressed. No licence text, no prohibition and no permission. The only related sentence is the customer-facing request above. | Verified absent; whether a commercial agreement or fee applies is **UNVERIFIED** |
| Attribution | "If you use the API within a publicly available app, kindly acknowledge the Datamuse API within your app's documentation." A request, and aimed at documentation, not the UI. | Verified |
| Caching | The terms are silent. The API's own response header is `cache-control: no-transform, max-age=86400` (24 hours), so a 24-hour cache matches what the server itself allows. Anything longer (stored vocabulary) is **UNVERIFIED**. | Header verified; terms silent |
| Stability | "While we are committed keeping the API freely available for the foreseeable future, we cannot commit to any improvements and may not be able to respond to all support requests." New major versions will use a different URL, so v1 keeps working. | Verified |
| Privacy | "The Datamuse API servers keep a temporary log file of the queries made to the service. This log file is discarded at the end of the day after the request was made. We save no long-term usage data other than a count of the number of requests broken out by the broad category of the request." | Verified |
| How a key is sent | Not documented. The docs page's own demo calls `https://api.onelook.com/sug?k=demo&v=enwiki&s=...`, and OneLook's pages use `k=ol_home` and `k=ol_clue`, which suggests a `k` query parameter. `api.datamuse.com` silently accepted an unknown `k=demo` today. | **UNVERIFIED** (inference only) |

Date note: a web-search summary claimed the cutoff is 1 January 2027. The page itself says February 1, 2027 in two places (the banner and the "Usage limits" section) and was last modified 2026-11-03, so February 1 is used here. Re-read the page when you send the key request.

## 2. CORS (probed 2026-11-14 with `curl -sS -D -`)

`api.datamuse.com/sug` does send CORS headers, and answers a preflight:

- Request with `Origin: https://example.com` returns `access-control-allow-origin: https://example.com` and `access-control-allow-credentials: true`.
- `OPTIONS` preflight returns 200 with `access-control-allow-methods: OPTIONS,GET,PUT,POST,DELETE,HEAD`, `access-control-allow-headers: Cache-Control,If-Modified-Since,Pragma,Content-Type,Authorization,X-Requested-With,Content-Length,Accept,Origin,*` and `access-control-max-age: 1800`.
- The `/words` endpoint behaves the same way.

The catch, verified three ways: the response comes through CloudFront with `cache-control: no-transform, max-age=86400` and `vary: Accept-Encoding` only (no `Vary: Origin`), so the cache key ignores the `Origin` header and the first caller's CORS headers are served to everyone for up to 24 hours at that edge location.

1. Primed `s=zzcorstest1` with `Origin: https://first-origin.test`; a second request with `Origin: https://second-origin.test` was a cache hit and returned `access-control-allow-origin: https://first-origin.test`. A browser on the second origin would block that response.
2. `s=worsh`, first requested with `Origin: https://example.com`, was then served from cache to a request with `Origin: https://perspectize.example`, still carrying `https://example.com`.
3. Primed `s=zzcorstest2` with no `Origin` at all (what a server-side caller or curl sends): the cached copy has no `access-control-allow-origin` header, and a later request with an `Origin` got the same headerless cached copy. A browser would block it.

Impact: any prefix first fetched at a given edge by another site's browser, a script, or a server-side caller is a CORS failure for our users until the 24-hour entry expires. This was seen at one edge location (`IAD89`); how often it bites in production is **UNVERIFIED**, but it needs no malice, only ordinary traffic from other sites that use the API. Calls from our backend are not subject to CORS, so this does not affect the recommended design. (The probes above primed a few cache entries at that edge, `s=worsh` and `s=zzcorstest1..3`, which expire within 24 hours.)

For comparison, the OneLook host `api.onelook.com/sug` (used by Datamuse's own demo) sends `vary: Origin` and `cache-control: max-age=604800`; it has no documented terms for third parties (see section 5).

## 3. How `sug` treats misspellings, plurals, multi-word phrases

Docs ([/sug endpoint](https://www.datamuse.com/api/#sug)): suggestions "perform live spelling correction and intelligently fall back to choices that are phonetically or semantically similar when an exact prefix match can't be found"; results are "sorted by a measure of popularity"; "the prefix hint will not necessarily form a prefix of each result"; `max` defaults to 10 and caps at 1000; popular multiword expressions "are included in the default vocabulary, and these will appear as space-delimited strings." The docs say nothing more specific about multi-word queries or inflections.

Probe results (default English vocabulary, 2026-11-14):

| Query `s=` | Result (top hits, in order) | Reading |
|---|---|---|
| `worsh` | worshipper, worship, worshipful, worshipping, worshipers, worshiper, worshipable, worshipped, worshiped, worshippers | Good (the owner's earlier probe). Note `worshipper` outranks `worship`, popularity order, not prefix length. |
| `wrshp` | washpot, wshp, rshp, washpost, wrsp | Poor: vowel-less typo not corrected to worship. |
| `recieve` | recieve, recieved, reciever, relieve, relieved, reliever, relieve oneself, decieve, relievedly, relievement | Poor: the misspelling is itself in the vocabulary and ranks first; `receive` is absent even at `max=30`. |
| `seperate` | seperate, seperately, separate, separated, separately, superate, separateness, separate out | Mixed: corrected form is third, behind two misspellings. |
| `worships` | worships, worshipper, worship, worshipful, worshipping, worshipers, worshiper, worshipable, worshipped, worshiped | Plural: the typed form first, then the family, so the base form `worship` is present. |
| `children` | children, children's home, childrenless, children of israel, childrens, childrenite, children's, children's crusade, children's day, childrens day | Irregular plural is treated as a prefix; includes phrases, possessives and variant spellings. |
| `born` | born, borne, born to the purple, born-again, born tired, bornu, born in the purple, borno, borning, borna, ... | Phrases mixed in with words. |
| `born ag` | born again, born again christian, born agains, born-again, born and bred, born-again christian, born-again virgin, born-agains, born approximation, horn aging | Multi-word prefix works; the hyphenated variant `born-again` appears as a separate entry. |
| `born again` | born again, born again christian, born agains, born-again, born-again christian, born-again virgin, born-agains, turn against, on again off again, bourne again shell | Full phrase works; tail is noise (`turn against`). |
| `Born Again` | Same as lower-case `born again` | Case-insensitive. |
| `worshipping god` | `[]` | An arbitrary two-word phrase outside the phrase vocabulary returns nothing, no fallback. |
| `kenosis` | kenosis, henosis, ketosis, enosis, ketosis-prone diabetes, ... | Rare theological word is known; fuzzy neighbours follow. |

What this means for a "defined term" picker:

- Suggestions are corpus-derived, not dictionary-derived. They include misspellings (`recieve`, `seperate`, `agains`), rare inflections (`worshipable`), possessives and hyphenated variants. A suggestion is not a promise that Wiktionary has a page for it; the Discover design already has an "Add *x* as your own term" path for words with no entry, so this is tolerable, but the lookup step must handle misses.
- Spelling correction is partial: good when the typed string is a prefix of real words, weak on transpositions and vowel loss.
- Plural and inflected forms are not normalised: the typed form is echoed first and related forms follow. The term identity rule (lowercased term plus language) means `worship` and `worships` are different terms unless we lemmatise ourselves.
- Multi-word phrases work only inside Datamuse's phrase vocabulary (550,000 English words and expressions per the docs). Arbitrary phrases return `[]`.

## 4. Browser versus backend: what decides it

1. **Key.** From 2027-02-01 every request needs one; client-side code exposes it (UNVERIFIED how a key is bound to an origin, if at all; the docs describe none). The 100,000 per day cap is per key, so all users share it. Calling from the browser gives us no way to cache or dedupe across users; a backend route with a normalised-prefix cache (24 hours, matching the server's own `max-age`) bounds Datamuse traffic by the number of distinct prefixes.
2. **CORS cache hazard** above.
3. **Privacy.** Datamuse logs queries until the end of the day. From the browser, that log holds our users' IP addresses next to the text they were typing; from the backend it holds only our server's address.
4. **CSP.** Direct calls need `https://api.datamuse.com` added to `connect-src` (current value ends `... https://i.ytimg.com https://www.youtube-nocookie.com;`); a backend route needs no change because `https://api.perspectize.com` is already listed.
5. **Customer-facing.** Datamuse asks customer-facing apps to describe themselves first. That is a human message, not something an agent should send.

Cost of the backend route: one more hop on every keystroke-debounced request. The debounce, minimum prefix length (2 or 3 characters) and cancel-previous-request behaviour are design choices for ticket 09, not research findings.

## 5. Keyless alternatives

| Option | Keyless | Browser CORS | Misspellings | Plurals / multi-word | Limits and terms | Verdict |
|---|---|---|---|---|---|---|
| Datamuse `sug` (reference) | Until 2027-02-01 only | Yes, with the CDN caching hazard | Partial (see section 3) | Phrases from its vocabulary; no lemmatisation | 100,000/day per key from 2027-02-01; terms silent on commercial use | Best suggestion quality; needs a key and a human request |
| Wiktionary opensearch: `en.wiktionary.org/w/api.php?action=opensearch&search=<s>&namespace=0&origin=*` | Yes | `access-control-allow-origin: *`, `cache-control: max-age=10800, s-maxage=10800, public` | None (prefix match on titles; `recieve` returned recieve, recidive, recite, recover, recipe, recipient, receive, ...; `wrshp` returned washpot, washproof, ... ) | Multi-word headwords work: `born ag` returned born-again, born-again virgin, born-again virginity, born again, ... ; plural `children` returned children, children should be seen and not heard, childrens, ... | Wikimedia rules below | Best fallback: same upstream as the definitions we will store, so every suggestion has a page; no spelling help |
| `api.onelook.com/sug` (host used by Datamuse's own demo and OneLook) | Worked without a key today | Yes, with `vary: Origin` | Same engine as Datamuse | Returned definitions in `defs`; with `v=enwiki` it returns Wikipedia titles, not words | No terms published for outside callers | Do not depend on it: undocumented for third parties (**UNVERIFIED** whether it is supported) |
| Datamuse `/words?sp=wor*` | Same terms as `sug` | Same | None | Wildcards | Same | Nothing gained over `sug` |
| Self-hosted headword list (index of Wiktionary titles in our own database) | Yes, nothing external at runtime | n/a | Only if we add fuzzy matching (**UNVERIFIED** for our data; not tested here) | Whatever we load | Wiktionary dump licence is ticket 02 | Overlaps ticket 03's "bulk dump" idea; larger build than a proxy |
| Merriam-Webster, Wordnik | No | n/a | n/a | n/a | Already rejected in the map | Skip |
| Free Dictionary API (`api.dictionaryapi.dev`) | Yes | Open | n/a | Exact-word lookup only, no suggestion endpoint (per the map's own earlier probe, not re-probed here) | `x-ratelimit-limit: 450` per the map | Fine for the definition lookup, not for suggestions |

Wikimedia rules for the Wiktionary fallback, from [Wikimedia APIs / Rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits) (page last edited 2026-11-08) and the [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy):

- Unidentified requests ("no identifying characteristics other than IP address"): **10 requests per minute**. Browser-based unauthenticated requests and unauthenticated bots with a compliant User-Agent: **200 per minute**. Over the limit gives HTTP 429, usually with `Retry-After`.
- Keep concurrent requests to 3 or fewer. The page says these rules are new in 2026 and subject to change.
- Clients must send a descriptive User-Agent with contact information; browser scripts cannot set it and are encouraged to send `Api-User-Agent`. A missing, empty or generic one "may be blocked without notice" and can return 403.
- This explains the 429s recorded in the map: my first curl probes (default `curl` User-Agent, from a shared cloud egress IP) were limited, and a later request with a descriptive User-Agent returned 200. Four parallel requests were limited again, and a lone `worships` retry was limited too, so the shared egress IP is probably also a factor (**UNVERIFIED**); the numbers above are the only authoritative figures. A backend route would send a compliant User-Agent and cache for 3 hours (matching `max-age=10800`).
- Results come from all of English Wiktionary, which holds entries for many languages (`recipiente` appeared for `recieve`, which I read as non-English; not source-verified). The map scopes terms to English only, so a Wiktionary-based suggestion list would need filtering or accepting mixed-language hints.
- Not probed on Wiktionary: the plural `worships` (rate-limited twice); only `children` was seen for plurals.

## 6. Open questions for the owner (human actions; not done)

1. Send Datamuse the "describe your application and a traffic estimate" message (feedback form on the [OneLook about page](https://www.onelook.com/?c=about&sel=api)) before 2027-02-01, and in it ask: is a key issued free for a customer-facing app, is commercial use allowed, is a 24-hour server cache allowed, how is the key sent (header or `k=`), and is the cap shared across origins.
2. Decide whether a Datamuse refusal or delay should trigger the Wiktionary opensearch fallback, and whether mixed-language hints from it are acceptable.
3. For ticket 09's throwaway Discover prototype only: calling Datamuse straight from the page is workable until the key requirement starts, but expect the occasional CORS failure from the cache hazard.

## Sources

- Datamuse API documentation (usage limits, privacy, `/sug`, vocabularies, data sources, key banner): https://www.datamuse.com/api/
- Datamuse `/sug` anchor: https://www.datamuse.com/api/#sug
- Datamuse users page (autocomplete examples: RhymeZone, OneLook, SmashWords; no terms stated): https://www.datamuse.com/api/users.html
- OneLook about page (privacy policy, API information request form): https://www.onelook.com/?c=about&sel=api
- Wikimedia API rate limits: https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits
- Wikimedia User-Agent policy: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
- Live probes (2026-11-14 about 19:27 to 19:30 UTC): `https://api.datamuse.com/sug?s=...`, `https://api.datamuse.com/words?sp=...`, `https://api.onelook.com/sug?...`, `https://en.wiktionary.org/w/api.php?action=opensearch&...`
- Repo context: `frontend/src/app.html` (`connect-src`), `docs/superpowers/wayfinder/defined-term/map.md`
