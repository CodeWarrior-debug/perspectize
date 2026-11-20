# Architecture decision records

Short records of decisions that are hard to reverse, surprising without context, and the result of a real trade-off. Files are numbered `NNNN-slug.md`; most are a paragraph or two.

## Index

- [0001 Audio track is provider-independent](0001-audio-track-is-provider-independent.md)
- [0002 Provider scope and tiers for audio tracks](0002-provider-scope-and-tiers.md)
- [0003 Lyrics are linked, not hosted](0003-lyrics-are-linked-not-hosted.md)
- [0004 No feature flag for audio tracks](0004-no-feature-flag-for-audio-tracks.md)
- [0005 One track row per recording](0005-one-track-row-per-recording.md)
- [0006 Track genre comes from a seeded copy of Apple's genre tree](0006-genre-from-apple-tree.md)

## Backfill pointers

These decisions are already recorded elsewhere. They are pointers, not ADRs: write a real record only when one of them is revisited.

| Decision | Where it lives today |
| --- | --- |
| Hexagonal architecture and deep modules | `.docs/ARCHITECTURE.md`, `backend/CLAUDE.md` |
| GORM with separate domain and persistence models | `backend/CLAUDE.md` (ORM) |
| Migrations are written in dev and applied by hand per environment, never in dev | `backend/CLAUDE.md` (Migrations), `.docs/MIGRATION_ROLLOUT.md` |
| Neon direct connection, no pooler (realtime LISTEN/NOTIFY) | `backend/CLAUDE.md` (Configuration) |
| Static SPA frontend with load-bearing `_headers` and `_redirects` | `frontend/CLAUDE.md` (Deployment) |
| Query-budget tests for every DB-touching change | `.docs/QUERY_BUDGET.md` |
| TMDB-backed Movie content types | `docs/superpowers/specs/2026-09-27-tmdb-content-types-design.md` |
