# Suggestion source and the Datamuse key

Type: `wayfinder:grilling` (HITL) · Status: open · Blocked by: none (the source reliability research is closed) · Claimed by: none

## Question

Which source feeds as-you-type suggestions on Discover and in the Add flows, called from our backend? The Datamuse research says a key is required from 1 February 2027 and the only route to one is describing the app and a traffic estimate to Datamuse. It also found Datamuse weak on some typos and empty on arbitrary phrases. The fallback is Wiktionary's prefix search (real entries only, multi-word headwords work, limited to 200 requests per minute with a compliant User-Agent). Decide: Datamuse with a key, Wiktionary prefix search, or both behind one backend route. If Datamuse stays in, the owner sends the request to Datamuse before the cutoff. Settle the cache rule (24 hours by normalized prefix is what the server itself allows) and the credit wording. Read the [Datamuse research](../research/01-datamuse-suggestions.md) and the [source reliability research](../research/03-dictionary-source-reliability.md). The latter picks Wiktionary's own API as the dictionary source, so Wiktionary prefix search becomes a natural single-vendor choice, and a Kaikki word list could later power suggestions too.
