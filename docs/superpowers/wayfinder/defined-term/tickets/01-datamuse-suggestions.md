# Datamuse for suggestions: terms, CORS, limits

Type: `wayfinder:research` (AFK) · Status: closed · Blocked by: none · Claimed by: Claude

## Question

Can Discover use Datamuse's `sug` endpoint for as-you-type word suggestions, called from the browser? Find Datamuse's terms of use (commercial use, attribution, caching, any limit per IP or per day), whether the endpoint sends CORS headers, how it treats misspellings, plural forms and multi-word phrases such as "born again", and whether a keyless alternative fits better. A keyless probe on 2026-11-14 returned good suggestions for "worsh". The answer decides whether the Discover tab calls it from the browser (its host then goes in `connect-src` in `frontend/src/app.html`) or through our backend.

## Resolution (2026-11-14, research subagent; full findings in [the research file](../research/01-datamuse-suggestions.md))

- Call Datamuse `sug` from our Go backend, not the browser, with a cache by normalized prefix (24 hours, which is what the server's own `max-age` allows). No `connect-src` change is needed.
- Datamuse's docs say an API key is required from 1 February 2027, capped at 100,000 requests per day per key. The only route to a key is describing the app and a traffic estimate to Datamuse; the owner has to send that. How a key is passed is unverified.
- The terms don't address commercial use or caching beyond that header. Attribution is a request to acknowledge the API in the app's documentation.
- From a browser, Datamuse's CDN caches the first caller's CORS header without `Vary: Origin`, so a call can fail intermittently. Seen at one edge location.
- Quality: good on prefixes and phrases like "born ag", weak on some typos ("recieve" never finds "receive"), and empty for arbitrary phrases such as "worshipping god". Plurals aren't normalized and rare forms appear.
- Fallback: Wiktionary prefix search, which returns real entries only. A follow-up grilling ticket decides the source: [Suggestion source and the Datamuse key](12-suggestion-source-and-datamuse-key.md).
- This replaces the working idea of calling Datamuse from the browser.
