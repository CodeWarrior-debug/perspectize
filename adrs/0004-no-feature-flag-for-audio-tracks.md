---
status: accepted
date: 2026-10-10
supersedes: decision 11 in docs/superpowers/specs/2026-09-26-youtube-music-related-media-design.md
---

# No feature flag for audio tracks

Audio tracks ship without `FEATURE_YOUTUBE_MUSIC` or a `features` GraphQL query. Nothing has been deployed, the bad paths are non-fatal (the player falls back to a listen link, and enrichment is best-effort), and the flag would add a query plus frontend-and-backend skew handling for little protection. A flag is the fallback if the rollout goes badly, not the plan.

## Consequences

- Rollout order is migrate (by hand, per environment), then backend, then frontend.
- Marking a related upload unavailable is a permanent write, so the error-153 fix (plan task B14) must land before audio tracks are exposed to users; with no flag it is the main guard.
