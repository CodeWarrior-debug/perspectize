# Perspectives

What a person thinks about one piece of content, and how those views are scored, shared and summarised.

## Language

### The perspective

**Perspective**:
One user's viewpoint on one content item: ratings, a review, feelings, labels and free-form fields.
_Avoid_: Take, response, opinion, post

**Claim**:
The short required statement at the heart of a perspective; also a content type of its own (a proposition to affirm or deny).
_Avoid_: Title, headline

**Review**:
The long free-text commentary on a perspective. Not a moderation step.
_Avoid_: Comment, notes

**Description**:
Free-text explanation attached to a perspective, distinct from its review.

**Label**:
A short user-chosen tag on a perspective.
_Avoid_: Tag (reserved for tags that come from a content source)

**Custom field**:
A user-defined key and value on a perspective. A numeric one acts as an extra rating dimension in Compare.

**Primary perspective**:
The one other perspective this perspective is chiefly about or built on.

**Related perspective**:
Another perspective this one points to; at most fifty per perspective.

### Ratings

**Rating**:
A whole number from 0 to 10,000, shown to people as 0–10. Every "how much" field (quality, agreement, importance, confidence, priority, feeling intensity) uses this one scale.
_Avoid_: Score, stars

**Standard dimensions**:
The four rating fields every perspective can carry: quality, agreement, importance, confidence.
_Avoid_: Core ratings, base ratings

**Quality**:
The headline dimension: how good the content is. The one averaged across perspectives.

**Agreement**:
How far the author agrees with the content.

**Importance**:
How much the content matters.

**Confidence**:
How sure the author is of their own view.

**Categorized rating**:
A rating on a named axis of the author's choosing, kept inside one perspective.
_Avoid_: Category rating

**Optional dimension**:
An extra rating field a user adds on demand (for example originality, clarity, depth, rigor, bias, actionability, relevance). Stored as a custom field.

**Relevance**:
The optional dimension "does it matter now?". Unrelated to the Browsing term _column relevance callout_.

### Feelings

**Feeling**:
One emoji picked for a perspective, with an intensity and an optional note. A perspective holds at most ten.
_Avoid_: Emotion, reaction

**Feel wheel**:
The circular picker of twenty core feelings, arranged so opposites sit across from each other.

**Extended set**:
The larger searchable collection of feelings beyond the wheel.

**Intensity**:
A feeling's strength, on the rating scale.

**Feeling stats**:
For one content item or all content: how many perspectives carry a feeling, what share of all perspectives that is, and the average and spread of its intensity.

### Visibility

**Privacy**:
Whether a perspective (or todo, or list) is public or private. Exactly two levels; default public. Wider audiences for a private perspective (sharelist, criteria rule, aggregates) are separate settings, not a third level: see [ADR 0002](../../adr/0002-sharing-model.md).
_Avoid_: Visibility, sharing level, unlisted

**Owner**:
The user who created a row. Only the owner may change or delete it.
_Avoid_: Author, creator (reserved for content makers)

**Viewer**:
The person making a request, or nobody when anonymous. Decides which rows a read returns.

**Owner-or-public rule**:
Lists show public rows plus the viewer's own. Asking for someone else's private row by id answers "not found", never "forbidden", so its existence is not confirmed.

### Summaries

**Aggregate**:
The per-content summary of all its perspectives, public and private alike: how many, how many set a quality, and their average quality. Privacy governs who can read a perspective, not whether it counts.

**Perspective count**:
How many perspectives exist on a content item. The count a viewer is allowed to read is a separate, smaller number.

**Review status**:
Moderation state of a perspective: pending, approved or rejected. Not a draft marker.
_Avoid_: Draft, status

**Draft perspective**:
A convention, not a state: an imported perspective kept private and labelled with where it came from.
