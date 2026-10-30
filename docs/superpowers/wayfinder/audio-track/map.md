# Map: AUDIO_TRACK (music across providers)

Label: `wayfinder:map` · Tracker: local markdown (no issue tracker configured; each ticket is a file in `tickets/` with `Type`, `Status`, `Blocked by` and `Claimed by` lines) · Charted 2026-10-10

## Destination

A locked design ready to hand to `superpowers:writing-plans`: ADRs for the decisions (in `adrs/`), the glossary (`CONTEXT.md`), a populated `AUDIO_TRACK` preview in the content-type designer, and a revised spec and plan replacing the YouTube-Music-only ones. No application code is written on this map.

## Notes

- Domain: music as a content type, replacing `YOUTUBE_MUSIC` from PR #440 (branch `claude/music-content-api-oyfdht`, merged with main at `24e8b1fe`). Existing docs: `docs/superpowers/specs/2026-09-26-youtube-music-related-media-design.md`, `docs/superpowers/plans/2026-09-26-youtube-music-related-media-plan.md`, preview `tools/content-type-designer/previews/youtube-music-activity.html`.
- The owner has YouTube Premium, Apple Music and Amazon accounts; no Spotify account.
- Provider facts are in the scratchpad report `provider-research.md` (dated 2026-10-10); items marked UNVERIFIED there are not facts.
- Priorities, in order: thumbnails plus listen links (minimum); embedded listening, subscriber listening, lyrics link; genre mapping, counts, metadata (niceties). Listening safeguards matter most among the safeguards.
- Consult the `grilling` and `domain-modeling` skills for grilling tickets. Update `CONTEXT.md` as terms settle.

## Decisions so far

- [ADR 0001: Audio track is provider-independent](../../../../adrs/0001-audio-track-is-provider-independent.md) — one `AUDIO_TRACK` type; the provider is data, not part of the type
- [ADR 0002: Provider scope and tiers](../../../../adrs/0002-provider-scope-and-tiers.md) — big four desired; Amazon link-only; Deezer and SoundCloud later; the rest deferred
- [ADR 0003: Lyrics are linked, not hosted](../../../../adrs/0003-lyrics-are-linked-not-hosted.md) — link out; a licensed in-app tab is a later upgrade
- [ADR 0004: No feature flag](../../../../adrs/0004-no-feature-flag-for-audio-tracks.md) — drop `FEATURE_YOUTUBE_MUSIC` and the `features` query
- [Counts and thumbnails: cache rules](tickets/09-counts-and-thumbnails-cache-rules.md) — store counts with a fetched-at date and refresh or drop within 30 days; hotlink thumbnails
- [Matcher: MusicBrainz, Odesli, or both](tickets/02-matcher-musicbrainz-or-odesli.md) — MusicBrainz primary via release-level links; Odesli not a dependency (keyless access returns 401); ISRC is an unreliable join key
- [ADR 0005: One track row per recording](../../../../adrs/0005-one-track-row-per-recording.md) — first pasted link is the `url`; other providers in `track_links`; ISRC, MusicBrainz id, provider id, URL, then a user-confirmed "same song?"
- [Listening safeguards](tickets/03-listening-safeguards.md) — one player per tab and across tabs; no autoplay; only definite removal marks a link dead (no recheck in v1); refuse age-restricted, badge explicit; provider rules are hard requirements with tests
- [ADR 0006: Track genre from Apple's tree](../../../../adrs/0006-genre-from-apple-tree.md) — Option C picker, one genre per track, suggest-then-confirm, anyone sets when empty, adder edits within 30 days

## Open tickets (frontier first)

- [Subscriber listening test with real accounts](tickets/01-subscriber-listening-test.md) — task, HITL, unblocked
- [Subscriber sign-in and token storage](tickets/06-subscriber-sign-in-and-token-storage.md) — grilling, blocked by the subscriber listening test
- [UI integration: grid, details and add flow](tickets/07-ui-integration.md) — prototype, unblocked (genre, safeguards and identity are decided)
- [AUDIO_TRACK preview in the content-type designer](tickets/08-designer-preview.md) — prototype, blocked by UI integration

## Not yet specified

- A "challenge categorization" feature for changing a genre after the 30-day window — not in the repo; needs its own design.
- The 30-day rule for stored YouTube API data (videos and tracks) — decision tracked in [issue 589](https://github.com/CodeWarrior-debug/perspectize/issues/589); the first provider rule in the safeguards ticket waits on it.
- Apple MusicKit playback details (developer token, origin claim, user-token handling) — waits on the subscriber listening test.
- Renaming Phase A code and GraphQL names from `YOUTUBE_MUSIC` to `AUDIO_TRACK`, and moving the ISRC index to `response->'music'` — belongs in the revised plan.
- Deezer and SoundCloud adapters — SoundCloud needs Artist Pro; Deezer's track fields are unverified.
- Spotify's quota-extension route, if subscriber listening on Spotify ever matters.
- Verifying Amazon and SoundCloud links in MusicBrainz, and whether an Odesli key or allowlist is obtainable (revisit the second matcher adapter only then).
- A scheduled refresher for stored counts and thumbnails, and takedown or removal handling.
- Back-filling YouTube videos with the same genre and category treatment — follows the genre model.
- An in-app licensed lyrics tab — only if a provider's terms and cost are acceptable.

## Out of scope

- Tidal, Bandcamp, Qobuz, Pandora and regional services — deferred indefinitely ([ADR 0002](../../../../adrs/0002-provider-scope-and-tiers.md)).
- Albums, playlists and podcasts — only single tracks.
- Amazon Music playback — no public web SDK or embed; link only.
- Writing application code — this map ends at a locked design.
