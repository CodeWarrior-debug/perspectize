# The `@` reference picker

Type: `wayfinder:grilling` (HITL) · Status: open · Blocked by: [Definition identity, editing and lazy creation](05-definition-identity-and-editing.md) · Claimed by: none

## Question

How does a perspective refer to a term or a definition? The working idea: typing `@` opens a picker that searches terms and definitions, stores the content id in the text and renders it as the term with the definition on hover. Settle the stored token format, which text fields support it (description, review, claim text), what a reference to a not-yet-created dictionary definition does (it must create the row and force-add its term), what shows when the target is removed or merged, how it relates to claim text's `@this` and `@here` tokens, and what the reader sees on hover and click.
