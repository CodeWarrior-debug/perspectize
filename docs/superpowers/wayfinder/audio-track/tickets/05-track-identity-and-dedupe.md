# Track identity and dedupe

Type: `wayfinder:grilling` (HITL) · Status: closed · Blocked by: none · Claimed by: none

## Question

What is one audio track — the abstract recording (ISRC, MusicBrainz recording) or one provider's URL? The `content` table has a global `UNIQUE(url)`. Decide:

- what the row's `url` is when the same recording is pasted from YouTube, Spotify and Apple Music;
- the dedupe order (ISRC, then provider id) and what happens when a second provider's link arrives for a track that already exists;
- how fan uploads and lyric videos relate to the official audio (Phase A's "related media");
- what happens when no ISRC can be found (the smoke test found one for only 1 of 51 tracks as shipped, and the matcher research found no ISRC-bearing recording for about 27% of popular tracks, so ISRC cannot be the only join key).

## Resolution (2026-10-11)

Decided with the owner (see [ADR 0005](../../../../../adrs/0005-one-track-row-per-recording.md)):
- One row per recording. Its `url` is the first link pasted; other provider links go in a `track_links` child table.
- Dedupe order: ISRC, then MusicBrainz recording id, then (provider, provider track id), then exact URL. Those merge automatically.
- Final step: when nothing matches but a close candidate exists, the app asks "same song?" and the user confirms. Fuzzy matches never merge on their own.
- Versions (live, remaster, remix) are never merged by name.
- A YouTube Music link to a user upload is its own track labeled "unofficial upload". Plain `youtube.com/watch` links stay YouTube videos, so fan uploads pasted that way never reach this logic.
