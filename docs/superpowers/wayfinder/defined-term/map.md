# Map: DEFINED_TERM and TERM_DEFINITION (words and their definitions)

Label: `wayfinder:map` · Tracker: local markdown (no issue tracker configured; each ticket is a file in `tickets/` with `Type`, `Status`, `Blocked by` and `Claimed by` lines) · Charted 2026-11-14

## Destination

A locked design ready to hand to `superpowers:writing-plans`: a spec for the two content types, ADRs for the hard-to-reverse decisions (in `docs/adr/`), the new terms in `docs/glossary/content-types/GLOSSARY.md`, and a populated preview in the content-type designer. No application code is written on this map.

## Notes

- Domain: a **Defined term** (the parent: a word or phrase, e.g. "worship") with **Definitions** (the children: one meaning each). People add their own custom definitions and reference them from perspectives. Dictionary definitions are prefilled for reference.
- Settled before charting (owner, 2026-11-14, in conversation):
  - Two content types, not one and not a claim: parent `DEFINED_TERM`, child `TERM_DEFINITION` (label "Definition"; "Sense" and "Meaning" are terms to avoid). The enum name was proposed in the last grilling round and approved with "go".
  - A custom definition is a Definition (child content), not a perspective. A dictionary definition is the same kind of item, told apart by a `source` field.
  - Term identity: lowercased term plus language, English only for now. Canonical URL: the Wiktionary page. A term needs no dictionary entry to be added.
  - Definition identity: its normalized text within one term, so identical texts are the same definition. Opinions about a definition live in perspectives.
  - The dictionary entry is fetched once when a term is first added and stored on the term, with an "as of" date and a "From Wiktionary · CC BY-SA 4.0" credit, shown read-only. The fetch goes to Wiktionary directly, not to the Free Dictionary API (see Source facts). A dictionary definition becomes a real row lazily, when someone writes a perspective on it or references it; that force-adds the term.
  - Parent/child rules follow the glossary: force-add, no rollup, "added via parent".
  - Grid: definitions are flat rows with a Term column. No nested rows (the grid is AG Grid Community; nested rows need Enterprise). The term's details view lazy-loads its definitions: dictionary ones first in dictionary order grouped by part of speech, then custom ones ordered by agreement.
  - Add flow: type a word, the backend fetches the entry and shows a preview (how many definitions, "as of", already in library), then confirm.
  - Referencing: an `@` picker in perspective text searches terms and definitions and stores the id, not the text.
  - Discover: yes, **search only, no feed**. Suggestions as you type, the lookup of a picked word through the backend, "In Library" badge on results, a "Add *x* as your own term" card when there is no match, and an empty state of just the search box and a hint.
- Source facts (probed 2026-11-14 from a cloud session):
  - Free Dictionary API (`api.dictionaryapi.dev`): **rejected** after the source research. It is run by one donor-funded maintainer, had multi-day outages in Aug to Oct 2026, and returns 404 on many phrases and ordinary words.
  - Chosen source: Wiktionary's own `page/definition` REST endpoint, called from the backend once per word. Wikimedia allows 200 requests per minute for an identified client and 10 per minute unidentified. The 429 we saw from a cloud IP is very likely the shared egress pool, unproven until the deploy-host probe.
  - Datamuse `sug` returns sensible suggestions; a key becomes required on 2027-02-01 and its CORS is unreliable from a browser (see the Datamuse research below).
  - Rejected: Merriam-Webster (non-commercial only, 1,000 queries per day, automated queries need written approval) and Wordnik (no caching on the basic plan).
- Finding: parent/child content exists in the glossary but not in code. Only claims have a parent, as a `parentContentId` inside the JSON response. TV seasons and book parts are designed, not built. These two types would be the first real pair, unless we reuse the claim pointer.
- Rules to follow: `.claude/docs/ADDING_CONTENT_TYPE.md` Decisions 1 to 9 (Discover is Decision 7, import preview is Decision 8, source terms are Decision 9). Query budget in `.docs/QUERY_BUDGET.md` applies to the lazy definitions list.
- Consult the `grilling` and `domain-modeling` skills for grilling tickets, and the `content-type-preview` skill for the designer preview.

## Decisions so far

- [Dictionary source: reliability and alternatives](tickets/03-dictionary-source-reliability.md): not the Free Dictionary API (one donor-funded maintainer, multi-day outages, 404s on "born again" and "Holy Spirit"); use Wiktionary's own definition endpoint from the backend, stored once per word; Wiktextract bulk data is the fallback
- [Storing Wiktionary text: licence obligations](tickets/02-wiktionary-licence-obligations.md): storing and showing it is fine; credit "From Wiktionary · CC BY-SA 4.0" on every dictionary definition; dictionary definitions read-only, "write my own" starts blank; no `example` strings stored; audio needs per-file credit
- [Datamuse for suggestions](tickets/01-datamuse-suggestions.md): call it from the backend with a 24-hour prefix cache, not the browser; a key is required from 2027-02-01 and the owner must request one; Wiktionary prefix search is the fallback

## Open tickets (frontier first)

- [Contact for the User-Agent and a deploy-host probe](tickets/13-user-agent-contact-and-deploy-probe.md): task, HITL, unblocked
- [Parent/child infrastructure](tickets/04-parent-child-infrastructure.md): grilling, HITL, unblocked
- [Definition identity, editing and lazy creation](tickets/05-definition-identity-and-editing.md): grilling, blocked by parent/child infrastructure
- [Who sees a custom definition](tickets/06-visibility-ownership-abuse.md): grilling, blocked by definition identity
- [The `@` reference picker](tickets/07-reference-picker.md): grilling, blocked by definition identity
- [Columns and tooltips for both types](tickets/08-columns-and-tooltips.md): grilling, blocked by definition identity
- [Discover tab](tickets/09-discover-tab.md): prototype, HITL, unblocked
- [Suggestion source and the Datamuse key](tickets/12-suggestion-source-and-datamuse-key.md): grilling, HITL, unblocked
- [Term details view and Add flows](tickets/10-details-view-and-add-flows.md): prototype, HITL, blocked by definition identity
- [Designer preview for both types](tickets/11-designer-preview.md): prototype, HITL, blocked by columns, Discover and details view

## Not yet specified

- How the Add Content input treats a bare word. Detection today recognises links by host and never guesses; a typed word needs its own path.
- Building the Wiktextract bulk-data fallback (only if Wikimedia's endpoint proves unreliable or `rest_v1` is removed).
- Refreshing a stored dictionary entry when Wiktionary changes it, and what happens to definitions already created from the old text (waits on the source research and definition identity).
- A lawyer's review of the nine licence items at the end of the licence research, before launch.
- Pronunciation audio: per-file credit from Wikimedia Commons, if we ever show it (not in the first version unless asked).
- Reporting and moderating abusive public definitions (waits on who sees a custom definition).
- Sortable and filterable fields and their SQL paths for both types (waits on columns and tooltips).

## Out of scope

- Fill-in-the-blank definitions with parameters such as "as if X were worth Y". Set aside by the owner on 2026-11-14; definitions are free text.
- Nested rows in the grid. Needs AG Grid Enterprise; the details view carries the hierarchy for now.
- Terms in languages other than English, including Greek and Hebrew terms (those belong with the scripture lexicon work).
- Writing application code. This map ends at a locked design.
