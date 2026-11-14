# Listening safeguards

Type: `wayfinder:grilling` (HITL) · Status: closed · Blocked by: none · Claimed by: none

## Question

What guards should listening have by default? Start from the owner's example — no two songs playing from the same tab at the same time by default — and decide:

- single active player per tab, and whether it extends across tabs and windows;
- autoplay, auto-advance and resume behavior;
- what happens when a player errors (including error 153), is blocked, or is age-restricted, so a transient fault never permanently marks a track unavailable;
- explicit or NSFW refusal for audio tracks, matching Movie's NC-17 stance;
- requirements that come from provider terms (visible player, attribution, no audio extraction).

Also settle the glossary terms this touches and update `CONTEXT.md`.

## Resolution (2026-10-11)

Decided with the owner:
- **One player at a time:** one active player per tab, also enforced across tabs (BroadcastChannel). A setting, off by default, allows overlap.
- **No autoplay or auto-advance.** Playback starts only from an explicit click, and closing the modal stops it.
- **Unavailable links:** only a definite "removed" signal (YouTube errors 101 and 150) marks a listen link unavailable, per link, so one bad provider never hides the track. Transient errors (including 153) mark nothing. Re-checking after 30 days is NOT part of v1.
- **Explicit content:** age-restricted tracks are refused; explicit tracks are allowed with an "E" badge.
- **Provider rules are hard requirements, each backed by a test** (not guidelines). The list, to be completed in the revised spec:
  1. Stored YouTube API data must be refreshed or removed within 30 calendar days (policy III.E.4); this rule is unresolved for existing videos, tracked in [issue 589](https://github.com/CodeWarrior-debug/perspectize/issues/589), and AUDIO_TRACK uses whatever mechanism that settles.
  2. The YouTube player stays visible when it plays; no audio-only extraction.
  3. No code path plays more than one active player per tab unless the override setting is on.
  4. Lyrics are linked, not hosted ([ADR 0003](../../../../../adrs/0003-lyrics-are-linked-not-hosted.md)).
  5. Like counts are not used to calculate other metrics (III.E.4.h).
