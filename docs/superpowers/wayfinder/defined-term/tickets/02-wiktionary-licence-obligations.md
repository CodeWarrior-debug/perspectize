# Storing Wiktionary text: licence obligations

Type: `wayfinder:research` (AFK) · Status: closed · Blocked by: none · Claimed by: Claude

## Question

What do we owe if we store Wiktionary definitions in our database and show them? Wiktionary text is CC BY-SA 4.0 (the Free Dictionary API reports 3.0). Find what attribution has to look like, what share-alike means for our own user-written definitions shown next to it, whether storing a snapshot differs from fetching live, and whether pronunciation audio carries a separate licence. The answer decides how the credit appears on every dictionary definition and how dictionary and custom definitions are kept visibly separate (Decision 9 in `ADDING_CONTENT_TYPE.md`).

## Resolution (2026-11-14, research subagent; a practical reading, not legal advice; full findings in [the research file](../research/02-wiktionary-licence-obligations.md))

- Storing a snapshot and showing Wiktionary definitions is fine, and "commercial" changes nothing for the text itself (CC BY-SA has no non-commercial term). The obligations are the same for a snapshot and for a live fetch.
- Every dictionary definition shows a credit: short form "From Wiktionary · CC BY-SA 4.0", with "Wiktionary" linked to that term's Wiktionary page and the licence name linked. The details view shows the full form once per term (source page, retrieval date, "excerpted and reformatted; not endorsed by Wiktionary or the Wikimedia Foundation", and "definitions written by Perspectize users are not part of that entry"). Use the plain word "Wiktionary", not a logo.
- A user definition shown beside a dictionary one is a collection, so share-alike does not reach it. A user editing dictionary text would create an adaptation that would have to be CC BY-SA. So dictionary definitions are read-only, "write my own" starts from a blank box, and dictionary and user text are never merged or reworded.
- Store the source URL, retrieval date and licence name and link per entry, and return them through GraphQL. Carve the Wiktionary text out of our Terms of Service.
- Pronunciation audio is licensed per file (three different licences across three words), and the API gives no author. If we ever store audio we need author, licence and file URL from Commons for each file.
- Do not store the API's `example` strings yet: one looked like a Bible quotation that may sit under fair use, not CC BY-SA.
- A bulk dump shared publicly could pull in database-level share-alike. The research file ends with nine items for a lawyer to confirm.
