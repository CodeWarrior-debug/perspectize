---
status: accepted
date: 2026-10-11
---

# One track row per recording, with a link table for providers

An audio track is one row per recording, not one row per pasted link. The row's `url` is the first link pasted and never changes. Every other provider link lives in a child `track_links` table: provider, provider track id, URL, kind (listen or embed), how it was found (pasted or matched), and when it was last found unavailable.

A pasted link is matched to an existing track in this order: ISRC, MusicBrainz recording id, (provider, provider track id), exact URL. Those matches merge automatically. A close candidate without an identifier match (same title and artist, similar length) is only offered to the user as "same song?", and the user confirms. Versions (live, remaster, remix) are never merged by name. A YouTube Music link to a user upload becomes its own track labeled "unofficial upload" and is never merged with the official recording. Plain `youtube.com/watch` links stay YouTube videos.

The alternative, one row per link, is simpler but turns the same song pasted from Spotify and Apple Music into two rows, which splits perspectives and ratings about one song. It is also hard to undo once perspectives hang off the rows. ISRC cannot be the only key: matcher research found no ISRC-bearing recording for about 27% of popular tracks.

## Consequences

- `content.url` stays globally unique, so a second provider's link for an existing track is stored in `track_links`, not as a new content row.
