# Parent/child infrastructure

Type: `wayfinder:grilling` (HITL) · Status: open · Blocked by: none · Claimed by: none

## Question

How does a Definition know its Defined term? The glossary describes force-add, no rollup and "added via parent", but only claims have a parent in code, as a `parentContentId` stored in the JSON `response`. Choose between reusing that pointer and a real `parent_content_id` column with a foreign key (a migration). Consider what the Term column, filtering by parent, counting a term's definitions and force-add need to be cheap, and what the TV season and book part designs would need from the same mechanism so we don't build it twice. Likely an ADR: hard to reverse, surprising without context, a real trade-off.
