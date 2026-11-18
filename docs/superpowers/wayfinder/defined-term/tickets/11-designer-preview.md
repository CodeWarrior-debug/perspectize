# Designer preview for both types

Type: `wayfinder:prototype` (HITL) · Status: open · Blocked by: [Columns and tooltips](08-columns-and-tooltips.md), [Discover tab](09-discover-tab.md), [Term details view and Add flows](10-details-view-and-add-flows.md) · Claimed by: none

## Question

Populate the content-type designer with `DEFINED_TERM` and `TERM_DEFINITION` so the default columns, tooltips, details view, Add forms and Discover decision for both types can be reviewed in one place. Build it from the decisions in the three blocking tickets. After editing `tools/content-type-designer/src/`, rebuild `dist/` with `npx tsc -p tsconfig.json` and commit both, as the root `CLAUDE.md` requires.
