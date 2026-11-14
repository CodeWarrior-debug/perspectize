# Dictionary source: reliability and alternatives

Type: `wayfinder:research` (AFK) · Status: open · Blocked by: none · Claimed by: Claude

## Question

Is `api.dictionaryapi.dev` dependable enough to be the source, and is there a better way to get the same Wiktionary data? Find who runs it, whether it is self-hostable or open source, what its rate limit window is (the response header says 450 per window), its uptime history, and how it covers phrases and inflected forms. Compare it with a bulk Wiktionary extract such as Wiktextract/Kaikki data, which we could load into our own database, and with calling Wiktionary directly with a proper User-Agent. A probe on 2026-11-14 got a 429 from Wiktionary's own API on a cloud IP; find out whether that was the shared IP or a general limit.
