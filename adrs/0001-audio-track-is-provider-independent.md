---
status: accepted
date: 2026-10-10
---

# Audio track is provider-independent

Music is one content type, `AUDIO_TRACK`, and the provider is data on the track (its listen links), not part of the type. This replaces the `YOUTUBE_MUSIC` type that PR #440 built in Phase A. Nothing has been deployed or migrated anywhere, so the rename costs only code and the not-yet-applied migration, and it is cheapest now.

## Considered options

- `YOUTUBE_MUSIC` or `YOUTUBE_MUSIC_TRACK`: rejected because it ties the type to one provider and would force a new content type per provider as Apple Music, Deezer and the others are added.

## Consequences

- `YOUTUBE_VIDEO` stays for ordinary videos. A pasted `music.youtube.com` link becomes an `AUDIO_TRACK` with YouTube as its first listen link.
- Phase A's names (`YOUTUBE_MUSIC`, `createContentFromYouTubeMusic`, `Content.music`) need renaming in the revised plan, and the ISRC-index migration (`000032_youtube_music_isrc_index`) is renamed with it before it is applied anywhere.
