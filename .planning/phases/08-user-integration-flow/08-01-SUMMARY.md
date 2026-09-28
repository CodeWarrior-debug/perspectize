---
phase: 08-user-integration-flow
plan: 01
subsystem: frontend, backend
tags: [graphql, svelte, formPopover, createUser, userSelector, mutation-hooks]

# Dependency graph
requires:
  - phase: 07.3
    provides: TanStack Query patterns, shared mutation hooks, query key factory

provides:
  - CreateUserInput.email optional in GraphQL schema
  - FormPopover shared component (used by AddVideoPopover and CreateUserPopover)
  - CreateUserPopover with username input and createUser mutation
  - useCreateUser mutation hook with cache invalidation and toast feedback
  - UserSelector with adjacent "+ New User" trigger and auto-select on creation
  - AddVideoPopover refactored to use FormPopover (no behavior change)

affects: [user creation flow, popover component reuse, future form popovers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - FormPopover shared component with snippet-based form slot for reusable popover forms
    - Adjacent trigger pattern for native select + custom interactive elements
    - Auto-select on creation via onUserCreated callback

key-files:
  created:
    - frontend/src/lib/components/FormPopover.svelte
    - frontend/src/lib/components/CreateUserPopover.svelte
    - frontend/src/lib/queries/hooks/useCreateUser.ts
    - frontend/tests/unit/hooks-useCreateUser.test.ts
    - frontend/tests/components/CreateUserPopover.test.ts
  modified:
    - backend/schema.graphql
    - backend/internal/adapters/graphql/generated/generated.go
    - backend/internal/adapters/graphql/resolvers/schema.resolvers.go
    - frontend/src/lib/components/AddVideoPopover.svelte
    - frontend/src/lib/components/UserSelector.svelte
    - frontend/src/lib/queries/users.ts
    - frontend/tests/unit/queries-users.test.ts
    - frontend/tests/components/UserSelector.test.ts
    - frontend/tests/components/AddVideoPopover.test.ts

key-decisions:
  - "CreateUserInput.email is String (optional), not String! — most users won't have email at creation"
  - "FormPopover uses Svelte 5 snippet slots for form content injection"
  - "Adjacent button trigger for '+ New User' (not inside native <select> — can't nest interactive elements)"
  - "Auto-select new user via onUserCreated callback with setSelectedUserId"

patterns-established:
  - "FormPopover: shared popover shell with trigger, title, description, cancel/submit, form snippet slot"
  - "useCreateUser hook pattern mirrors useAddVideo (consistent mutation hook API)"
  - "Query cache invalidation on entity creation: queryKeys.users.list()"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 08 Plan 01: User Integration Flow

**Backend email optional, FormPopover shared component, CreateUserPopover, UserSelector wiring**

## Performance

- **Duration:** ~3 min
- **Completed:** 2026-02-15
- **Tasks:** 6
- **Files created:** 5
- **Files modified:** 9

## Accomplishments

- Backend: CreateUserInput.email changed from String! to String, resolver handles nil email
- FormPopover shared component extracts popover boilerplate (trigger, content layout, cancel/submit)
- CreateUserPopover with single username input and useCreateUser mutation hook
- UserSelector shows adjacent "+ New User" trigger that opens CreateUserPopover
- On successful creation, new user auto-selected and users.list cache invalidated
- AddVideoPopover refactored to use FormPopover with identical behavior
- Unit tests for useCreateUser hook, CreateUserPopover component, updated UserSelector and AddVideoPopover tests

## Task Commits

- `8d03d1a` feat(08-01): make email optional, add CREATE_USER mutation, FormPopover
- `1cde940` feat(08-01): AddVideoPopover refactor, CreateUserPopover, UserSelector wiring, tests

## Must-Haves Verification

1. CreateUserInput.email is optional (String, not String!) — verified in schema.graphql
2. FormPopover is shared by AddVideoPopover and CreateUserPopover — verified via imports
3. CreateUserPopover has username input and calls createUser mutation — verified
4. On success, users.list query cache invalidated — verified via queryKeys.users.list()
5. On success, new user auto-selected in UserSelector — verified via onUserCreated callback
6. UserSelector shows "+ New User" trigger — verified
7. AddVideoPopover refactored to use FormPopover — verified, no behavior change
8. Unit tests exist — verified (hooks, components, queries)
9. All tests pass and coverage thresholds met — verified

## Deviations from Plan

None significant. All 6 tasks executed as planned.

## Next Phase Readiness

- User creation flow complete and tested
- FormPopover available for future form popovers (e.g., Add Perspective)
- Ready for Phase 8.1 (API & Schema Quality)

---
*Phase: 08-user-integration-flow*
*Completed: 2026-02-15*
