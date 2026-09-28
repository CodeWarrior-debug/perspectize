---
phase: 02-data-layer-activity
plan: 01
subsystem: api, database, frontend
tags: [graphql, postgresql, sveltekit, tanstack-query, svelte-5, session-storage]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: GraphQL backend with User model and repository, SvelteKit frontend with TanStack Query setup
provides:
  - GraphQL users list query (backend → frontend)
  - Frontend query definitions for users and updated content with sort params
  - User selection store with session storage persistence
  - Unit tests for all new frontend data layer code
affects: [02-02-activity-page, user-selector-component]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Svelte 5 runes-based stores with manual session sync (setter-based, not $effect for testability)"
    - "GraphQL query parameter expansion pattern (sort, pagination, includeTotalCount)"
    - "Repository ListAll pattern for fetching all records without pagination"

key-files:
  created:
    - backend/internal/core/ports/repositories/user_repository.go (ListAll port)
    - backend/internal/adapters/repositories/postgres/user_repository.go (ListAll impl)
    - frontend/src/lib/queries/users.ts (LIST_USERS query)
    - frontend/src/lib/stores/userSelection.svelte.ts (session-persistent store)
    - frontend/tests/unit/queries-users.test.ts
    - frontend/tests/unit/stores-userSelection.test.ts
  modified:
    - backend/schema.graphql (added users query)
    - backend/internal/core/services/user_service.go (ListAll service method)
    - backend/internal/adapters/graphql/resolvers/schema.resolvers.go (Users resolver)
    - frontend/src/lib/queries/content.ts (added sort params, length fields)
    - frontend/tests/unit/queries-content.test.ts (added sort parameter tests)

key-decisions:
  - "Used setter-based session sync instead of $effect for Svelte 5 store testability"
  - "Simple ListAll repository method (no pagination) for small user dataset"
  - "Namespaced session storage key: perspectize:selectedUserId"
  - "Export both .value object and get/set functions for flexible store API"

patterns-established:
  - "GraphQL query parameter expansion: add optional params with defaults, pass through to backend"
  - "Test mocks must implement all repository interface methods (added ListAll to 3 mocks)"
  - "Svelte 5 runes in .svelte.ts module-level stores require careful $effect handling (avoid in tests)"

# Metrics
duration: 6min
completed: 2026-02-07
---

# Phase 2 Plan 01: Data Layer Foundation Summary

**GraphQL users list query with session-persistent user selection store using Svelte 5 runes**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-07T09:28:45Z
- **Completed:** 2026-02-07T09:34:48Z
- **Tasks:** 3
- **Files modified:** 16
- **Commits:** 3 task commits + 1 metadata commit

## Accomplishments
- Backend `users: [User!]!` GraphQL query fully implemented through hexagonal architecture
- Frontend LIST_USERS query and updated LIST_CONTENT query with sort/pagination parameters
- User selection store with session storage persistence using Svelte 5 runes
- All 78+ backend tests and 55 frontend tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add users list query to backend** - `4575b3d` (feat)
2. **Task 2: Frontend query definitions and user selection store** - `9e5de4f` (feat)
3. **Task 3: Unit tests for frontend data layer** - `c003722` (test)

## Files Created/Modified

### Backend
- `backend/schema.graphql` - Added `users: [User!]!` query
- `backend/internal/core/ports/repositories/user_repository.go` - Added ListAll port method
- `backend/internal/adapters/repositories/postgres/user_repository.go` - Implemented ListAll with ORDER BY username ASC
- `backend/internal/core/services/user_service.go` - Added ListAll service method
- `backend/internal/adapters/graphql/resolvers/schema.resolvers.go` - Implemented Users resolver
- `backend/internal/adapters/graphql/generated/generated.go` - Generated resolver interface
- `backend/test/resolvers/content_resolver_test.go` - Updated mock with ListAll
- `backend/test/services/user_service_test.go` - Updated mock with ListAll
- `backend/test/services/perspective_service_test.go` - Updated mock with ListAll

### Frontend
- `frontend/src/lib/queries/users.ts` - Created LIST_USERS query (id, username, email)
- `frontend/src/lib/queries/content.ts` - Updated with sortBy, sortOrder, includeTotalCount params; added length/lengthUnits fields
- `frontend/src/lib/stores/userSelection.svelte.ts` - Created session-persistent store with Svelte 5 runes
- `frontend/tests/unit/queries-users.test.ts` - Unit tests for LIST_USERS query
- `frontend/tests/unit/queries-content.test.ts` - Updated with sort parameter tests
- `frontend/tests/unit/stores-userSelection.test.ts` - Unit tests for user selection store

## Decisions Made

1. **Setter-based session sync instead of $effect** - Svelte 5 `$effect` runes cannot be used in module scope in test environments (Vitest throws `effect_orphan` error). Solution: Manual `syncToSession()` called in setters. Trade-off: Slightly more verbose but fully testable.

2. **Simple ListAll (no pagination)** - For the small user dataset in v1, implemented `users: [User!]!` without pagination. Simple alphabetical ORDER BY username. Can add pagination in v2 if user count grows.

3. **Namespaced storage key** - Used `perspectize:selectedUserId` instead of bare `selectedUserId` to avoid conflicts with other apps in same origin.

4. **Dual export API** - Store exports both `selectedUserId.value` (object with getter/setter) and `getSelectedUserId()`/`setSelectedUserId()` functions for flexible usage patterns.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated test mocks to implement ListAll method**
- **Found during:** Task 1 (Backend tests compilation)
- **Issue:** Added `ListAll` method to UserRepository interface but test mocks didn't implement it, causing compilation failure
- **Fix:** Added `ListAll` stub method to 3 mock user repositories: `mockUserRepository` (resolvers), `mockUserRepository` (services), and `mockUserRepoForPerspective`
- **Files modified:** `test/resolvers/content_resolver_test.go`, `test/services/user_service_test.go`, `test/services/perspective_service_test.go`
- **Verification:** All 78+ tests passing
- **Committed in:** 4575b3d (Task 1 commit)

**2. [Rule 1 - Bug] Changed Svelte 5 store pattern to avoid $effect in module scope**
- **Found during:** Task 3 (Frontend tests execution)
- **Issue:** Svelte 5 `$effect()` rune used in module scope caused `effect_orphan` error in Vitest - can only be used in component initialization
- **Fix:** Changed from `$effect()` auto-sync to manual `syncToSession()` called in setters
- **Files modified:** `frontend/src/lib/stores/userSelection.svelte.ts`
- **Verification:** All 55 frontend tests passing
- **Committed in:** c003722 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for test compilation and execution. Pattern change (setter-based sync) maintains same functionality while improving testability. No scope creep.

## Issues Encountered

**Svelte 5 runes limitations in test environments** - Initial implementation used `$effect()` for automatic session storage sync, which is the idiomatic Svelte 5 pattern for reactive side effects. However, Vitest runs module-level code outside component context, causing `effect_orphan` errors. Resolved by moving sync logic into setters, which works in both component and test contexts. This pattern is now documented for future Svelte 5 stores.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Plan 02-02 (Activity Page UI):**
- Backend `users` query available for dropdown population
- `LIST_CONTENT` query updated with sort parameters for AG Grid
- User selection store ready for component integration
- All data layer tests passing (backend: 78+, frontend: 55)

**No blockers identified.**

---
*Phase: 02-data-layer-activity*
*Completed: 2026-02-07*
