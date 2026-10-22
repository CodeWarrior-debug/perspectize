# ADR 0001: Defer the Facebook video / Reel content type

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** project owner
- **Related:** [Facebook video spec](../superpowers/specs/2026-10-19-facebook-video-content-type-design.md) (§2 and §9 Q1), [FEATURE_BACKLOG.md](../../FEATURE_BACKLOG.md#facebook-video--reel-content-type)

## Context

Every content type that works well in Perspectize stores source metadata: the title, a thumbnail, duration and counts. YouTube gets these from the YouTube Data API with only an API key.

Research for a Facebook video / Reel type (2026-10-19) found three ways to get that metadata. Only one is open to us, and only on paper:

1. **oEmbed:** no longer returns a title, thumbnail or author (removed 2025-11-03). Meta also limits what it does return to "front-end views" and forbids storing it. **Closed.**
2. **Scraping `og:` tags:** forbidden by Meta's Automated Data Collection Terms without written permission. `robots.txt` disallows all agents. **Closed.**
3. **Graph API `/{video-id}`:** reading videos on Pages we don't manage needs the **Page Public Content Access** feature. To get it we must:
   - register a Meta developer app;
   - pass **App Review**;
   - pass **Business Verification**, which needs legal documents for a registered business;
   - possibly sign extra agreements.

   Meta states the permitted use as analysing and displaying Page posts, which isn't "show any video a user pastes". Even if approved, it covers Page videos only, not personal profiles, and field coverage is unclear. Once approved, the app carries ongoing duties: a privacy policy URL, a data-deletion path and an annual Data Use Checkup.

We judge that we **probably wouldn't pass** that review today:
- Perspectize isn't a registered business that can complete Business Verification.
- Our use case falls outside the feature's stated purpose.

The spec shows a version that needs no review: the user types the title and creator, and the player is a click-to-load embed. It works, but the result is weaker than any other video type. It has no thumbnail, duration, views or publish date, and every title is unchecked user text. The launch prerequisites (privacy policy, terms, DMCA agent, report flow) would also be due first.

## Decision

**Defer the Facebook video / Reel content type.** Build none of it now, including the user-entered fallback. Keep the spec as the starting point for later.

## Consequences

- No Meta app, App Review, Business Verification or Meta data obligations for now.
- Users can't add Facebook videos. A pasted Facebook link stays unrecognised in Add Content, as it is today.
- The research and design stay in the spec. Its [P]/[U] claims must be re-checked when this is picked up, because Meta changes these rules often.

## Revisit when any of these is true

- Perspectize becomes a registered business that can pass Business Verification, and a use case fits Page Public Content Access.
- Meta changes its terms so oEmbed (or another endpoint) returns a title and thumbnail we may store.
- Users ask for Facebook videos enough that the user-entered version is worth building. By then the legal prerequisites in spec §6.2 must exist.
