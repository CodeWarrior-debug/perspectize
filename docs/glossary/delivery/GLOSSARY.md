# Delivery

How work on Perspectize is specified, staged and shipped.

## Language

**Intent**:
The short statement of what a piece of work is for. One intent leads to many pull requests.
_Avoid_: Epic, ticket, story

**Spec**:
The design for an intent: the decisions, the data, the screens.
_Avoid_: Design doc, PRD

**Implementation plan**:
The task-by-task steps for building a spec.
_Avoid_: Plan (reserved for the Plan page)

**Spike**:
A short experiment to answer one question before committing to a design.

**ADR**:
A recorded decision, including a deliberate decision not to build, with the conditions for revisiting it.

**Deferred**:
Decided not to build now, recorded in an ADR with "revisit when" conditions.

**Dark backend**:
The default way to ship a multi-PR feature unseen: the backend merges unused while the frontend waits on a feature branch.

**Role-gated release**:
Planned alternative: ship the feature visible only to some roles first.

**Migration rollout**:
Applying a migration to each environment by hand. Migrations are written and reviewed in a PR but never applied during development.

**Content-type designer**:
The tool that drafts a type's columns, tooltips and details before any code.

**Preview**:
The throwaway single-type page the designer produces for review.

**Demo tour**:
A scripted browser walk-through of the demo stack, recorded as evidence.

**Verification slot**:
The one machine-wide claim on the shared signed-in browser and dev-server ports.

**Legacy GSD**:
The older planning system; only used to finish phases already in flight.
