---
status: accepted
date: 2026-10-10
---

# Provider scope and tiers for audio tracks

Every provider gets, at minimum, a thumbnail and a listen link. Embedded listening goes through a provider-neutral player, built for YouTube first and Apple Music next. Spotify and Amazon Music are listen links only for now. Facts below come from provider research dated 2026-10-10 and several are unverified; see the wayfinder map.

- **Tier 1 (desired):** YouTube Music, Apple Music, Spotify, Amazon Music.
  - YouTube plays through its official embed. Apple Music is next via MusicKit, pending a real-subscriber test.
  - Spotify full playback needs Premium plus its Web Playback SDK, and new apps are capped at 5 users until a quota review that targets large organizations, so Spotify stays a link plus its standard embed.
  - Amazon Music has no public web SDK or embed (its Web API is a closed beta), so it is a link only.
- **Tier 2 (interesting, not scheduled):** Deezer, SoundCloud. SoundCloud API registration needs Artist Pro and its terms forbid caching and mixing playback with other services. Deezer forbids storing audio or exposing full-track URLs.
- **Deferred indefinitely:** Tidal, Bandcamp, Qobuz, Pandora and regional services.

## Consequences

- The player must be an interface, not a YouTube component, so a second provider is an added adapter.
- Cross-provider listen links come from a matcher (MusicBrainz and/or Odesli, decided in the wayfinder map), not a per-provider integration.
