# Architecture Research: SvelteKit Frontend

**Project:** Perspectize Frontend
**Researched:** 2026-02-04
**Confidence:** HIGH (based on official documentation and established patterns)

## Executive Summary

This document defines the architecture for a SvelteKit frontend that integrates with the existing Go GraphQL backend. The architecture follows SvelteKit conventions with clear separation between routes, components, and data fetching layers. TanStack Query manages server state, while Svelte 5 runes handle local component state. shadcn-svelte provides the component foundation built on bits-ui headless primitives.

---

## Project Structure

### Recommended Folder Layout

```
perspectize-svelte/
├── src/
│   ├── routes/                      # SvelteKit file-based routing
│   │   ├── +layout.svelte           # Root layout (QueryClientProvider, nav)
│   │   ├── +layout.ts               # Root layout data/config
│   │   ├── +page.svelte             # Home/Discover page
│   │   ├── +page.ts                 # Home page load function
│   │   ├── videos/
│   │   │   ├── +page.svelte         # Video list (AG Grid table)
│   │   │   ├── add/
│   │   │   │   └── +page.svelte     # Add Video flow
│   │   │   └── [id]/
│   │   │       └── +page.svelte     # Video detail page
│   │   ├── perspectives/
│   │   │   ├── +page.svelte         # Perspectives list
│   │   │   └── add/
│   │   │       └── +page.svelte     # Add Perspective wizard
│   │   └── users/
│   │       └── +page.svelte         # User management
│   │
│   ├── lib/                         # Reusable code ($lib alias)
│   │   ├── components/              # Svelte components
│   │   │   ├── ui/                  # shadcn-svelte components (auto-installed)
│   │   │   │   ├── button/
│   │   │   │   ├── card/
│   │   │   │   ├── dialog/
│   │   │   │   ├── form/
│   │   │   │   ├── input/
│   │   │   │   ├── select/
│   │   │   │   └── ...
│   │   │   ├── data-table/          # AG Grid wrapper components
│   │   │   │   ├── DataTable.svelte
│   │   │   │   ├── columns.ts       # Column definitions
│   │   │   │   └── cell-renderers/  # Custom cell renderers
│   │   │   │       ├── ThumbnailCell.svelte
│   │   │   │       ├── ScoreBadge.svelte
│   │   │   │       └── DurationCell.svelte
│   │   │   ├── forms/               # Form components
│   │   │   │   ├── AddVideoForm.svelte
│   │   │   │   ├── PerspectiveWizard.svelte
│   │   │   │   └── steps/           # Wizard step components
│   │   │   │       ├── ClaimStep.svelte
│   │   │   │       ├── RatingsStep.svelte
│   │   │   │       └── ReviewStep.svelte
│   │   │   └── layout/              # Layout components
│   │   │       ├── Header.svelte
│   │   │       ├── Footer.svelte
│   │   │       ├── UserSelector.svelte
│   │   │       └── PageContainer.svelte
│   │   │
│   │   ├── graphql/                 # GraphQL layer
│   │   │   ├── client.ts            # graphql-request client setup
│   │   │   ├── operations/          # GraphQL operations
│   │   │   │   ├── content.ts       # Content queries/mutations
│   │   │   │   ├── perspectives.ts  # Perspective queries/mutations
│   │   │   │   └── users.ts         # User queries
│   │   │   └── generated/           # GraphQL codegen output
│   │   │       ├── types.ts         # TypeScript types from schema
│   │   │       └── operations.ts    # Typed document nodes
│   │   │
│   │   ├── queries/                 # TanStack Query hooks
│   │   │   ├── content.svelte.ts    # Content query hooks
│   │   │   ├── perspectives.svelte.ts
│   │   │   ├── users.svelte.ts
│   │   │   └── keys.ts              # Query key factory
│   │   │
│   │   ├── stores/                  # Global state (Svelte 5 runes)
│   │   │   ├── user.svelte.ts       # Selected user state
│   │   │   └── ui.svelte.ts         # UI state (sidebar, modals)
│   │   │
│   │   ├── utils/                   # Utility functions
│   │   │   ├── format.ts            # Formatting (dates, durations)
│   │   │   ├── youtube.ts           # YouTube URL utilities
│   │   │   └── ratings.ts           # Rating color/display helpers
│   │   │
│   │   └── types/                   # TypeScript types
│   │       ├── domain.ts            # Domain type aliases
│   │       └── forms.ts             # Form-specific types
│   │
│   ├── app.html                     # HTML template
│   ├── app.css                      # Global styles (Tailwind)
│   └── app.d.ts                     # TypeScript declarations
│
├── static/                          # Static assets
│   ├── .nojekyll                    # Disable Jekyll for GitHub Pages
│   └── favicon.ico
│
├── svelte.config.js                 # SvelteKit configuration
├── vite.config.ts                   # Vite configuration
├── tailwind.config.js               # Tailwind configuration
├── components.json                  # shadcn-svelte configuration
├── codegen.ts                       # GraphQL codegen configuration
├── tsconfig.json                    # TypeScript configuration
└── package.json
```

### Key Directory Purposes

| Directory | Purpose | Alias |
|-----------|---------|-------|
| `src/routes/` | File-based routing, pages, layouts | N/A |
| `src/lib/` | Reusable code (components, utils, queries) | `$lib` |
| `src/lib/components/ui/` | shadcn-svelte primitives | `$lib/components/ui` |
| `src/lib/graphql/` | GraphQL client and operations | `$lib/graphql` |
| `src/lib/queries/` | TanStack Query hooks | `$lib/queries` |
| `src/lib/stores/` | Global state (runes-based) | `$lib/stores` |
| `static/` | Static files served at root | N/A |

### Confidence: HIGH

Source: [SvelteKit Project Structure Documentation](https://svelte.dev/docs/kit/project-structure), [SvelteKit $lib alias](https://svelte.dev/docs/tutorial/kit/lib)

---

## Data Flow

### GraphQL to Component Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW DIAGRAM                              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────────┐
│   Go Backend    │     │   GraphQL       │     │    graphql-request      │
│   (Sevalla)     │────▶│   Endpoint      │────▶│    Client               │
│   :8080/graphql │     │                 │     │    ($lib/graphql)       │
└─────────────────┘     └─────────────────┘     └───────────┬─────────────┘
                                                            │
                                                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         TanStack Query Layer                             │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  QueryClient (in +layout.svelte)                                    │ │
│  │  ├── Caching (staleTime, cacheTime)                                │ │
│  │  ├── Background Refetching                                         │ │
│  │  └── Optimistic Updates                                            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Query Hooks ($lib/queries/*.svelte.ts)                                  │
│  ├── useContentList()     → createQuery() with content operations        │
│  ├── usePerspectives()    → createQuery() with perspective operations    │
│  ├── useUsers()           → createQuery() with user operations           │
│  └── useCreateContent()   → createMutation() for mutations               │
└───────────────────────────────────────────────────────┬─────────────────┘
                                                        │
                                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Component Layer                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │  Page Component  │  │  Page Component  │  │  Page Component  │      │
│  │  (Discover)      │  │  (Add Video)     │  │  (Perspectives)  │      │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘      │
│           │                     │                     │                  │
│           ▼                     ▼                     ▼                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Feature Components                                                │   │
│  │  ├── DataTable.svelte (AG Grid wrapper)                           │   │
│  │  ├── AddVideoForm.svelte (TanStack Form)                          │   │
│  │  └── PerspectiveWizard.svelte (multi-step TanStack Form)          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│           │                                                              │
│           ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  UI Components (shadcn-svelte)                                     │   │
│  │  ├── Button, Input, Card, Dialog, Select, etc.                    │   │
│  │  └── Built on bits-ui headless primitives                          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Query Hook Pattern

```typescript
// $lib/queries/content.svelte.ts
import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
import { request } from 'graphql-request';
import { GRAPHQL_ENDPOINT } from '$lib/graphql/client';
import { ContentListDocument, CreateContentDocument } from '$lib/graphql/generated/operations';
import { queryKeys } from './keys';

// Query for fetching content list
export function useContentList(params: ContentListParams) {
  return createQuery({
    queryKey: queryKeys.content.list(params),
    queryFn: () => request(GRAPHQL_ENDPOINT, ContentListDocument, params),
    staleTime: 30_000, // 30 seconds
  });
}

// Mutation for creating content from YouTube URL
export function useCreateContent() {
  const queryClient = useQueryClient();

  return createMutation({
    mutationFn: (url: string) =>
      request(GRAPHQL_ENDPOINT, CreateContentDocument, { url }),
    onSuccess: () => {
      // Invalidate content list queries to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.content.all });
    },
  });
}
```

### Component Usage Pattern

```svelte
<!-- src/routes/videos/+page.svelte -->
<script lang="ts">
  import { useContentList } from '$lib/queries/content.svelte';
  import DataTable from '$lib/components/data-table/DataTable.svelte';

  let params = $state({ first: 20 });

  // Query returns a Svelte store - use $query to access
  const query = useContentList(params);
</script>

{#if $query.isPending}
  <LoadingSpinner />
{:else if $query.isError}
  <ErrorMessage error={$query.error} />
{:else}
  <DataTable data={$query.data.contents.edges} />
{/if}
```

### Confidence: HIGH

Sources: [TanStack Query Svelte Overview](https://tanstack.com/query/v4/docs/framework/svelte/overview), [TanStack Query GraphQL Guide](https://tanstack.com/query/latest/docs/framework/react/graphql)

---

## Component Architecture

### Three-Layer Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 1: PAGE COMPONENTS (src/routes/**/+page.svelte)                   │
│ ────────────────────────────────────────────────────────────────────────│
│ • Orchestrate data fetching via TanStack Query hooks                    │
│ • Handle page-level state and URL params                                │
│ • Compose feature components                                            │
│ • Examples: Discover page, Add Video page, Perspectives page            │
└───────────────────────────────────────────────────────────────────────┬─┘
                                                                        │
                                                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 2: FEATURE COMPONENTS ($lib/components/*)                         │
│ ────────────────────────────────────────────────────────────────────────│
│ • Implement specific features/workflows                                 │
│ • Accept data as props, emit events for mutations                       │
│ • Use local $state for internal UI state                                │
│ • Examples: DataTable, PerspectiveWizard, AddVideoForm                  │
└───────────────────────────────────────────────────────────────────────┬─┘
                                                                        │
                                                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Layer 3: UI COMPONENTS ($lib/components/ui/*)                           │
│ ────────────────────────────────────────────────────────────────────────│
│ • shadcn-svelte primitives (Button, Input, Card, Dialog, etc.)          │
│ • Headless components from bits-ui with Tailwind styling                │
│ • Fully accessible, keyboard navigable                                  │
│ • Customized to match Figma design tokens                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### shadcn-svelte Component Organization

shadcn-svelte uses a "copy and paste" model - components are added to your codebase, not imported from a package. This enables full customization.

```
$lib/components/ui/
├── button/
│   ├── index.ts           # Exports
│   └── button.svelte      # Component implementation
├── card/
│   ├── index.ts
│   ├── card.svelte
│   ├── card-header.svelte
│   ├── card-title.svelte
│   ├── card-description.svelte
│   ├── card-content.svelte
│   └── card-footer.svelte
├── dialog/
│   ├── index.ts
│   ├── dialog.svelte
│   ├── dialog-trigger.svelte
│   ├── dialog-content.svelte
│   └── ...
└── ...
```

### Composable Pattern Example

```svelte
<!-- Feature component using shadcn-svelte UI components -->
<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';

  let dialogOpen = $state(false);
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Add Video</Card.Title>
    <Card.Description>Paste a YouTube URL to add a video</Card.Description>
  </Card.Header>
  <Card.Content>
    <Input placeholder="https://youtube.com/watch?v=..." />
  </Card.Content>
  <Card.Footer>
    <Button onclick={() => dialogOpen = true}>Add</Button>
  </Card.Footer>
</Card.Root>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Confirm</Dialog.Title>
    </Dialog.Header>
    <!-- ... -->
  </Dialog.Content>
</Dialog.Root>
```

### Confidence: HIGH

Sources: [shadcn-svelte Introduction](https://www.shadcn-svelte.com/docs), [bits-ui Headless Components](https://www.bits-ui.com/)

---

## State Management

### State Categories and Solutions

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      STATE MANAGEMENT STRATEGY                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ SERVER STATE (TanStack Query)                                            │
│ ────────────────────────────────────────────────────────────────────────│
│ • Content list, perspectives, users from GraphQL                         │
│ • Automatic caching, background refetching                               │
│ • Loading/error states                                                   │
│ • Mutations with cache invalidation                                      │
│                                                                          │
│ Pattern: createQuery() and createMutation() hooks                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ GLOBAL CLIENT STATE (Svelte 5 Runes in .svelte.ts files)                 │
│ ────────────────────────────────────────────────────────────────────────│
│ • Selected user (persists across pages)                                  │
│ • UI preferences (sidebar open, theme)                                   │
│ • Cart/selection state (if needed later)                                 │
│                                                                          │
│ Pattern: Export $state objects from .svelte.ts modules                   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ LOCAL COMPONENT STATE (Svelte 5 $state rune)                             │
│ ────────────────────────────────────────────────────────────────────────│
│ • Form inputs before submission                                          │
│ • UI toggles (modal open, accordion expanded)                            │
│ • Wizard step tracking                                                   │
│                                                                          │
│ Pattern: let value = $state(initialValue)                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### Global State Example (User Selection)

```typescript
// $lib/stores/user.svelte.ts
import type { User } from '$lib/graphql/generated/types';

// Reactive state that persists across the app
let selectedUser = $state<User | null>(null);

export const userStore = {
  get current() {
    return selectedUser;
  },
  select(user: User) {
    selectedUser = user;
    // Optionally persist to localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('selectedUserId', String(user.id));
    }
  },
  clear() {
    selectedUser = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('selectedUserId');
    }
  }
};
```

### Usage in Components

```svelte
<script lang="ts">
  import { userStore } from '$lib/stores/user.svelte';
  import { useUsers } from '$lib/queries/users.svelte';

  const users = useUsers();
</script>

<select onchange={(e) => {
  const user = $users.data?.users.find(u => u.id === +e.target.value);
  if (user) userStore.select(user);
}}>
  {#each $users.data?.users ?? [] as user}
    <option value={user.id} selected={userStore.current?.id === user.id}>
      {user.displayName}
    </option>
  {/each}
</select>
```

### Why Runes Over Stores

In Svelte 5, `$state` runes are the recommended approach for state management:

1. **Simpler mental model** - No need to understand writable/readable/derived store contracts
2. **Better TypeScript integration** - Direct type inference without store wrapper types
3. **Universal reactivity** - Works the same in .svelte and .svelte.ts files
4. **Fine-grained updates** - Proxy-based reactivity for objects

Stores are still available for complex async streams or compatibility with older libraries.

### Confidence: HIGH

Sources: [Svelte 5 Runes Documentation](https://svelte.dev/blog/runes), [Svelte Stores Documentation](https://svelte.dev/docs/svelte/stores), [Global State in Svelte 5](https://mainmatter.com/blog/2025/03/11/global-state-in-svelte-5/)

---

## Form Architecture

### TanStack Form for Multi-Step Wizards

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PERSPECTIVE WIZARD ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ PerspectiveWizard.svelte (Parent Form Controller)                        │
│ ────────────────────────────────────────────────────────────────────────│
│ • Creates form instance with createForm()                                │
│ • Manages wizard step navigation                                         │
│ • Handles form submission to GraphQL mutation                            │
│ • Provides form context to child steps                                   │
└───────────────────────────────────────────────────────────────────────┬─┘
                                                                        │
        ┌───────────────────────┬───────────────────┬───────────────────┤
        │                       │                   │                   │
        ▼                       ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌──────────────┐
│ Step 1:       │   │ Step 2:       │   │ Step 3:       │   │ Step 4:      │
│ Video Select  │   │ Claim Entry   │   │ Ratings       │   │ Review       │
│               │   │               │   │               │   │              │
│ • Search/pick │   │ • Claim text  │   │ • Quality     │   │ • Summary    │
│   video       │   │ • Agreement   │   │ • Accuracy    │   │ • Confirm    │
│ • Validate    │   │ • Simple or   │   │ • Engagement  │   │ • Submit     │
│   selection   │   │   detailed    │   │ • Categorized │   │              │
└───────────────┘   └───────────────┘   └───────────────┘   └──────────────┘
```

### TanStack Form Setup

```svelte
<!-- $lib/components/forms/PerspectiveWizard.svelte -->
<script lang="ts">
  import { createForm } from '@tanstack/svelte-form';
  import { useCreatePerspective } from '$lib/queries/perspectives.svelte';

  import VideoSelectStep from './steps/VideoSelectStep.svelte';
  import ClaimStep from './steps/ClaimStep.svelte';
  import RatingsStep from './steps/RatingsStep.svelte';
  import ReviewStep from './steps/ReviewStep.svelte';

  const createPerspective = useCreatePerspective();

  let currentStep = $state(0);
  const steps = ['video', 'claim', 'ratings', 'review'];

  const form = createForm({
    defaultValues: {
      contentId: null as number | null,
      claim: '',
      agreement: null as 'AGREE' | 'DISAGREE' | 'UNDECIDED' | null,
      quality: null as number | null,
      accuracy: null as number | null,
      engagement: null as number | null,
      reviewText: '',
    },
    onSubmit: async ({ value }) => {
      await $createPerspective.mutateAsync({
        input: {
          contentID: value.contentId!,
          userID: userStore.current!.id,
          claim: value.claim,
          agreement: value.agreement,
          quality: value.quality,
          accuracy: value.accuracy,
          engagement: value.engagement,
          reviewText: value.reviewText || undefined,
        }
      });
    },
  });

  function nextStep() {
    if (currentStep < steps.length - 1) {
      currentStep++;
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
    }
  }
</script>

<div class="wizard">
  <StepIndicator {steps} {currentStep} />

  {#if currentStep === 0}
    <form.Field name="contentId">
      {#snippet children(field)}
        <VideoSelectStep {field} onNext={nextStep} />
      {/snippet}
    </form.Field>
  {:else if currentStep === 1}
    <ClaimStep {form} onNext={nextStep} onBack={prevStep} />
  {:else if currentStep === 2}
    <RatingsStep {form} onNext={nextStep} onBack={prevStep} />
  {:else if currentStep === 3}
    <ReviewStep {form} onBack={prevStep} />
  {/if}
</div>
```

### Field Validation Pattern

```svelte
<!-- $lib/components/forms/steps/ClaimStep.svelte -->
<script lang="ts">
  import type { FormApi } from '@tanstack/svelte-form';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';

  let { form, onNext, onBack }: {
    form: FormApi<any>;
    onNext: () => void;
    onBack: () => void;
  } = $props();
</script>

<form.Field
  name="claim"
  validators={{
    onChange: ({ value }) => {
      if (!value) return 'Claim is required';
      if (value.length > 255) return 'Claim must be 255 characters or less';
      return undefined;
    },
  }}
>
  {#snippet children(field)}
    <div class="space-y-2">
      <label for="claim" class="text-sm font-medium">
        What's your perspective?
      </label>
      <Input
        id="claim"
        value={field.state.value}
        onblur={field.handleBlur}
        oninput={(e) => field.handleChange(e.target.value)}
        placeholder="Enter your claim about this video..."
      />
      {#if field.state.meta.errors.length > 0}
        <p class="text-sm text-destructive">
          {field.state.meta.errors[0]}
        </p>
      {/if}
    </div>
  {/snippet}
</form.Field>

<div class="flex justify-between mt-6">
  <Button variant="outline" onclick={onBack}>Back</Button>
  <Button onclick={onNext}>Continue</Button>
</div>
```

### Confidence: MEDIUM

Sources: [TanStack Form Svelte Docs](https://tanstack.com/form/v1/docs/framework/svelte/guides/basic-concepts), [TanStack Form Validation](https://tanstack.com/form/v1/docs/framework/svelte/guides/validation)

Note: TanStack Form Svelte integration is newer than React; patterns may evolve. Verify with official examples.

---

## GraphQL Integration

### Recommended Stack: graphql-request + TanStack Query

**Why graphql-request over urql:**

| Criteria | graphql-request | urql |
|----------|-----------------|------|
| Bundle size | ~5.2kB | ~10kB |
| Learning curve | Minimal | Moderate |
| Caching | None (use TanStack Query) | Built-in |
| Svelte integration | Works with any fetch | Requires context |
| Flexibility | Maximum | Framework patterns |

**Recommendation:** Use graphql-request as the transport layer with TanStack Query for caching. This gives you:
- Smaller bundle
- Simpler mental model
- TanStack Query's superior caching and devtools
- Framework-agnostic patterns

### GraphQL Codegen Setup

```typescript
// codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'http://localhost:8080/graphql', // Go backend
  documents: ['src/**/*.{ts,svelte}'],
  generates: {
    './src/lib/graphql/generated/': {
      preset: 'client',
      plugins: [],
      config: {
        useTypeImports: true,
      },
    },
  },
};

export default config;
```

### Client Setup

```typescript
// $lib/graphql/client.ts
import { GraphQLClient } from 'graphql-request';

// Environment-specific endpoint
export const GRAPHQL_ENDPOINT = import.meta.env.VITE_GRAPHQL_ENDPOINT
  ?? 'http://localhost:8080/graphql';

export const graphqlClient = new GraphQLClient(GRAPHQL_ENDPOINT, {
  headers: {
    // Add auth headers when needed
  },
});

// Helper for typed requests
export async function gqlRequest<T, V extends object>(
  document: string,
  variables?: V
): Promise<T> {
  return graphqlClient.request<T>(document, variables);
}
```

### Query Key Factory Pattern

```typescript
// $lib/queries/keys.ts
export const queryKeys = {
  content: {
    all: ['content'] as const,
    lists: () => [...queryKeys.content.all, 'list'] as const,
    list: (params: ContentListParams) =>
      [...queryKeys.content.lists(), params] as const,
    details: () => [...queryKeys.content.all, 'detail'] as const,
    detail: (id: number) =>
      [...queryKeys.content.details(), id] as const,
  },
  perspectives: {
    all: ['perspectives'] as const,
    lists: () => [...queryKeys.perspectives.all, 'list'] as const,
    list: (params: PerspectiveListParams) =>
      [...queryKeys.perspectives.lists(), params] as const,
  },
  users: {
    all: ['users'] as const,
    list: () => [...queryKeys.users.all, 'list'] as const,
  },
};
```

### Confidence: HIGH

Sources: [TanStack Query GraphQL Guide](https://tanstack.com/query/latest/docs/framework/react/graphql), [graphql-request GitHub](https://github.com/jasonkuhrt/graphql-request), [GraphQL Codegen Svelte Guide](https://the-guild.dev/graphql/codegen/docs/guides/svelte)

---

## AG Grid Integration

### Recommended Approach

AG Grid does not have official Svelte 5 support. Use the community `ag-grid-svelte5-extended` wrapper or vanilla JavaScript integration.

```typescript
// $lib/components/data-table/DataTable.svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { createGrid, type GridApi, type GridOptions } from 'ag-grid-community';
  import 'ag-grid-community/styles/ag-grid.css';
  import 'ag-grid-community/styles/ag-theme-alpine.css';

  let {
    rowData,
    columnDefs,
    onRowClicked
  }: {
    rowData: any[];
    columnDefs: any[];
    onRowClicked?: (data: any) => void;
  } = $props();

  let gridContainer: HTMLElement;
  let gridApi: GridApi;

  onMount(() => {
    const gridOptions: GridOptions = {
      columnDefs,
      rowData,
      pagination: true,
      paginationPageSize: 20,
      onRowClicked: (event) => onRowClicked?.(event.data),
      defaultColDef: {
        sortable: true,
        filter: true,
        resizable: true,
      },
    };

    gridApi = createGrid(gridContainer, gridOptions);

    return () => {
      gridApi?.destroy();
    };
  });

  // Update data when rowData changes
  $effect(() => {
    gridApi?.setGridOption('rowData', rowData);
  });
</script>

<div
  bind:this={gridContainer}
  class="ag-theme-alpine"
  style="height: 500px; width: 100%;"
></div>
```

### Column Definitions

```typescript
// $lib/components/data-table/columns.ts
import type { ColDef } from 'ag-grid-community';
import ThumbnailCell from './cell-renderers/ThumbnailCell.svelte';
import ScoreBadge from './cell-renderers/ScoreBadge.svelte';

export const videoColumnDefs: ColDef[] = [
  {
    field: 'thumbnailUrl',
    headerName: '',
    width: 120,
    cellRenderer: ThumbnailCell,
    sortable: false,
    filter: false,
  },
  {
    field: 'title',
    headerName: 'Title',
    flex: 2,
    filter: 'agTextColumnFilter',
  },
  {
    field: 'duration',
    headerName: 'Duration',
    width: 100,
    valueFormatter: ({ value }) => formatDuration(value),
  },
  {
    field: 'perspectiveCount',
    headerName: 'Perspectives',
    width: 120,
  },
  {
    field: 'avgQuality',
    headerName: 'Avg Quality',
    width: 120,
    cellRenderer: ScoreBadge,
  },
  {
    field: 'createdAt',
    headerName: 'Added',
    width: 120,
    valueFormatter: ({ value }) => formatDate(value),
    sort: 'desc',
  },
];
```

### Confidence: MEDIUM

Sources: [AG Grid Svelte 5 Extended](https://github.com/bn-l/ag-grid-svelte5-extended), [AG Grid JavaScript Integration](https://www.ag-grid.com/)

Note: AG Grid Svelte integration is community-maintained. May need fallback to vanilla JS if issues arise.

---

## Static Adapter Configuration

### SvelteKit Static Adapter for GitHub Pages

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: '404.html', // SPA fallback
      precompress: false,
      strict: true
    }),
    paths: {
      // If deploying to repo subdirectory: /repo-name
      // If deploying to custom domain or org.github.io: empty string
      base: process.env.BASE_PATH ?? ''
    },
    prerender: {
      handleHttpError: 'warn'
    }
  }
};

export default config;
```

### Layout Configuration for Static Export

```typescript
// src/routes/+layout.ts
export const prerender = true;
export const trailingSlash = 'always'; // Required for GitHub Pages
```

### Required Static Files

```
static/
├── .nojekyll          # Prevents GitHub Pages Jekyll processing
└── CNAME              # Custom domain (if applicable)
```

### Confidence: HIGH

Sources: [SvelteKit Static Adapter](https://svelte.dev/docs/kit/adapter-static), [SvelteKit GitHub Pages Guide](https://github.com/metonym/sveltekit-gh-pages)

---

## Build Order

### Recommended Implementation Sequence

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SUGGESTED BUILD ORDER                                 │
└─────────────────────────────────────────────────────────────────────────┘

PHASE 1: FOUNDATION (Week 1)
═══════════════════════════════════════════════════════════════════════════
 1. SvelteKit project scaffolding
    └── Create project with: npx sv create perspectize-svelte

 2. Core dependencies
    └── Install: tailwindcss, @tanstack/svelte-query, graphql-request

 3. shadcn-svelte initialization
    └── Run: npx shadcn-svelte@latest init
    └── Configure design tokens from Figma

 4. GraphQL client setup
    └── Configure graphql-request client
    └── Set up GraphQL codegen
    └── Generate types from backend schema

 5. TanStack Query setup
    └── Add QueryClientProvider to +layout.svelte
    └── Create query key factory

PHASE 2: CORE COMPONENTS (Week 2)
═══════════════════════════════════════════════════════════════════════════
 6. Add essential shadcn-svelte components
    └── npx shadcn-svelte@latest add button card input select dialog

 7. Layout components
    └── Header with navigation
    └── UserSelector dropdown
    └── PageContainer

 8. Global state
    └── User selection store (Svelte 5 runes)

PHASE 3: DATA TABLE (Week 2-3)
═══════════════════════════════════════════════════════════════════════════
 9. AG Grid integration
    └── DataTable wrapper component
    └── Column definitions for videos

10. Custom cell renderers
    └── ThumbnailCell
    └── ScoreBadge (color-coded ratings)
    └── DurationCell

11. Content queries
    └── useContentList hook
    └── Pagination integration

PHASE 4: ADD FLOWS (Week 3-4)
═══════════════════════════════════════════════════════════════════════════
12. Add Video form
    └── YouTube URL input
    └── useCreateContent mutation
    └── Success/error handling

13. TanStack Form setup
    └── Install @tanstack/svelte-form
    └── Create form patterns

14. Perspective wizard
    └── Multi-step form structure
    └── Step components
    └── Validation
    └── Submit mutation

PHASE 5: POLISH (Week 4)
═══════════════════════════════════════════════════════════════════════════
15. Static adapter configuration
    └── GitHub Pages deployment

16. Responsive design
    └── Mobile breakpoints
    └── Touch-friendly interactions

17. Error boundaries
    └── Query error handling
    └── Fallback UI
```

### Dependency Graph

```
                    ┌─────────────────┐
                    │ SvelteKit Init  │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
    ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
    │ Tailwind CSS  │ │ TanStack Query│ │ GraphQL Setup │
    └───────┬───────┘ └───────┬───────┘ └───────┬───────┘
            │                 │                 │
            ▼                 │                 │
    ┌───────────────┐         │                 │
    │ shadcn-svelte │         │                 │
    └───────┬───────┘         │                 │
            │                 │                 │
            └────────┬────────┴────────┬────────┘
                     ▼                 ▼
             ┌───────────────┐ ┌───────────────┐
             │ Layout/Header │ │ Query Hooks   │
             └───────┬───────┘ └───────┬───────┘
                     │                 │
                     └────────┬────────┘
                              ▼
                      ┌───────────────┐
                      │ Data Table    │
                      │ (AG Grid)     │
                      └───────┬───────┘
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
             ┌───────────────┐ ┌───────────────┐
             │ Add Video     │ │ TanStack Form │
             │ Form          │ └───────┬───────┘
             └───────────────┘         │
                                       ▼
                              ┌───────────────┐
                              │ Perspective   │
                              │ Wizard        │
                              └───────────────┘
```

---

## Summary and Recommendations

### Architecture Principles

1. **Separation of Concerns**
   - Routes handle page orchestration and URL state
   - `$lib/queries/` handles all GraphQL data fetching
   - `$lib/stores/` handles global client state
   - Components are pure UI with props and events

2. **Type Safety Throughout**
   - GraphQL codegen generates types from backend schema
   - TanStack Query provides typed query results
   - TanStack Form provides typed form values

3. **Performance by Default**
   - TanStack Query caching reduces network requests
   - Svelte 5 runes provide fine-grained reactivity
   - Static adapter enables CDN edge caching

### Key Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| GraphQL client | graphql-request | Minimal, works with TanStack Query |
| Server state | TanStack Query | Best-in-class caching and DX |
| Local state | Svelte 5 $state | Native, simple, performant |
| Form library | TanStack Form | Multi-step wizard support |
| Data grid | AG Grid | Feature-rich, handles complex tables |
| UI components | shadcn-svelte | Matches Figma design system |
| Deployment | Static adapter | Free GitHub Pages hosting |

### Potential Risks

| Risk | Mitigation |
|------|------------|
| AG Grid Svelte 5 compatibility | Have vanilla JS fallback ready |
| TanStack Form Svelte maturity | Start simple, escalate to custom if needed |
| Static adapter limitations | All data via client-side GraphQL (no SSR) |
| GraphQL codegen sync | Add to CI, watch mode in dev |

---

## Sources

- [SvelteKit Project Structure Documentation](https://svelte.dev/docs/kit/project-structure)
- [TanStack Query Svelte Overview](https://tanstack.com/query/v4/docs/framework/svelte/overview)
- [shadcn-svelte Introduction](https://www.shadcn-svelte.com/docs)
- [bits-ui Headless Components](https://www.bits-ui.com/)
- [TanStack Form Svelte Docs](https://tanstack.com/form/v1/docs/framework/svelte/guides/basic-concepts)
- [Svelte 5 Runes Documentation](https://svelte.dev/blog/runes)
- [SvelteKit Static Adapter](https://svelte.dev/docs/kit/adapter-static)
- [GraphQL Codegen Svelte Guide](https://the-guild.dev/graphql/codegen/docs/guides/svelte)
- [AG Grid Svelte 5 Extended](https://github.com/bn-l/ag-grid-svelte5-extended)
- [SvelteKit GitHub Pages Guide](https://github.com/metonym/sveltekit-gh-pages)
- [Global State in Svelte 5](https://mainmatter.com/blog/2025/03/11/global-state-in-svelte-5/)

---

*Architecture research completed: 2026-02-04*
