# Dictionary source: reliability and alternatives

Type: `wayfinder:research` (AFK) · Status: closed · Blocked by: none · Claimed by: Claude

## Question

Is `api.dictionaryapi.dev` dependable enough to be the source, and is there a better way to get the same Wiktionary data? Find who runs it, whether it is self-hostable or open source, what its rate limit window is (the response header says 450 per window), its uptime history, and how it covers phrases and inflected forms. Compare it with a bulk Wiktionary extract such as Wiktextract/Kaikki data, which we could load into our own database, and with calling Wiktionary directly with a proper User-Agent. A probe on 2026-11-14 got a 429 from Wiktionary's own API on a cloud IP; find out whether that was the shared IP or a general limit.

## Resolution (2026-11-14, research subagent; full findings in [the research file](../research/03-dictionary-source-reliability.md))

- Do not depend on `api.dictionaryapi.dev`. A single developer runs it on donations; the maintainer has not answered the outage reports from August to October 2026 (HTTP 522 failures for days). The code that serves Wiktionary data is not public, so it can't be self-hosted. Its rate limit (450 requests per 5 minutes per IP, from the public code, unconfirmed for the deployed version) is irrelevant at our volume. Reliability is the problem.
- It also returned 404 on 12 terms Wiktionary has or that are ordinary words, including "born again", "Holy Spirit", "sola scriptura", "hypostatic union", "every", "look" and "is". Phrases and theological terms are exactly what this type needs.
- **Source: Wiktionary's own `page/definition` REST endpoint**, called from the Go backend once per word with a compliant User-Agent, stored in Postgres with an "as of" date. It returned correct results for the four terms tried. Wikimedia's published limit is 200 requests per minute for an identified client and 10 per minute unidentified.
- Because we then use Wiktionary directly, the credit is CC BY-SA 4.0 (the API's "3.0" label no longer applies), matching the licence research.
- **Fallback:** a bulk Wiktextract/Kaikki extract (raw JSONL, 2.9 GB gzipped, filtered to English) loaded into our own tables. Build it only if needed. It would also give us our own word list for suggestions.
- The 429 seen from the cloud session is very likely the shared egress pool, not a general limit, but that is unproven. Two things remain: the owner supplies a real contact for our User-Agent, and someone probes Wikimedia from the real deploy host. `rest_v1` is on Wikimedia's deprecation path with no date set and no mention of this endpoint (ticket [Contact for the User-Agent and a deploy-host probe](13-user-agent-contact-and-deploy-probe.md)).
