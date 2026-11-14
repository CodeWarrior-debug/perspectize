# Book content type

Status: draft <!-- drafted by Claude on 2026-11-11 from the Discover design already on this branch; awaiting owner sign-off on the why -->

## Problem

Perspectize holds videos, movies, passages, claims and (designed) food, but not books, although books are where many of the most argued-over perspectives live. There is no way to attach a perspective to a book, or to see its author, year, length and community rating next to the opinions about it. Books also arrive in many editions: someone holding a 1970 paperback and someone searching the title should land on the same book.

## Proposed outcome

A signed-in user can add a book from the Discover page (search, trending or ISBN) or by pasting an Open Library work link, see it in the Activity table with cover, author, published year, pages, rating and subjects, open a details view with its description, and write perspectives on it like any other content. Every edition of the same work is one book.

## Affected users and systems

- Anyone adding content: the Discover page (a Books source with Search, Trending and ISBN tabs) and the Add Content window (pasted Open Library links)
- Activity table columns, sort and filter, including a new Author column and sort; the content details view
- Backend: an Open Library adapter (no API key), the content service, GraphQL schema
- Content-type designer catalog and previews

## Constraints

- Open Library only for v1; no Google Books fallback
- Identity is the Open Library work key, not an ISBN
- No migration for the content row; authors and the resolved ISBN live in the `response` JSONB
- An unknown fact is empty, never 0; the Discover result cards must let a person decide without leaving the page (Decision 8)
- Book parts (chapter, frontmatter, endmatter) are out of scope until revisited

## Open questions

See "Decisions to confirm" in the spec. Settled on 2026-11-11: all authors are kept as an ordered list in `response`; the description is fetched at add time; pasted Open Library work links are in scope for v1.

## Downstream

- Spec: [../../docs/superpowers/specs/2026-11-09-book-content-type-discover-design.md](../../docs/superpowers/specs/2026-11-09-book-content-type-discover-design.md)
- Plan(s): [../../docs/superpowers/plans/2026-11-09-book-content-type-discover.md](../../docs/superpowers/plans/2026-11-09-book-content-type-discover.md)
- PRs (one line each, add as they open; tick on merge):
  - [ ] Book Discover design, plan, previews, backend adapter and resolvers — PR not yet opened
