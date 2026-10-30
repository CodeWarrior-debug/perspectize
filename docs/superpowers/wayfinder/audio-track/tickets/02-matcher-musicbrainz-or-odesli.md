# Matcher: MusicBrainz, Odesli, or both

Type: `wayfinder:research` (AFK) · Status: closed · Blocked by: none · Claimed by: Claude

## Question

Which service should find an audio track's other listen links from a pasted link or an ISRC? The owner delegated the call to Claude after the research.

## Resolution (2026-10-10)

**MusicBrainz is the primary matcher. Odesli is not a dependency.** The matcher sits behind a port, so Odesli can be added later as a second adapter if a key is ever confirmed.

Evidence (research agent, full report in the scratchpad file `matcher-research.md`):

- **Odesli:** the keyless request to `api.song.link/v1-alpha.1/links` returned HTTP 401 `PUBLIC_API_ACCESS_DEPRECATED`. The developer site does not resolve. A search summary (unverified against the source page) says keys are no longer issued and the old version retired on 2026-07-31. Caching, commercial-use and attribution terms were not found. One request was used; no form or email.
- **MusicBrainz, 22 well-known tracks across 10 genres** (30 were tried; 8 had no recording with an ISRC among the top candidates):
  - a service link at recording level: 3 of 22; at release level: 21 of 22; any service at either level: 19 of 22;
  - release-level links to Spotify 5, Apple 8, Deezer 4, Tidal 4; Amazon 5 (possibly retail links, unverified); SoundCloud and Bandcamp 0; YouTube 1 at recording level;
  - genres on 10 of 22 and tags on none, so a lookup is best-effort;
  - Cover Art Archive: 7 of 10 checked returned an image.

How the matcher works:
1. Take the pasted link as the seed; find the recording by ISRC or by URL relationship.
2. Read the service links at release level (not recording level), since that is where they live.
3. On a miss, search by title and artist with a score threshold and show "unmatched" rather than guessing.
4. The pasted link's own provider is always kept as a listen link, so the minimum (a thumbnail plus a way to listen) never depends on a match.

Consequences carried to other tickets:
- ISRC is not a reliable join key: about 27% of popular tracks had no ISRC-bearing recording among the top candidates. Fed to [Track identity and dedupe](05-track-identity-and-dedupe.md).
- Genres come from MusicBrainz for under half of tracks, which is another reason genre stays user-assignable ([Genre and category model](04-genre-and-category-model.md)).

Caveats: the sample is small, hand-picked and skewed to mainstream; release counts use only the first release of each recording. A human must still confirm that a matched recording is the right version (live, remaster, edit). Amazon and SoundCloud links need separate verification before the UI promises them.
