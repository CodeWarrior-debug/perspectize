# ADR 0002: Long-term sharing model (two slots, private audiences)

- **Status:** Accepted (direction, not scheduled: nothing here is built yet)
- **Date:** 2026-11-13
- **Deciders:** project owner
- **Related:** [Perspective privacy design](../superpowers/specs/2026-09-09-perspective-privacy-design.md), [Multiple perspectives per content](../superpowers/specs/2026-09-29-multiple-perspectives-per-content-design.md) (Gate 1), [FEATURE_BACKLOG.md](../../FEATURE_BACKLOG.md#multiple-perspectives-per-content-public--private-slots), [Perspectives glossary](../glossary/perspectives/GLOSSARY.md) ("Privacy")

## Context

Today a perspective is either `PUBLIC` or `PRIVATE`, and a user has one perspective per item. `PRIVATE` means owner-only. That is enough for now, but several planned features wait on a settled sharing model:

- two perspectives per item (the multiple-perspectives spec says it is only correct if the model has exactly two visibility levels: its "Gate 1");
- sharing task lists;
- a public activity-browsing page and share links;
- aggregates that include private opinions;
- perspectives written on other perspectives.

This record fixes the **direction** so those features can be designed against one model. It does not schedule or specify any of the work.

## Decision

### 1. Now versus later

Until a feature needs more, **one perspective per user per item, either public or private**, as today. Nothing below is built by this ADR.

### 2. Subjects

A perspective's subject is either a **content item** or **another perspective** (a "response").

### 3. Two slots

A user may have **at most one public and one private perspective per subject**: unique on `(user, subject, privacy)`, enforced by a database constraint. The two are separate rows. They are **allowed to contradict each other** on purpose: people can hold a public stance and a different private one.

### 4. Privacy stays two values

`Privacy` is exactly `PUBLIC` or `PRIVATE`. Sharing is **not** a third level. It is a set of separate settings on the private row. The glossary rule ("exactly two levels") still holds, and Gate 1 of the multiple-perspectives spec is satisfied.

### 5. Public

Visible to everyone without restriction, and always counted in aggregates.

### 6. Private, and how it can be widened

A private perspective is **owner-only by default**: aggregates off, empty sharelist, no rule. Each widening below is an **explicit opt-in on that one perspective**, never an account-wide default. The three are **independent and additive**: a viewer may read the row if any of them grants it.

| Widening | Meaning |
|---|---|
| **Allow in aggregates** | The row contributes numbers only. Never attributable to its owner, and hidden or coarsened below a minimum contributor count so a small total can't reveal one person's value. |
| **Sharelist** | A reusable, named, one-way list of users owned by the perspective's owner. One list can be attached to many private perspectives. No acceptance step. Removing a user revokes access immediately. |
| **Criteria rule** | Access depends on the viewer's own ratings (for example "belief in Christ, importance above 9 and agreement above 9.5"). Rules are **live**: access follows the viewer's current data. |

**Criteria rules in detail**

- By default a rule is matched against the viewer's **public** perspectives. A viewer may opt chosen private perspectives in to being matched.
- When a viewer has both a public and a private perspective on the rule's item, one row is matched. **Public by default**. The exact policy, including a choice by the rule's setter, is left to the spec.
- The owner **never learns who matched** a rule. A sharelist is the way to name people. Whether any thresholded count is shown to the owner is not committed.
- The rule language (operators, fields, nesting) is deferred to its own spec.

### 7. Aggregates: one vote per user per subject

An aggregate counts **at most one vote per user per subject**. The **public row wins** by default. Other tiebreak policies (private wins, average of the two) are left to the spec. A user's **responses to their own perspective never count toward that perspective's aggregate**. Self-targeting and nesting stay allowed as reflection, but carry no aggregate weight. This is the anti-pumping invariant.

### 8. Responses (perspectives on perspectives)

- Writing a response **requires read access to the target**, so attaching can't be used to probe for a hidden perspective.
- A response's audience is **at most its own setting intersected with its target's audience**. A response can never be visible to more people than its target.
- Visibility is **evaluated at read time** against the target's current audience. Nothing cascades when access shrinks, so revocation is immediate and no data is destroyed. Deleting the target follows the existing delete behaviour.
- The **author always sees their own response**. If the target is hidden from them, the response shows a placeholder ("no longer available"), and the author keeps edit and delete. They never see the target's content again.
- Responses aggregate **only on their direct target**. There is **no rollup** to the underlying content item. A rollup would need its own design, with the double-counting audit (`AggregateByContentIDs`, `FeelingStats`, `CustomFieldStats`, `Compare.svelte`, onboarding counts) as a prerequisite.

### 9. Presentation

Left to a UX spec. The ADR flags that users with split perspectives will want to **sync** the two, **contrast** them, or see a **combined view with differing-visibility indicators**, and that the Compare page is the natural place to explore this. Whatever the design, a private row must not reveal *why* a viewer can see it (sharelist versus rule), because that would leak the owner's rule.

## Threats the model is designed against

Each is a named test target for the implementing work.

1. **Aggregate leakage of private values**: anonymity and a minimum count (section 6).
2. **Criteria probing**: matching uses public data by default; the owner never sees who matched.
3. **Existence leaks**: an unreadable row returns `null`, never `FORBIDDEN` (existing rule).
4. **A response exposing its target**: read-access requirement and audience intersection (section 8).
5. **Stale client caches after a revoke**: TanStack query keys must include the viewer, and a revoke must evict.
6. **Sharelist enumeration**: an owner can't discover who exists or who matches beyond the users they named.
7. **Aggregate score-pumping**: one vote per user per subject, and no self-response weight (section 7).

**Accepted risk:** scraping of public perspectives is not mitigated. Public means public.

## Consequences

- The multiple-perspectives slot model can be built on this decision. The partial unique index becomes `(user, subject, privacy)`, with the subject extended to cover perspectives.
- **Migration precondition:** today's `privacy` column maps one-to-one onto the future rows, but nothing today limits a user to one perspective per item. A **dedupe step must precede the unique index**. The strategy is left to the spec.
- A perspective's subject becoming polymorphic needs a schema design (for example two nullable foreign keys with a `CHECK` that exactly one is set). That is a spec decision.
- Access-check performance is **a concern, not a constraint** here. The implementing spec should size it, especially the recompute cost of live criteria rules.
- Sharing task lists, public activity browsing and share links can reuse sharelists and the audience rules, but each needs its own spec.
- The rule language, tiebreak policy options, the owner-visible match count, notifications to sharelist recipients and the presentation details are all open for their own specs.

## Revisit when

- A feature needs a visibility level that the private-row settings can't express (for example a link-only "unlisted" state). That would supersede this ADR and re-open the Gate 1 reasoning.
- The double-counting audit is done and rollup from responses to content aggregates is wanted.
- Access-check performance measurements show the live criteria model is too costly.
