# Food & drink content type

Status: draft <!-- drafted by Claude from a one-line request on 2026-11-01; awaiting owner sign-off on the why -->

## Problem

Perspectize only holds media: videos, movies, passages and claims. People also hold strong, often argued-over perspectives on what they eat and drink: whether a product is healthy, worth its calories, overprocessed, or better than an alternative. Today there's no way to attach a perspective to a specific food or beverage, or to see its nutrition next to the opinions about it.

## Proposed outcome

A signed-in user can add a food or drink by barcode, source URL or name search, see its calories and nutrition panel from an authoritative public source, compare items side by side in the Activity table (per serving or per 100 g/ml), and write perspectives on it like any other content.

## Affected users and systems

- Anyone adding content: the Add Content window and the Discover page
- Activity table columns, sort and filter; the content details view
- Backend: two new external adapters (USDA FoodData Central, Open Food Facts), the content service, and GraphQL schema
- Config: one new API key (data.gov) and a contact email for Open Food Facts

## Constraints

- Free, storable data sources only: the `response` JSONB is permanent, so sources that forbid caching are out
- Nutrition and allergen data are not medical advice and must be labelled as such
- Open Food Facts' per-IP rate limits are shared by every user (our backend is one IP)
- No migration if avoidable; never applied by the agent if one is needed

## Open questions

See §14 of the spec ("Decisions to confirm").

## Downstream

- Spec: [../../docs/superpowers/specs/2026-11-01-food-item-content-type-design.md](../../docs/superpowers/specs/2026-11-01-food-item-content-type-design.md)
- Plan(s): not yet written
- PRs (one line each, add as they open; tick on merge):
  - [ ] Spec + intent (this PR)
