# Genre and category model

Type: `wayfinder:grilling` (HITL) · Status: closed · Blocked by: none · Claimed by: none

## Question

Decided so far: the Wikidata genre is user-assigned, not auto-attached, and may be pre-suggested from provider data (YouTube's topic categories arrive as Wikipedia URLs that map to Wikidata entities). The same treatment is wanted later for YouTube videos.

Resolved (see [ADR 0006](../../../../../adrs/0006-genre-from-apple-tree.md)):
- A suggestion is pre-filled, marked "suggested", and saved only when the user confirms.
- Source order: the provider pasted from, then Apple, then MusicBrainz. Apple names match the tree directly; other providers go through an alias list in code.
- A provider genre that matches nothing gives no genre, never an invented one.
- Anyone may set the genre while it is empty. The user who added the track may change it within 30 days. After that, changes wait for a "challenge categorization" feature, which does not exist in the repo yet.
- Anime stays a root. The Worldwide group is flat and alphabetical, renamed "Regional & Cultural" on screen (Apple id 19).
