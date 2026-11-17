# Dictionary source: reliability and alternatives

Research for [ticket 03](../tickets/03-dictionary-source-reliability.md) · probed 2026-11-14 · every claim links to the source that owns it; anything I could not confirm is marked **UNVERIFIED**.

## Recommendation

Do not depend on `api.dictionaryapi.dev`. It is a one-person, donation-funded service whose maintainer has not answered any of the August to October 2026 outage reports, whose deployed code is not the public repository, and whose Wiktionary coverage is patchy: on 2026-11-14 it returned 404 for `every`, `look`, `touch`, `phase`, `is`, `born again`, `carpe diem`, `hypostatic union`, `sola scriptura`, `good news`, `ex nihilo` and `Holy Spirit`, all of which Wiktionary has or are ordinary English words. **Source: Wiktionary's own `page/definition` REST endpoint, called from the Go backend once per word (as the map already plans) with a compliant User-Agent, and stored in Postgres with an "as of" date.** It is the origin of the data, it returned correct results for all four terms I fetched from it (a word, its inflected forms, an alternative-spelling phrase and a theological phrase), and Wikimedia's published limit for an identified client (200 requests per minute) is far above a human-paced "add a word" flow. **Fallback: a Wiktextract/Kaikki bulk extract (raw JSONL filtered to English) loaded into our own tables**, built only when needed: it removes every runtime dependency, covers the case where Wikimedia removes `rest_v1`, and would also give us our own word list for suggestions (relevant to ticket 12). Two things must happen before this is locked: the owner supplies a real contact address or URL for the User-Agent, and someone probes Wikimedia once from the real deploy host, because the 429 seen from this cloud session is most likely the shared egress pool (see section 4) and I could not prove that.

## 1. Free Dictionary API (`api.dictionaryapi.dev`)

**Who runs it.** A single developer, `meetDeveloper` ([GitHub profile](https://github.com/meetDeveloper)); `package.json` names the author as "Suraj Jain" ([package.json](https://raw.githubusercontent.com/meetDeveloper/freeDictionaryAPI/master/package.json)). It is funded by donations: the README says rising AWS costs make it "difficult for me to keep the server running" and reports "more than 10 million requests per month" ([README](https://raw.githubusercontent.com/meetDeveloper/freeDictionaryAPI/master/README.md)). The [site](https://dictionaryapi.dev/) names no operator, no status page, no limits and no licence, and says the API "is and always will be free". Contact is `help@dictionaryapi.dev` (README).

**Open source and self-hostable: only nominally.**
- The repo [meetDeveloper/freeDictionaryAPI](https://github.com/meetDeveloper/freeDictionaryAPI) is public, shown as GPL-3.0 on GitHub while `package.json` says ISC (inconsistent). Last commit 2023-01-01 ([commits](https://github.com/meetDeveloper/freeDictionaryAPI/commits/master)).
- Its `master` code does not fetch Wiktionary at all. [`modules/dictionary.js`](https://raw.githubusercontent.com/meetDeveloper/freeDictionaryAPI/master/modules/dictionary.js) scrapes an undocumented Google Dictionary endpoint with a spoofed browser User-Agent.
- The live service returns Wiktionary data (`sourceUrls: ["https://en.wiktionary.org/wiki/worship"]`, a `license` object, audio hosted at `api.dictionaryapi.dev/media/pronunciations/...`). None of those fields exist in the public code, so **the deployed code is not public** (UNVERIFIED which code runs).
- Self-hosting returns nothing for any word: [issue #231](https://github.com/meetDeveloper/freeDictionaryAPI/issues/231), open since 2025-03-25, no maintainer reply. [PR #242](https://github.com/meetDeveloper/freeDictionaryAPI/pull/242) (third-party, open since 2025-12-31, unreviewed) says Google now returns 400 for every query and adds a Wiktionary fallback.
- So there is nothing we could self-host to get the live behaviour.

**Rate limit and window.** The public `app.js` configures [`express-rate-limit`](https://raw.githubusercontent.com/meetDeveloper/freeDictionaryAPI/master/app.js) with `windowMs: 5 * 60 * 1000` and `max: 450`, "limit each IP to 450 requests per windowMs", over `trust proxy`. That matches the `x-ratelimit-limit: 450` header, so the working answer is **450 requests per 5 minutes per client IP** (UNVERIFIED for the deployed code). Caveats from my probes:
- Cloudflare caches responses (`cache-control: max-age=14400`), and `x-ratelimit-*` headers on a `cf-cache-status: HIT` are replayed from whenever the entry was cached (one had `age: 1296644`, 15 days). Only headers on a `MISS` are live.
- Consecutive MISS responses all showed `x-ratelimit-remaining: 449` rather than counting down, so the counter is per instance or per edge (UNVERIFIED).
- The `x-ratelimit-reset` values on cached first-hit responses sat 293 to 298 s after the entry was generated (consistent with 5 minutes) but one was 21 s, so the header data is noisy.
- For us the limit is irrelevant: one fetch per newly added word is far below 450 per 5 minutes. **Reliability, not rate, is the problem.**

**Uptime and outage history.** There is no official status page. Evidence, newest first:

| When | What | Source |
|---|---|---|
| 2026-10-06 to 10-16 | HTTP 522 on every request; one user reports 100% failures over their last 50 calls across two weeks and switched to Wiktionary; another: "it's dead pretty much". No maintainer reply. | [#253](https://github.com/meetDeveloper/freeDictionaryAPI/issues/253) |
| 2026-09-17 to 10-06 | 502 for nearly every word for a week, except `hello`. A commenter suggests moving to a paid alternative. No maintainer reply. | [#252](https://github.com/meetDeveloper/freeDictionaryAPI/issues/252) |
| 2026-08-26 to 08-30 | 522 timeouts that spread from rare to all words; Cloudflare "connected to server but it times out". No maintainer reply. | [#249](https://github.com/meetDeveloper/freeDictionaryAPI/issues/249) |
| 2025-10-15 to 10-26 | Timeouts, 522s, CORS errors for days. Owner: "This should be working now. Sorry for the inconvenience", closed 10-26. | [#240](https://github.com/meetDeveloper/freeDictionaryAPI/issues/240) |

A third-party Upptime monitor ([BSGalvan/freeDictionaryAPI-uptime](https://github.com/BSGalvan/freeDictionaryAPI-uptime), [summary.json](https://raw.githubusercontent.com/BSGalvan/freeDictionaryAPI-uptime/master/history/summary.json)) reports for `GET /api/v2/entries/en/hello`: 99.41% all-time, **90.89% over 30 days, 97.95% over 1 year**, as of my read. It only checks `hello`, and #252 says `hello` kept working while other words returned 502, so these figures flatter the long tail (inference). Latency on my probes today was 0.2 to 0.4 s.

**Coverage, probed 2026-11-14** (`curl https://api.dictionaryapi.dev/api/v2/entries/en/<term>`; Wiktionary existence checked on en.wiktionary.org via the REST endpoint and page fetches):

| Term | Dictionaryapi.dev | Wiktionary has it? |
|---|---|---|
| `worship` | 200: 2 POS (noun 8 senses, verb 3), IPA, audio, synonyms | yes |
| `worships` | 200: returns the **lemma's** full entry (noun 8, verb 3) under `word: "worships"`; `sourceUrls` lists both pages; no "plural of" / "third-person singular of" sense | yes, as form-of entries ("plural of worship", "third-person singular simple present indicative of worship") |
| `agape` | 200: 2 entries (adjective/adverb; Greek-derived noun "love of God for mankind") | yes (2 etymologies) |
| `born again` | **404** | yes (adjective, "Alternative spelling of born-again") |
| `born-again` | 200 | yes |
| `carpe diem` | **404** | yes (English proverb, Latin, Portuguese, Spanish) |
| `hypostatic union` | **404** | yes (noun) |
| `Holy Spirit` | **404** | yes (proper noun) |
| `sola scriptura`, `good news`, `ex nihilo` | **404** all three | yes (all three) |
| `ad hoc`, `original sin`, `second coming`, `eternal life`, `in vitro` | 200 | (not separately fetched) |
| `every`, `look`, `touch`, `phase`, `is`, `transclusion` | **404** | ordinary English words; issues [#239](https://github.com/meetDeveloper/freeDictionaryAPI/issues/239), #212, #221 report the same |
| `kingdom of God` | 404 | no (correct) |

Of the seven multi-word or capitalised terms I confirmed exist on Wiktionary, the API missed all seven. Multi-word terms are not categorically unsupported (`ad hoc`, `original sin` work), so this is a patchy snapshot, cause UNVERIFIED. A commenter on [#237](https://github.com/meetDeveloper/freeDictionaryAPI/issues/237) recalls about 30% of the repo wordlist returning 404 (their recollection, not a measurement).

**Attribution term.** The owner wrote on #240 that "providing a link to the API's website is all that is needed" for attribution. That says nothing about Wiktionary's CC BY-SA; see ticket 02. The responses label the text CC BY-SA 3.0, but [Wiktionary:Copyrights](https://en.wiktionary.org/wiki/Wiktionary:Copyrights) says CC BY-SA 4.0 and GFDL.

## 2. Bulk extract: Wiktextract / Kaikki.org

- **What it is.** [Wiktextract](https://github.com/tatuylonen/wiktextract) (MIT, maintainer Tatu Ylonen, very active: latest commit 2026-11-12 per [commits](https://github.com/tatuylonen/wiktextract/commits/master)) turns Wiktionary dumps into JSONL, expanding templates and Lua so glosses, forms and pronunciations are accurate. [Kaikki.org](https://kaikki.org/) publishes the output. Peer-reviewed: [LREC 2022](https://preview.aclanthology.org/setup/2022.lrec-1.140).
- **Files** ([rawdata page](https://kaikki.org/dictionary/rawdata.html), extraction 2026-10-30 from the enwiktionary dump of 2026-10-01): `raw-wiktextract-data.jsonl` **24.8 GB, 2.9 GB gzipped, all languages**; Lua modules and templates tarballs; a 20.4 GB audio tarball (not auto-updated). The page says "usually at least once a week". The [English page](https://kaikki.org/dictionary/English/index.html) lists 1,396,111 distinct English-section words, and a 3.2 GB postprocessed `kaikki.org-dictionary-English.jsonl` (HEAD: 3,431,211,190 bytes, last modified 2026-10-30).
- **The English postprocessed file is deprecated** ([wiktextract #1178](https://github.com/tatuylonen/wiktextract/issues/1178), open since 2025-05-09, warnings added 2025-05-13, no removal date). The maintainers point users at the raw file and say to filter by language code per line. Plan on the raw file; users have objected to the deprecation, so the outcome is UNVERIFIED.
- **Cadence and freshness.** The upstream dumps are monthly on the 1st ([dumps listing](https://dumps.wikimedia.org/enwiktionary/)). Kaikki's data is 6 weeks old today (dump 2026-10-01). Re-extraction on our side needs a lot of CPU: the README says all of English Wiktionary takes about 1.25 hours on a 128-core machine, so we would download Kaikki's output, not run Wiktextract ourselves.
- **Licence.** Wiktextract code is MIT. Kaikki.org states no licence for the data and only asks for a citation and links in academic use. The data is Wiktionary text, so CC BY-SA 4.0 plus GFDL applies ([Wiktionary:Copyrights](https://en.wiktionary.org/wiki/Wiktionary:Copyrights)); ticket 02 owns what that means for us.
- **Coverage.** Phrases and inflections are first-class: `worships` appears as two form-of entries ("plural of worship", "third-person singular simple present indicative of worship") ([kaikki page](https://kaikki.org/dictionary/English/meaning/w/wo/worships.html)); `agape` shows both etymologies. The English index lists 5,958 Phrase, 4,016 Prepositional phrase and 1,662 Proverb entries, but multi-word nouns such as `hypostatic union` count under Noun, so the true multi-word total is larger. `born again` has no page on Kaikki (404), though Wiktionary has it as an alternative spelling, so a bulk extract can also miss alt-spelling stubs (UNVERIFIED cause).
- **Size in our database.** A 3 MB head sample of the English file (66 entries, very common words, 44 KB per entry on average) shrank to about 4% when projected down to word, POS, glosses, tags, form-of, two examples, IPA and etymology. Extrapolating to a few hundred MB for the full English set is a guess (UNVERIFIED); the head sample is unrepresentative because it is the translation-heavy common words.
- **Cost of this path.** An ETL job (stream a 2.9 GB gzip, filter `lang_code == "en"`, project, upsert), a refresh process, and storage. The repo rule that `DATABASE_URL` is the shared Neon database means the load must go through a reviewed migration plus a separate job, never ad hoc against dev.

## 3. Wiktionary directly

- **Endpoint.** `GET https://en.wiktionary.org/api/rest_v1/page/definition/{term}` returned structured JSON for `worship` (keys `en` and `other`; English noun with 10 senses, verb with 4, plus Jamaican Creole under `other`), for `worships` (the two form-of senses), for `born again` ("Alternative spelling of born-again") and for `hypostatic union`. I fetched these through the web-fetch tool (presumably a different network from this session's egress, since it succeeded where my own requests were rate limited). Definitions contain HTML, which we must sanitise; there is no IPA, etymology or audio in this shape.
- **Stability.** `rest_v1` is a RESTBase route. [RESTBase/deprecation](https://www.mediawiki.org/wiki/RESTBase/deprecation) says "The RESTbase service should be deprecated and removed from WMF sites", with no date and no mention of `page/definition`. The [API changelog](https://www.mediawiki.org/wiki/Wikimedia_APIs/Changelog) shows `rest_v1` interactive docs redirected in January 2026 and no entry on `page/definition`. So the endpoint works today and has no guarantee (UNVERIFIED how long). That is the main reason to keep the bulk extract as the fallback.
- **Published limits** ([Wikimedia APIs/Rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits), last edited 2026-11-08, "new in 2026 and subject to experimentation and change"), enforced per minute across the Action and REST APIs:

  | Client | Limit |
  |---|---|
  | Unidentified (only an IP) | **10 per minute** |
  | Unauthenticated bot with a compliant User-Agent | **200 per minute** |
  | Authenticated, new or few edits | 200 per minute |
  | Authenticated, established editor | 2000 per minute |
  | Bot-flagged accounts; Toolforge/Cloud Services with a compliant UA | exempt |

  A 429 carries `Retry-After`; if absent wait at least 5 s or back off exponentially. The same page asks for at most 3 concurrent requests. Phase 1 enforcement began 2026-03-12; phase 2, which also limits identified requests, began the week of 2026-04-28 (changelog).
- **User-Agent policy** ([Foundation policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)): format `<client name>/<version> (<contact information>) <library>/<version>`, where contact is an email, a URL or a wiki user; include the string "bot"; never copy a browser UA; generic agents such as `curl` or `python-requests` may be blocked. [Robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy): REST API unauthenticated concurrency 3 and under 5 requests per second; honour `Retry-After`; pause at least 15 minutes after a 5xx; consider dumps before live requests. Higher limits: contact `bot-traffic@wikimedia.org`; high-volume commercial use is steered to Wikimedia Enterprise.

## 4. Was the Wiktionary 429 the shared IP or a general limit?

Both, and I could not separate them. A general limit exists and is new: 10 per minute for unidentified clients, 200 per minute for compliant-User-Agent bots (section 3). But the 429 we saw is very likely the shared cloud egress pool, not our own rate:

- Six attempts over about 3 minutes, never more than two requests at once. Five returned `429` with `x-envoy-ratelimited: true`, `retry-after` of 14, 14, 28, 24 and 24, and the body "You are making too many requests to the API. Please follow the best practices at https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits ... contact bot-traffic@wikimedia.org". The sixth returned 200 with a `Date` header nine hours old, so it was a CDN cache hit.
- The five 429s came from five different `x-client-ip` values in `160.79.106.0/24` (.128, .133, .136, .137, .140; the cache hit was .230), so our traffic is spread across a pool that other sessions also use.
- Simultaneous requests from different pool IPs got identical `Retry-After` values (14 and 14; 24 and 24), which suggests one shared bucket for the range (UNVERIFIED; Wikimedia's page does not say how shared or datacenter ranges are bucketed).
- Changing the User-Agent did not help: default `curl`, a descriptive one-liner, and a format-compliant one (`Name/0.1 (https://example.org/probe; probe@example.org) curl/8`) all got 429. The compliant string used a placeholder contact, so it does not prove a real contact would also fail.

Conclusion: do not read the 429 as "Wiktionary is too limited for us". A single backend adding words by hand will make a handful of requests per minute. Verify by sending about five requests from the real deploy host with a real contact in the User-Agent.

## 5. Comparison

| | dictionaryapi.dev | Wiktionary REST direct | Wiktextract / Kaikki bulk |
|---|---|---|---|
| Operator | one individual, donations | Wikimedia Foundation | one researcher (Kaikki), active OSS project |
| Reliability evidence | three multi-day outages in 2026, one in 2025, no maintainer replies | WMF-run; no SLA; rate limit published | none at runtime (data is ours) |
| Coverage of phrases, alt spellings, forms | patchy (7 of 7 confirmed Wiktionary terms missed; `every`, `look`, `is` 404) | complete for the 4 terms fetched | complete for forms and phrases; one alt-spelling stub absent |
| Inflected forms | resolves to lemma entry, hides "form of" | returns form-of senses | returns form-of senses |
| Rate limit | 450 per 5 min per IP (source), irrelevant at our volume | 200 per min identified, 10 unidentified | none |
| Self-host | no (deployed code not public) | no | yes, we own the data |
| Freshness | unknown | live | up to weeks to months old |
| Extras | IPA, audio URL, some synonyms | none (definitions and examples only) | IPA, etymology, forms, translations, categories |
| Work for us | one adapter | one adapter plus HTML cleanup | ETL, storage, refresh, schema churn |
| Main risk | the service disappears | `rest_v1` removal (no date) | postprocessed file deprecated; data licence spelled out only by inheritance |

## Not verified

- Whether a real contact in the User-Agent avoids the 429 from the deploy host's IP (no real contact available to me; my probe used a placeholder).
- How Wikimedia buckets shared or datacenter IP ranges.
- When or whether `rest_v1/page/definition` is removed.
- Which code the live `api.dictionaryapi.dev` runs, its true rate-limit window, and why it 404s on common words.
- The data size of a slim English table in Postgres (estimate only).
- Whether Wikimedia Enterprise offers a usable free Wiktionary tier (only mentioned on the rate-limits page).
- A third-party self-hostable option, Wiktapi, appeared in a web search as loading Kaikki JSONL into SQLite; I did not read its source, licence or maintenance.

## Open for the map

- The owner must pick the contact address or URL for our User-Agent (a real one is required by the policy).
- Ticket 12 (suggestions): a bulk extract would give us our own word list, removing the Datamuse key and the Wiktionary prefix-search fallback. That is the only reason to build the bulk path early.
- Ticket 02 needs the corrected licence version: Wiktionary text is CC BY-SA 4.0 and GFDL; the Free Dictionary API reports 3.0.
