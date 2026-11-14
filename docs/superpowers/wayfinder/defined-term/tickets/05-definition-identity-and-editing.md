# Definition identity, editing and lazy creation

Type: `wayfinder:grilling` (HITL) · Status: open · Blocked by: [Parent/child infrastructure](04-parent-child-infrastructure.md) · Claimed by: none

## Question

A definition's identity is its normalized text within a term. Settle the details: what normalization (case, whitespace, punctuation, trailing full stop), what happens when the adder edits the text (a new identity, a merge into an existing definition, or editing locked once anyone has a perspective on it), what happens when a person types a dictionary definition word for word, how a dictionary definition's lazy creation works (what triggers it, what is stored, which part of speech and example it carries), and what a user definition carries beyond its text (part of speech, optional example). The licence research fixes two constraints: a dictionary definition is read-only, and "write my own" starts from a blank box, so a person never edits dictionary text in place. Check the rules against concrete cases: "devotion to a deity" typed with and without a full stop; a definition edited after ten people rated it.
