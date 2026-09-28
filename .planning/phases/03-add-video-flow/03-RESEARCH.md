# Phase 3: Add Video Flow - Research

**Researched:** 2026-02-07
**Domain:** Svelte 5 form handling, TanStack Query mutations, shadcn-svelte dialogs
**Confidence:** HIGH

## Summary

Phase 3 implements a user flow for adding YouTube videos via URL submission. The backend mutation (`createContentFromYouTube`) already exists and handles URL validation, metadata fetching, and duplicate detection. The frontend needs: (1) a Dialog component triggered by the existing "Add Video" button, (2) a controlled form with YouTube URL input and validation, (3) a TanStack Query mutation to submit the URL, and (4) toast notifications for success/error/duplicate states.

The standard approach uses shadcn-svelte Dialog with Svelte 5 `$state()` for form control, `createMutation` from TanStack Query with `onSuccess`/`onError` callbacks, and `svelte-sonner` toast (already configured). YouTube URL validation should use a battle-tested regex pattern or small parsing library rather than hand-rolling, since YouTube supports multiple URL formats (youtube.com, youtu.be, m.youtube.com, with/without www, embedded, shorts).

**Primary recommendation:** Use shadcn-svelte Dialog with controlled Svelte 5 state, TanStack Query `createMutation` with query invalidation on success, and battle-tested YouTube URL validation. All required libraries are already installed.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn-svelte Dialog | (installed) | Modal/dialog component | Official shadcn component library for Svelte, already used for Button |
| @tanstack/svelte-query | ^6.0.18 | Mutations + cache invalidation | Already configured with QueryClientProvider, official Svelte Query adapter |
| svelte-sonner | ^1.0.7 | Toast notifications | Already configured (top-right, 2s auto-dismiss) in +layout.svelte |
| Svelte 5 $state() | 5.48.2 | Form state management | Native reactivity rune, replaces older bind patterns |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| get-youtube-id | Latest | Extract video ID from URL | If YouTube URL parsing needed (alternative: regex pattern) |
| graphql-request | ^7.4.0 | GraphQL mutation execution | Already in use for queries via TanStack Query queryFn |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn-svelte Dialog | Custom modal | shadcn is already the design system, hand-rolling modal overlay/focus trap/a11y is complex |
| TanStack Query mutations | Manual fetch in onclick | Lose cache invalidation, loading states, error handling, optimistic updates |
| Regex for YouTube URL | get-youtube-id library | Regex is simpler for basic validation, library handles edge cases (shorts, timestamps) |

**Installation:**
```bash
# Dialog component (add to shadcn-svelte)
npx shadcn-svelte@latest add dialog

# Optional: YouTube URL parser (if needed beyond regex validation)
pnpm add get-youtube-id
```

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/lib/
├── components/
│   ├── shadcn/
│   │   ├── dialog/              # Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
│   │   ├── input/               # Input component (for URL field)
│   │   ├── label/               # Label component
│   │   └── index.ts             # Barrel export (alphabetized)
│   ├── Header.svelte            # Contains "Add Video" button trigger
│   └── AddVideoDialog.svelte    # NEW: Dialog with form, mutation, validation
├── queries/
│   └── content.ts               # Add CREATE_CONTENT_FROM_YOUTUBE mutation
└── utils/
    └── youtube.ts               # NEW: YouTube URL validation helper
```

### Pattern 1: Controlled Dialog with Open State
**What:** Dialog open/close state managed by parent component via Svelte 5 `$state()` rune
**When to use:** When button trigger and dialog content are in separate components (Header + AddVideoDialog)
**Example:**
```svelte
<!-- Header.svelte -->
<script lang="ts">
  import { Button } from '$lib/components/shadcn';
  import AddVideoDialog from './AddVideoDialog.svelte';

  let dialogOpen = $state(false);
</script>

<Button onclick={() => dialogOpen = true}>Add Video</Button>
<AddVideoDialog bind:open={dialogOpen} />
```

```svelte
<!-- AddVideoDialog.svelte -->
<script lang="ts">
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from '$lib/components/shadcn';

  let { open = $bindable(false) } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Add Video</Dialog.Title>
    </Dialog.Header>
    <!-- Form content -->
  </Dialog.Content>
</Dialog.Root>
```

### Pattern 2: TanStack Query Mutation with Cache Invalidation
**What:** Use `createMutation` with `onSuccess` callback to invalidate content queries
**When to use:** When mutation should refresh related query data (new video should appear in content list)
**Example:**
```typescript
// Source: TanStack Query v5 documentation
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlClient } from '$lib/queries/client';
import { CREATE_CONTENT_FROM_YOUTUBE } from '$lib/queries/content';
import { toast } from 'svelte-sonner';

const queryClient = useQueryClient();

const mutation = createMutation({
  mutationFn: (url: string) =>
    graphqlClient.request(CREATE_CONTENT_FROM_YOUTUBE, { input: { url } }),
  onSuccess: (data) => {
    toast.success(`Added: ${data.createContentFromYouTube.name}`);
    queryClient.invalidateQueries({ queryKey: ['content'] });
    // Close dialog after success
    open = false;
  },
  onError: (error) => {
    const message = error.message || 'Failed to add video';
    toast.error(message);
  }
});

function handleSubmit() {
  mutation.mutate(url);
}
```

### Pattern 3: Controlled Form Input with Validation
**What:** Use Svelte 5 `$state()` for form field, validate on blur or submit
**When to use:** Simple forms with 1-2 fields (complex multi-step use TanStack Form)
**Example:**
```svelte
<script lang="ts">
  import { validateYouTubeUrl } from '$lib/utils/youtube';

  let url = $state('');
  let error = $state('');

  function handleBlur() {
    error = validateYouTubeUrl(url) ? '' : 'Invalid YouTube URL';
  }

  function handleSubmit() {
    if (!validateYouTubeUrl(url)) {
      error = 'Please enter a valid YouTube URL';
      return;
    }
    mutation.mutate(url);
  }
</script>

<form onsubmit={handleSubmit}>
  <Label for="url">YouTube URL</Label>
  <Input
    id="url"
    bind:value={url}
    onblur={handleBlur}
    placeholder="https://www.youtube.com/watch?v=..."
  />
  {#if error}<span class="text-destructive text-sm">{error}</span>{/if}
</form>
```

### Anti-Patterns to Avoid
- **Manual fetch in onclick:** TanStack Query mutations provide loading states, error handling, retry logic, and cache integration
- **Uncontrolled form with FormData:** Works but loses real-time validation, loading states, and Svelte reactivity
- **Global dialog state:** Dialog open state should be local to the component using it, not in a global store
- **Inline validation regex in components:** Extract to utility function for testing and reuse
- **Not invalidating queries after mutation:** New content won't appear until page refresh

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YouTube URL parsing | Regex in component | `validateYouTubeUrl()` utility or get-youtube-id | YouTube has 10+ URL formats (youtu.be, m.youtube.com, /embed/, /shorts/, with timestamps/playlists), regex catastrophic backtracking risk |
| Dialog overlay + focus trap | Custom modal component | shadcn-svelte Dialog | Accessibility (ARIA roles, focus management, Esc to close), portal rendering, scroll lock |
| Mutation loading states | Manual isLoading flag | createMutation `$mutation.isPending` | TanStack Query tracks loading/error/success, retries, deduplication |
| Toast notification timing | setTimeout to dismiss | svelte-sonner auto-dismiss | Already configured globally, handles stacking, positioning, animations |
| Cache invalidation after mutation | Manual refetch | queryClient.invalidateQueries() | Invalidates all matching queries (list, detail), handles concurrent refetch |

**Key insight:** Form submission with server state management is complex. TanStack Query mutations handle loading states, error boundaries, optimistic updates, cache synchronization, and retry logic that are easy to get wrong when hand-rolled.

## Common Pitfalls

### Pitfall 1: Dialog Not Closing After Successful Mutation
**What goes wrong:** User submits form, mutation succeeds, toast shows, but dialog stays open with "success" message stuck in the form
**Why it happens:** Forgot to set `open = false` in mutation `onSuccess` callback
**How to avoid:** Always close dialog in `onSuccess` after showing success toast
**Warning signs:** Dialog still visible after successful submission, users have to manually close it

### Pitfall 2: Form State Not Resetting Between Opens
**What goes wrong:** User opens dialog, types invalid URL, closes dialog, reopens → old invalid URL still in input field
**Why it happens:** Dialog visibility and form state are separate concerns; hiding dialog doesn't reset `$state()` variables
**How to avoid:** Reset form state when dialog opens using `$effect()` watching `open` prop
**Warning signs:** Stale input values when reopening dialog

```svelte
<!-- Solution -->
<script>
  let url = $state('');
  let error = $state('');

  $effect(() => {
    if (open) {
      // Reset form when dialog opens
      url = '';
      error = '';
    }
  });
</script>
```

### Pitfall 3: GraphQL Error Messages Not User-Friendly
**What goes wrong:** Backend returns `"duplicate key value violates unique constraint"`, user sees technical error in toast
**Why it happens:** GraphQL-request throws with raw error message from backend, not extracted from GraphQL errors array
**How to avoid:** Parse GraphQL error extensions or map known error patterns to user-friendly messages
**Warning signs:** Toast shows database constraint errors, stack traces, or GraphQL operation names

```typescript
// Solution
onError: (error) => {
  const message = error.message;
  if (message.includes('duplicate') || message.includes('already exists')) {
    toast.error('This video has already been added');
  } else if (message.includes('invalid') || message.includes('not found')) {
    toast.error('Invalid YouTube URL or video not found');
  } else {
    toast.error('Failed to add video. Please try again.');
  }
}
```

### Pitfall 4: Mutation Fires Multiple Times on Double-Click
**What goes wrong:** User double-clicks submit button, mutation fires twice, duplicate content created (if backend doesn't prevent)
**Why it happens:** No disabled state on submit button during mutation
**How to avoid:** Disable submit button when `$mutation.isPending`
**Warning signs:** Multiple toasts appearing, multiple entries in network tab

```svelte
<!-- Solution -->
<Button type="submit" disabled={$mutation.isPending}>
  {$mutation.isPending ? 'Adding...' : 'Add Video'}
</Button>
```

### Pitfall 5: Catastrophic Backtracking in YouTube URL Regex
**What goes wrong:** Browser freezes when user pastes a long malformed URL (e.g., 1000 characters of random text)
**Why it happens:** Complex regex with nested quantifiers causes exponential backtracking
**How to avoid:** Use simple regex for basic validation, or library like `get-youtube-id`, or URL constructor first
**Warning signs:** Browser hangs on paste event with long strings

```typescript
// Solution: Simple validation without catastrophic backtracking
export function validateYouTubeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const validHosts = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'];
    return validHosts.includes(urlObj.hostname);
  } catch {
    return false;
  }
}
```

## Code Examples

Verified patterns from official sources and existing codebase:

### YouTube URL Validation Utility
```typescript
// src/lib/utils/youtube.ts
// Source: Community patterns verified with URL constructor approach

/**
 * Validates if a string is a YouTube URL.
 * Supports: youtube.com, youtu.be, m.youtube.com, with/without www
 */
export function validateYouTubeUrl(url: string): boolean {
  if (!url.trim()) return false;

  try {
    const urlObj = new URL(url);
    const validHosts = [
      'youtube.com',
      'www.youtube.com',
      'youtu.be',
      'm.youtube.com'
    ];

    if (!validHosts.includes(urlObj.hostname)) {
      return false;
    }

    // youtube.com must have /watch or /embed or /shorts
    if (urlObj.hostname.includes('youtube.com')) {
      return urlObj.pathname.includes('/watch') ||
             urlObj.pathname.includes('/embed') ||
             urlObj.pathname.includes('/shorts');
    }

    // youtu.be must have video ID in path
    if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.length > 1;
    }

    return true;
  } catch {
    return false;
  }
}
```

### GraphQL Mutation Definition
```typescript
// src/lib/queries/content.ts
// Add to existing file
import { gql } from 'graphql-request';

export const CREATE_CONTENT_FROM_YOUTUBE = gql`
  mutation CreateContentFromYouTube($input: CreateContentFromYouTubeInput!) {
    createContentFromYouTube(input: $input) {
      id
      name
      url
      contentType
      length
      lengthUnits
      viewCount
      likeCount
      commentCount
      createdAt
    }
  }
`;
```

### Complete AddVideoDialog Component
```svelte
<!-- src/lib/components/AddVideoDialog.svelte -->
<script lang="ts">
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { toast } from 'svelte-sonner';
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Button,
    Input,
    Label
  } from '$lib/components/shadcn';
  import { graphqlClient } from '$lib/queries/client';
  import { CREATE_CONTENT_FROM_YOUTUBE } from '$lib/queries/content';
  import { validateYouTubeUrl } from '$lib/utils/youtube';

  let { open = $bindable(false) } = $props();

  const queryClient = useQueryClient();

  let url = $state('');
  let error = $state('');

  const mutation = createMutation({
    mutationFn: (url: string) =>
      graphqlClient.request(CREATE_CONTENT_FROM_YOUTUBE, { input: { url } }),
    onSuccess: (data) => {
      toast.success(`Added: ${data.createContentFromYouTube.name}`);
      queryClient.invalidateQueries({ queryKey: ['content'] });
      open = false;
    },
    onError: (err) => {
      const message = err.message || '';
      if (message.includes('duplicate') || message.includes('already exists')) {
        toast.error('This video has already been added');
      } else if (message.includes('invalid') || message.includes('not found')) {
        toast.error('Invalid YouTube URL or video not found');
      } else {
        toast.error('Failed to add video. Please try again.');
      }
    }
  });

  // Reset form when dialog opens
  $effect(() => {
    if (open) {
      url = '';
      error = '';
    }
  });

  function handleSubmit(e: Event) {
    e.preventDefault();

    if (!validateYouTubeUrl(url)) {
      error = 'Please enter a valid YouTube URL';
      return;
    }

    error = '';
    mutation.mutate(url);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Add Video</Dialog.Title>
    </Dialog.Header>

    <form onsubmit={handleSubmit}>
      <div class="space-y-4 py-4">
        <div class="space-y-2">
          <Label for="url">YouTube URL</Label>
          <Input
            id="url"
            bind:value={url}
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={$mutation.isPending}
          />
          {#if error}
            <p class="text-sm text-destructive">{error}</p>
          {/if}
        </div>
      </div>

      <Dialog.Footer>
        <Button
          type="button"
          variant="outline"
          onclick={() => open = false}
          disabled={$mutation.isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={$mutation.isPending || !url.trim()}
        >
          {$mutation.isPending ? 'Adding...' : 'Add Video'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
```

### Updated Header Component
```svelte
<!-- src/lib/components/Header.svelte -->
<script lang="ts">
  import { Button } from '$lib/components/shadcn';
  import AddVideoDialog from './AddVideoDialog.svelte';

  let dialogOpen = $state(false);
</script>

<header class="h-16 border-b border-border bg-background sticky top-0 z-50">
  <div class="h-full px-4 md:px-6 lg:px-8 max-w-screen-xl mx-auto flex items-center justify-between">
    <a href="/" class="font-bold text-xl text-foreground hover:text-primary transition-colors">
      Perspectize
    </a>
    <div class="flex items-center gap-4">
      <Button onclick={() => dialogOpen = true}>Add Video</Button>
    </div>
  </div>
</header>

<AddVideoDialog bind:open={dialogOpen} />
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Svelte 4 `on:click` | Svelte 5 `onclick` | Svelte 5.0 (Oct 2024) | Event handlers are now properties, use normal JS syntax |
| `let count = 0; $: doubled = count * 2` | `let count = $state(0); let doubled = $derived(count * 2)` | Svelte 5.0 | Explicit reactivity with runes |
| `<slot />` | `{@render children()}` | Svelte 5.0 | Snippets replace slots for better TypeScript support |
| `bind:this` then `open()` method | `bind:open` state | shadcn-svelte (2024) | Controlled component pattern over imperative API |
| useMutation (React Query) | createMutation (Svelte Query) | TanStack Query v5 | Framework-specific function names, same API surface |

**Deprecated/outdated:**
- **Svelte 4 reactivity syntax:** `$:` for derivations is legacy, use `$derived()`
- **`on:` event directives:** Use property syntax `onclick`, `onsubmit`, `onblur`
- **SvelteKit form actions for client-side mutations:** Form actions are for server-side SSR flows; use TanStack Query mutations for client-side GraphQL
- **Apollo Client:** TanStack Query is the standard for GraphQL client-side state management in 2026

## Open Questions

Things that couldn't be fully resolved:

1. **Should we extract video ID client-side or rely on backend?**
   - What we know: Backend accepts full URL and extracts ID internally
   - What's unclear: Whether client-side extraction provides better UX (e.g., preview thumbnail before submission)
   - Recommendation: Start with full URL submission (simpler), add preview in Phase 4+ if needed

2. **Should Dialog be a shared component or co-located with Header?**
   - What we know: Only one dialog in v1 scope (Add Video)
   - What's unclear: If Phase 4/5 will introduce more dialogs (Add Perspective, Edit forms)
   - Recommendation: Keep AddVideoDialog as separate component in `lib/components/` for now, can refactor to shared dialog wrapper if pattern repeats

3. **How should duplicate detection errors be surfaced?**
   - What we know: Backend returns error if URL already exists
   - What's unclear: Whether to show existing video details or just generic message
   - Recommendation: Start with toast warning message, enhance in Phase 4+ with "View existing video" link if needed

## Sources

### Primary (HIGH confidence)
- Existing codebase: frontend/src/lib/components/Header.svelte, frontend/src/lib/queries/client.ts, frontend/src/routes/+layout.svelte (toast configuration verified)
- Existing backend schema: backend/schema.graphql (createContentFromYouTube mutation confirmed)
- Svelte 5 official docs: [$state](https://svelte.dev/docs/svelte/bind), [$bindable](https://svelte.dev/docs/svelte/$bindable), [event handlers](https://svelte.dev/docs/svelte/bind)

### Secondary (MEDIUM confidence)
- [shadcn-svelte Dialog documentation](https://www.shadcn-svelte.com/docs/components/dialog) - Component structure and usage patterns
- [TanStack Query mutations guide](https://tanstack.com/query/v5/docs/react/guides/invalidations-from-mutations) - Invalidation patterns (React docs, same API for Svelte)
- [YouTube URL validation patterns](https://regexr.com/3dj5t) - Community regex patterns for YouTube URLs
- [get-youtube-id npm package](https://www.npmjs.com/package/get-youtube-id) - Alternative library for URL parsing

### Tertiary (LOW confidence)
- WebSearch results for Svelte 5 form patterns (2026) - General guidance, not library-specific
- WebSearch results for YouTube URL regex - Multiple conflicting patterns, validation needed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and configured in the project
- Architecture: HIGH - Patterns follow existing codebase conventions (Header.svelte, queries/client.ts)
- Pitfalls: HIGH - Based on common TanStack Query and Svelte 5 mistakes documented in official guides

**Research date:** 2026-02-07
**Valid until:** 2026-03-09 (30 days - stable stack, Svelte 5 and TanStack Query are mature)
