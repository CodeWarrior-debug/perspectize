---
status: accepted
date: 2026-10-11
---

# Track genre comes from a seeded copy of Apple's genre tree

An audio track has at most one genre, stored as a nullable `content.genre_id` pointing at a seeded `music_genres(id, name, parent_id)` table, which is a copy of Apple Music's genre tree (snapshot 2026-10-10) with Apple's ids kept. Wikidata stays the separate, user-assigned category; it is not the genre.

The picker keeps every Apple level, but genres defined by ethnicity, region or language become sub-genres of Apple's Worldwide (id 19), shown as "Regional & Cultural" and listed alphabetically. The Folk root and Hörspiele are not offered. Reason: Apple's 51 roots were more groups than the owner will scroll, and a wide Wikidata-style list was rejected as too loose.

A genre is suggested, never applied: the add form pre-fills it marked "suggested" and it is saved only when the user confirms. The source order is the provider pasted from, then Apple, then MusicBrainz. A provider genre that matches nothing in the tree gives no genre. Anyone may set the genre while it is empty; the user who added the track may change it within 30 days; after that, changes wait for a "challenge categorization" feature that does not exist yet.

The alternative of reading genres live from a provider was rejected because Apple's endpoint is unofficial and undocumented, so the tree is copied once into the database instead of fetched at runtime.

## Consequences

- The seed is a migration, so it is applied by hand per environment like any other.
- Changing a genre after 30 days is blocked until the challenge feature is designed.
