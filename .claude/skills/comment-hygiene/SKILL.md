---
name: comment-hygiene
description: Rewrite or delete code comments that cite tickets or narrate past implementations. The pre-push hook runs it on flagged lines.
disable-model-invocation: true
---

A comment explains the code as it stands today, and why. It reads the same to someone who never saw an earlier version, an issue tracker or a pull request.

You get a list of flagged comments (`TIER file line text`). Work through every one.

## Decide per comment

Ask of each: does this comment still say something true and useful after the history is cut away?

- **Keeps a reason** → rewrite it around the reason. Drop the ticket number, the PR, the date and the "used to X, now Y".
- **Restates the code** → delete it.
- **Is already current-state** → leave it unchanged. `SOFT` hits are often exactly this: "an import that no longer exists" describes a state the code handles, not a past implementation.

A comment that exists only to say what changed belongs in the commit message, so delete it.

## Rewrites

| Flagged | Result |
|---|---|
| `// Wait for Clerk before fetching (#636).` | `// Clerk must finish loading first: the table query needs its token.` |
| `// Now uses a map because the slice was too slow.` | `// A map keeps lookups constant-time as the list grows.` |
| `// Previously dropped fields only one side filled in.` | `// Include fields that only one side filled in.` |
| `// Fix for issue 738` | _(delete)_ |
| `// --- request description (#655) ---` | `// --- request description ---` |

A reason that lived only in the ticket (the ticket number is all the comment held) leaves nothing to keep: delete the comment.

## Boundaries

- Edit comment text and nothing else. Code, strings, identifiers, imports and whitespace between statements stay byte-identical; a hook verifies this and discards your edits when code changed.
- Edit only the flagged files, and only at or near the flagged lines.
- Leave `*TEMP*` markers, `hex-ok:` and `history-ok:` comments, doc comments' parameter descriptions, and `TODO`s without a ticket number as they are.
- Keep the surrounding comment's tone and length. A one-line comment stays one line.

## Done when

Every flagged comment is rewritten, deleted or consciously left, and each `HARD` hit (ticket, PR or issue number) is gone from the file. Finish with one line per file: what you changed, or why you left it.
