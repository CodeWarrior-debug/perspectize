# Phase 13: Content Categories — Context

**Gathered:** 2026-02-16
**Updated:** 2026-02-20
**Status:** Blocked — awaiting taxonomy research spike (see cross-phase architecture in 04-CONTEXT.md)

<domain>
## Phase Boundary

Enable content categorization using Google NL taxonomy with hierarchical structure, plus flat labels for search. Part of the unified faceted search architecture shared with Phases 4B, 14, and 15.

</domain>

<decisions>
## Implementation Decisions

### Category Model (decided 2026-02-20)

**Primary category (hierarchical):**
- Single `category_id` FK on content table
- Google NL taxonomy (curated 20 of 27 categories) as foundation
- User-created categories also supported (same table, same hierarchy)
- Hierarchical via PostgreSQL ltree extension
- This is what drives AG Grid expandable tree grouping

**Labels (flat, many-per-content):**
- Non-hierarchical text tags for search/filtering
- Case-insensitive comparison
- Storage: separate labels table OR JSONB array with required `value` + optional metadata fields (Claude's discretion)
- Used in faceted search, not for grid grouping

### Auto-categorization

- Claude Haiku for classification (5x cheaper than Google Cloud NL API)
- $0.031/month for 100 videos
- Suggestion-based, not mandatory

### Storage

- Categories lookup table with ltree paths
- GIN index for label search (whether TEXT[], JSONB, or join table)

### Claude's Discretion

- Label storage format (separate table vs JSONB array) — pick what works best with GORM + AG Grid
- Optional fields on labels beyond required `value`
- Category seed data selection from Google NL taxonomy

</decisions>

<open_questions>
## Open Questions — Research Spike Needed

Before execution, a research spike must answer:
1. **Taxonomy depth:** How many levels does Google NL taxonomy have? (currently only using top-level 20/27)
2. **Traversal:** How to see all categories at one level, drill deeper, go higher
3. **Subcategory mapping:** What subcategories exist under top categories like Sports, Arts, etc.?
4. **ltree fit:** Does the taxonomy hierarchy map cleanly to ltree paths?
5. **YouTube mapping:** Can YouTube video metadata (tags, channel, description) reliably map to taxonomy nodes?
6. **Custom categories:** How do user-created categories coexist with Google taxonomy in the hierarchy?

</open_questions>

<cross_phase>
## Cross-Phase Architecture Reference

See `04-CONTEXT.md > Cross-Phase Architecture: Faceted Search & Grouping` for the unified architecture decisions covering Phases 4B, 13, 14, and 15.

Key decisions:
- Faceted search pattern (search + category + labels → backend intersection → AG Grid grouping)
- AG Grid expandable tree rows grouped by category hierarchy
- API designed for both client-side and server-side grouping from day one
- Start client-side, upgrade to server-side when data volume warrants

</cross_phase>

<specifics>
## Specific Ideas

- NFL athlete canonical example: Mahomes video → category "Sports > NFL > Chiefs", labels ["Mahomes", "2024 season", "game film"]
- Faceted search UX like Amazon product filtering
- Both curated (Google NL) and user-created categories in same hierarchy

</specifics>

<deferred>
## Deferred Ideas

- None new — existing deferred items from previous context still apply

</deferred>

---

*Phase: 13-content-categories*
*Context gathered: 2026-02-16*
*Updated: 2026-02-20*
