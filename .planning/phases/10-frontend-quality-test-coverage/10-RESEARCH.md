# Phase 10: Frontend Quality & Test Coverage - Research

**Researched:** 2026-02-16
**Domain:** Frontend testing, GraphQL code generation, error handling, Go testing patterns
**Confidence:** HIGH

## Summary

This phase addresses frontend quality gaps and backend test coverage identified in KNOWN_BUGS.md. The research covers three major domains: (1) GraphQL code generation to eliminate manual type duplication (H-23, M-18), (2) SvelteKit error boundaries and hooks for comprehensive error handling (H-17, H-18), and (3) Go testing patterns for untested backend components (T-01 through T-06).

**Key findings:**
- GraphQL Code Generator's `client-preset` with `typed-document-node` is the modern standard for TypeScript codegen, replacing legacy approaches
- SvelteKit provides `+error.svelte` and `hooks.client.ts`/`hooks.server.ts` for error boundaries, but with important limitations
- TanStack Query supports selective retry via custom retry functions (only 5xx/network errors)
- Go testify with table-driven tests and mock repositories is already the project's established pattern
- Frontend test coverage is 78.8% statements (target: 80%), primarily missing component error paths and tooltip utilities

**Primary recommendation:** Use GraphQL Code Generator `client-preset` + `@graphql-typed-document-node/core` with `graphql-request`, implement SvelteKit error boundaries with proper `handleError` hooks, add Go tests for PerspectiveService.Update() and repository-layer logic, and remove dead code with Knip.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@graphql-codegen/cli` | ^5.x | GraphQL code generation orchestrator | Industry standard for GraphQL → TypeScript type generation |
| `@graphql-codegen/client-preset` | ^4.x | Modern preset for client-side codegen | Replaces 7+ legacy plugins with single preset, generates typed-document-node |
| `@graphql-typed-document-node/core` | ^3.x | Type-safe GraphQL documents | Integrates with graphql-request for full type safety without manual types |
| `graphql-request` | 7.4.0 | Minimal GraphQL client | Already in use, works seamlessly with typed-document-node |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@graphql-codegen/typescript` | ^4.x | Base TypeScript types | Auto-included in client-preset |
| `@graphql-codegen/typed-document-node` | ^5.x | TypedDocumentNode generation | Auto-included in client-preset |
| `knip` | ^6.x | Dead code detection | Remove unused exports, dependencies (AGGridTest.svelte, unused stores) |
| `testify` (Go) | 1.9.0 | Assertion and mock library | Already in backend tests, proven pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `client-preset` | `gql.tada` | gql.tada uses TypeScript type system (no codegen), smaller ecosystem, less mature |
| `client-preset` | Individual plugins | Legacy approach, requires 7+ plugins vs 1 preset, more config complexity |
| `knip` | `ts-prune` | ts-prune can't detect unused dependencies or mutually recursive dead code |

**Installation:**
```bash
# Frontend
pnpm add -D @graphql-codegen/cli @graphql-codegen/client-preset knip

# Backend (testify already installed)
# No new dependencies needed
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── lib/
│   ├── graphql/              # NEW: GraphQL codegen output
│   │   ├── graphql.ts        # Generated: typed document nodes
│   │   ├── gql.ts            # Generated: gql tag function
│   │   └── fragment-masking.ts  # Generated: fragment utilities
│   ├── queries/
│   │   ├── client.ts         # ENHANCED: Add timeout, error interceptor
│   │   ├── content.ts        # REPLACE: Use generated types from graphql/
│   │   └── users.ts          # REPLACE: Use generated types from graphql/
│   └── components/
├── routes/
│   ├── +error.svelte         # NEW: Root error boundary
│   ├── activity/
│   │   └── +error.svelte     # NEW: Activity-specific error boundary (if needed)
└── hooks.client.ts           # NEW: Client-side error handler
└── hooks.server.ts           # NEW: Server-side error handler (future SSR)

backend/test/
├── services/
│   └── perspective_service_test.go  # NEW: Test Update() method
├── repositories/
│   ├── content_repository_test.go   # NEW: Cursor encoding, SQL construction
│   └── perspective_repository_test.go  # NEW: Pagination, sorting
└── youtube/
    └── client_test.go        # ENHANCE: Refactor Client for testability
```

### Pattern 1: GraphQL Code Generation with client-preset
**What:** Generate TypeScript types and typed document nodes from GraphQL schema
**When to use:** All GraphQL queries/mutations in the frontend

**Configuration:**
```typescript
// codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'http://localhost:8080/graphql', // Or path to schema.graphql
  documents: ['src/lib/queries/**/*.ts'],
  ignoreNoDocuments: true,
  generates: {
    './src/lib/graphql/': {
      preset: 'client',
      config: {
        useTypeImports: true
      },
      plugins: []
    }
  }
};

export default config;
```

**Usage:**
```typescript
// Before (manual types)
export interface ContentItem {
  id: string;
  name: string;
  // ... 15 more fields duplicated from schema
}

export const LIST_CONTENT = gql`
  query ListContent($first: Int) {
    content(first: $first) { items { id name } }
  }
`;

// After (codegen)
import { graphql } from '$lib/graphql';

export const LIST_CONTENT = graphql(`
  query ListContent($first: Int) {
    content(first: $first) { items { id name } }
  }
`);

// Type is inferred automatically from schema + query:
// ResultOf<typeof LIST_CONTENT> gives { content: { items: { id: string; name: string }[] } }
```

**Source:** [GraphQL Code Generator Client Preset](https://the-guild.dev/graphql/codegen/plugins/presets/preset-client)

### Pattern 2: SvelteKit Error Boundaries
**What:** Catch errors during rendering/navigation and display custom error UI
**When to use:** All routes that could fail (data loading errors, network errors)

**+error.svelte:**
```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  // $page.error contains { message: string, code?: number }
  const error = $page.error;

  function retry() {
    goto($page.url.pathname, { replaceState: true, invalidateAll: true });
  }
</script>

<div class="error-boundary">
  <h1>Something went wrong</h1>
  <p>{error?.message || 'An unexpected error occurred'}</p>
  <button onclick={retry}>Try Again</button>
</div>
```

**hooks.client.ts:**
```typescript
// src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';
import { toast } from 'svelte-sonner';

export const handleError: HandleClientError = ({ error, event, status, message }) => {
  // Log to monitoring service (e.g., Sentry)
  console.error('Client error:', { error, event, status });

  // Show user-friendly toast for network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    toast.error('Network error. Please check your connection.');
  }

  return {
    message: 'An unexpected error occurred',
    code: status || 500
  };
};
```

**Important limitation:** SvelteKit's `handleError` in `hooks.client.ts` **only runs for errors in `+page.ts` or `+page.server.ts` load functions**, NOT for errors inside components. Component errors require `+error.svelte` boundaries.

**Source:** [SvelteKit Errors Documentation](https://svelte.dev/docs/kit/errors), [SvelteKit Hooks Documentation](https://svelte.dev/docs/kit/hooks)

### Pattern 3: GraphQL Client Enhancement (Timeout, Error Interceptor)
**What:** Add timeout, custom error handling, and auth header support to graphql-request client
**When to use:** Configure once in client.ts, applies to all requests

**Enhanced client.ts:**
```typescript
import { GraphQLClient } from 'graphql-request';

const GRAPHQL_ENDPOINT = import.meta.env.VITE_GRAPHQL_URL || 'https://localhost:8080/graphql';
const REQUEST_TIMEOUT = 10000; // 10 seconds

// Create AbortController for timeout
function createAbortController() {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  return controller;
}

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT, {
  headers: {
    // Future: Add auth header
    // 'Authorization': `Bearer ${getToken()}`
  },
  fetch: (url, options) => {
    const controller = createAbortController();
    return fetch(url, {
      ...options,
      signal: controller.signal
    }).then(async (response) => {
      // Error interceptor: check for non-2xx responses
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`GraphQL request failed: ${response.status} ${text}`);
      }
      return response;
    });
  }
});
```

**Note:** `graphql-request` v7.x doesn't have built-in interceptor/timeout APIs. Custom `fetch` override is the recommended approach.

### Pattern 4: TanStack Query Selective Retry (5xx/Network Only)
**What:** Only retry on server errors (5xx) and network failures, not client errors (4xx)
**When to use:** Global QueryClient config or per-query options

**Global configuration:**
```typescript
// +layout.svelte
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry if max attempts reached
        if (failureCount >= 3) return false;

        // Retry network errors (fetch failures)
        if (error instanceof TypeError && error.message.includes('fetch')) {
          return true;
        }

        // Retry 5xx server errors
        if ('status' in error && typeof error.status === 'number') {
          return error.status >= 500 && error.status < 600;
        }

        // Don't retry 4xx client errors or unknown errors
        return false;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000) // Exponential backoff
    }
  }
});
```

**Source:** [TanStack Query Retry Documentation](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries), [React Query Error Handling Best Practices](https://tkdodo.eu/blog/react-query-error-handling)

### Pattern 5: Go Table-Driven Tests with Mock Repositories
**What:** Test services/resolvers with mock repository dependencies using testify
**When to use:** All service and resolver layer tests

**Example (PerspectiveService.Update):**
```go
func TestPerspectiveService_Update(t *testing.T) {
  tests := []struct {
    name      string
    input     *domain.Perspective
    setupMock func(*mockPerspectiveRepository, *mockUserRepository)
    wantErr   error
  }{
    {
      name: "successful update",
      input: &domain.Perspective{ID: 1, UserID: 1, Quality: intPtr(5)},
      setupMock: func(pr *mockPerspectiveRepository, ur *mockUserRepository) {
        pr.getByIDFn = func(ctx context.Context, id int) (*domain.Perspective, error) {
          return &domain.Perspective{ID: 1, UserID: 1}, nil
        }
        pr.updateFn = func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
          return p, nil
        }
      },
      wantErr: nil,
    },
    {
      name: "not found error",
      input: &domain.Perspective{ID: 999},
      setupMock: func(pr *mockPerspectiveRepository, ur *mockUserRepository) {
        pr.getByIDFn = func(ctx context.Context, id int) (*domain.Perspective, error) {
          return nil, domain.ErrNotFound
        }
      },
      wantErr: domain.ErrNotFound,
    },
  }

  for _, tt := range tests {
    t.Run(tt.name, func(t *testing.T) {
      mockRepo := &mockPerspectiveRepository{}
      mockUserRepo := &mockUserRepository{}
      tt.setupMock(mockRepo, mockUserRepo)

      service := services.NewPerspectiveService(mockRepo, mockUserRepo)
      result, err := service.Update(context.Background(), tt.input)

      if tt.wantErr != nil {
        assert.ErrorIs(t, err, tt.wantErr)
      } else {
        require.NoError(t, err)
        assert.NotNil(t, result)
      }
    })
  }
}
```

**Source:** [Go Testing Excellence: Table-Driven Tests](https://dasroot.net/posts/2026/01/go-testing-excellence-table-driven-tests-mocking/), [testify GitHub](https://github.com/stretchr/testify)

### Anti-Patterns to Avoid
- **Manual type duplication:** Don't write interface definitions that mirror GraphQL schema — use codegen
- **Global error boundaries only:** +error.svelte at root doesn't catch component-level errors — need boundaries per route/feature
- **Retry all errors:** TanStack Query default `retry: 3` retries 4xx client errors — use selective retry function
- **Mock overuse in Go tests:** Don't mock everything — use real domain objects where possible, mock only external dependencies (DB, APIs)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GraphQL TypeScript types | Manual interfaces in each query file | `@graphql-codegen/client-preset` | Schema changes break in 5+ places without codegen; preset handles fragments, unions, interfaces |
| Dead code detection | Manual grep/search | `knip` | Detects unused exports, dependencies, config, AND mutually recursive dead code (ts-prune can't) |
| Error boundary boilerplate | Custom error catching in each component | SvelteKit `+error.svelte` | Framework-provided, handles navigation errors, integrates with load functions |
| GraphQL request timeout | setTimeout wrapper around fetch | Custom fetch in GraphQLClient | graphql-request doesn't expose timeout API, must override fetch |
| Go test mocks | Manual mock structs per test file | Shared mock in `test/mocks/` | Mock duplication across 4 test files (T-08 in KNOWN_BUGS.md) |

**Key insight:** GraphQL codegen eliminates an entire class of bugs (type drift between schema and client). The `client-preset` approach is now 2+ years mature and proven in production at scale.

## Common Pitfalls

### Pitfall 1: GraphQL Codegen Schema Staleness
**What goes wrong:** Generated types don't match backend schema after schema changes
**Why it happens:** Codegen runs manually, not automatically on every build
**How to avoid:** Add codegen to `package.json` scripts and run before build:
```json
{
  "scripts": {
    "codegen": "graphql-codegen --config codegen.ts",
    "prebuild": "pnpm run codegen",
    "dev": "pnpm run codegen && vite dev"
  }
}
```
**Warning signs:** TypeScript errors in query files, runtime errors about missing fields

### Pitfall 2: hooks.client.ts Doesn't Catch Component Errors
**What goes wrong:** Errors inside components (e.g., TanStack Query errors in `+page.svelte`) don't trigger `handleError`
**Why it happens:** SvelteKit `handleError` only runs for errors in **load functions** (`+page.ts`), not component rendering
**How to avoid:** Use `+error.svelte` boundaries for component-level errors, `handleError` only for load function errors
**Warning signs:** `handleError` never fires despite visible errors in browser console

### Pitfall 3: Retrying 4xx Client Errors
**What goes wrong:** TanStack Query retries validation errors (400, 422) that will never succeed
**Why it happens:** Default `retry: 3` retries all errors indiscriminately
**How to avoid:** Use custom retry function that checks error status/type:
```typescript
retry: (failureCount, error) => {
  if (failureCount >= 3) return false;
  // Only retry 5xx and network errors
  return error.status >= 500 || error instanceof TypeError;
}
```
**Warning signs:** Network tab shows 3 identical 400 responses, user waits 7+ seconds for validation error

### Pitfall 4: YouTube Client Hard-Coded Dependencies
**What goes wrong:** Can't unit test `GetVideoMetadata` because `baseURL` and `httpClient` are hard-coded
**Why it happens:** `youtube.Client` doesn't accept dependency injection in constructor
**How to avoid:** Refactor to `NewClientWithHTTPClient(apiKey, httpClient)` or mock at integration test level
**Warning signs:** All YouTube client tests are skipped (T-05 in KNOWN_BUGS.md shows 15+ skipped tests)

### Pitfall 5: HTTPS Endpoint Only in Production
**What goes wrong:** Development uses `http://localhost:8080`, production needs `https://`, hardcoding breaks one environment
**Why it happens:** Single `VITE_GRAPHQL_URL` env var must work for both environments
**How to avoid:**
```typescript
// Auto-upgrade HTTP to HTTPS in production
let endpoint = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8080/graphql';
if (import.meta.env.PROD && endpoint.startsWith('http://')) {
  endpoint = endpoint.replace('http://', 'https://');
  console.warn('Auto-upgraded GraphQL endpoint to HTTPS for production');
}
```
**Warning signs:** Mixed content errors in production, "blocked by CORS" in browser console

## Code Examples

Verified patterns from official sources:

### GraphQL Codegen Usage with graphql-request
```typescript
// Source: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client

// 1. Import generated graphql function
import { graphql } from '$lib/graphql';
import { graphqlClient } from '$lib/queries/client';

// 2. Define query with type inference
const LIST_CONTENT = graphql(`
  query ListContent($first: Int, $after: String) {
    content(first: $first, after: $after) {
      items {
        id
        name
        url
        contentType
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

// 3. Use with graphql-request (types inferred automatically)
const data = await graphqlClient.request(LIST_CONTENT, { first: 10 });
//    ^? { content: { items: { id: string; name: string; ... }[] } }

// 4. Extract type if needed
import type { ResultOf } from '$lib/graphql';
type ContentListResult = ResultOf<typeof LIST_CONTENT>;
```

### SvelteKit Error Boundary with Retry
```svelte
<!-- Source: https://svelte.dev/docs/kit/errors -->
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';

  async function handleRetry() {
    try {
      await invalidateAll(); // Re-run load functions
      await goto($page.url.pathname, { replaceState: true });
      toast.success('Reloaded successfully');
    } catch (e) {
      toast.error('Retry failed. Please try again.');
    }
  }
</script>

<div class="error-container">
  <h1>Something went wrong</h1>
  <p>{$page.error?.message || 'An unexpected error occurred'}</p>

  <div class="actions">
    <button onclick={handleRetry}>Try Again</button>
    <a href="/">Go Home</a>
  </div>
</div>

<style>
  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
  }
</style>
```

### TanStack Query Error-Specific Retry
```typescript
// Source: https://tanstack.com/query/latest/docs/framework/react/guides/query-retries

import { createQuery } from '@tanstack/svelte-query';
import { graphqlClient } from '$lib/queries/client';
import { LIST_CONTENT } from '$lib/queries/content';

const query = createQuery(() => ({
  queryKey: ['content'],
  queryFn: () => graphqlClient.request(LIST_CONTENT),
  retry: (failureCount, error) => {
    // Max 3 retries
    if (failureCount >= 3) return false;

    // Retry network errors (fetch failures)
    if (error instanceof TypeError) return true;

    // Retry 5xx server errors
    if (error.response?.status >= 500) return true;

    // Don't retry 4xx client errors
    return false;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
}));
```

### Go Mock Repository Pattern
```go
// Source: https://github.com/stretchr/testify (existing pattern in backend/test/resolvers/)

// Mock repository with function fields for flexible test setup
type mockPerspectiveRepository struct {
  createFn  func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error)
  getByIDFn func(ctx context.Context, id int) (*domain.Perspective, error)
  updateFn  func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error)
}

func (m *mockPerspectiveRepository) Update(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
  if m.updateFn != nil {
    return m.updateFn(ctx, p)
  }
  // Default behavior: return input unchanged
  return p, nil
}

// Usage in test
func TestPerspectiveService_Update_Success(t *testing.T) {
  mockRepo := &mockPerspectiveRepository{
    getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
      return &domain.Perspective{ID: 1, UserID: 1}, nil
    },
    updateFn: func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
      return p, nil
    },
  }

  service := services.NewPerspectiveService(mockRepo, &mockUserRepository{})
  result, err := service.Update(context.Background(), &domain.Perspective{ID: 1, Quality: intPtr(5)})

  assert.NoError(t, err)
  assert.NotNil(t, result)
  assert.Equal(t, 5, *result.Quality)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Multiple codegen plugins (7+) | `client-preset` single preset | 2023 | Simpler config, automatic typed-document-node, fragment masking |
| `gql` tagged template without types | `graphql()` with inferred types | 2023 | Full type safety without manual type imports |
| Global `retry: 3` on all errors | Selective retry function | 2024 | Faster failure for 4xx errors, exponential backoff for 5xx |
| ts-prune for dead code | Knip | 2024 | Also detects unused dependencies, config, mutually recursive code |
| SvelteKit error handling docs vague | `<svelte:boundary>` element added | Svelte 5 (2024) | Component-level error isolation without +error.svelte |

**Deprecated/outdated:**
- `@graphql-codegen/typescript-operations` — replaced by client-preset
- `@graphql-codegen/typescript-react-apollo` — replaced by client-preset + typed-document-node
- Global `onError` callback in QueryClient — use per-query `onError` or `handleError` hook

## Open Questions

Things that couldn't be fully resolved:

1. **YouTube Client Testability**
   - What we know: Current implementation hard-codes `baseURL` and `httpClient`, making unit tests impossible (15 tests skipped)
   - What's unclear: Should we refactor to `NewClientWithHTTPClient(apiKey, httpClient)` or accept integration-only tests?
   - Recommendation: Refactor for testability if time allows, otherwise document as "tested via integration tests in content_service_test.go"

2. **GraphQL Schema Location for Codegen**
   - What we know: Schema can be fetched from running server (`http://localhost:8080/graphql`) or from file (`backend/schema.graphql`)
   - What's unclear: Should codegen use introspection (requires running backend) or schema file (requires keeping file in sync)?
   - Recommendation: Use schema file path (`../backend/schema.graphql`) for codegen to avoid requiring running backend during CI builds

3. **Error Boundary Granularity**
   - What we know: Can add `+error.svelte` at root, per-route, or per-feature
   - What's unclear: How many error boundaries are optimal? (too few = poor UX, too many = maintenance burden)
   - Recommendation: Start with root `+error.svelte` only, add route-specific boundaries if different error handling needed

4. **Dead Code Removal Automation**
   - What we know: Knip can detect `AGGridTest.svelte`, unused stores, dead exports
   - What's unclear: Should Knip run in CI and fail builds on dead code, or just as a manual audit tool?
   - Recommendation: Run manually initially to establish baseline, add to CI after codebase is clean

## Sources

### Primary (HIGH confidence)
- [GraphQL Code Generator Client Preset](https://the-guild.dev/graphql/codegen/plugins/presets/preset-client) — Official docs for modern codegen approach
- [SvelteKit Errors Documentation](https://svelte.dev/docs/kit/errors) — Official SvelteKit error boundary docs
- [SvelteKit Hooks Documentation](https://svelte.dev/docs/kit/hooks) — Official handleError hook docs
- [TanStack Query Retry Documentation](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries) — Official retry configuration docs
- [testify GitHub](https://github.com/stretchr/testify) — Official testify library (already in use in backend)

### Secondary (MEDIUM confidence)
- [GraphQL Code Generator SvelteKit Guide](https://the-guild.dev/graphql/codegen/docs/guides/svelte) — Community guide for SvelteKit integration
- [TanStack Query Error Handling (tkdodo)](https://tkdodo.eu/blog/react-query-error-handling) — Community best practices (React, but patterns apply to Svelte)
- [Knip Documentation](https://knip.dev/) — Dead code detection tool docs
- [Go Testing Excellence 2026](https://dasroot.net/posts/2026/01/go-testing-excellence-table-driven-tests-mocking/) — Modern Go testing patterns

### Tertiary (LOW confidence)
- [gql.tada vs graphql-codegen comparison](https://blog.liontari.ai/cobalt-solving-graphql-better-than-gql-tada-trpc/) — Blog post comparing alternatives (biased toward author's solution)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — client-preset is documented official approach, testify already in use
- Architecture: HIGH — SvelteKit error boundaries are framework built-ins, Go patterns match existing codebase
- Pitfalls: MEDIUM — Some findings from community sources (tkdodo blog), not official docs

**Research date:** 2026-02-16
**Valid until:** 60 days (stable ecosystem, codegen/SvelteKit APIs unlikely to change rapidly)

**Test coverage status (as of research):**
- Frontend: 78.8% statements, 75.72% branches, 74.14% functions (target: 80%/75%/75%)
- Backend: Comprehensive domain/resolver tests, gaps in service layer (PerspectiveService.Update) and repository layer (cursor encoding, SQL construction)
- Skipped tests: 15 YouTube client tests require refactoring for dependency injection
