# Datamuse for suggestions: terms, CORS, limits

Type: `wayfinder:research` (AFK) · Status: open · Blocked by: none · Claimed by: Claude

## Question

Can Discover use Datamuse's `sug` endpoint for as-you-type word suggestions, called from the browser? Find Datamuse's terms of use (commercial use, attribution, caching, any limit per IP or per day), whether the endpoint sends CORS headers, how it treats misspellings, plural forms and multi-word phrases such as "born again", and whether a keyless alternative fits better. A keyless probe on 2026-11-14 returned good suggestions for "worsh". The answer decides whether the Discover tab calls it from the browser (its host then goes in `connect-src` in `frontend/src/app.html`) or through our backend.
