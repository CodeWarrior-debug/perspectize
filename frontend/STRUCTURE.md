# Perspectize Frontend Structure

## Overview

This is a SvelteKit 2 + Svelte 5 project with TypeScript, using Tailwind CSS v4 and shadcn-svelte components for a YouTube perspectives platform.

## Tech Stack

- **Framework:** SvelteKit 2 with Svelte 5 (runes API)
- **Language:** TypeScript 5.9+
- **Styling:** Tailwind CSS v4 + shadcn-svelte
- **Data Fetching:** TanStack Query v6
- **Forms:** TanStack Form
- **Grid:** AG Grid Community (Svelte wrapper)
- **Build:** Vite 7 with adapter-static (SSG)
- **Font:** Inter Variable
- **Package Manager:** pnpm

## Folder Structure

```
frontend/
├── src/
│   ├── routes/              # SvelteKit file-based routing
│   │   ├── +page.svelte     # Home page
│   │   ├── +layout.svelte   # Root layout (app.css import, prerender)
│   │   ├── +error.svelte    # Error boundary
│   │   └── perspectives/    # Perspectives routes
│   │       ├── +page.svelte # Browse perspectives
│   │       └── [id]/        # Perspective detail page
│   ├── lib/
│   │   ├── components/      # All application components (flat structure)
│   │   │   ├── ui/          # shadcn-svelte components (button, card, etc.)
│   │   │   ├── PerspectiveCard.svelte
│   │   │   ├── PerspectiveForm.svelte
│   │   │   └── PerspectiveGrid.svelte
│   │   ├── queries/         # TanStack Query query/mutation definitions
│   │   │   ├── perspectives.ts
│   │   │   └── content.ts
│   │   ├── utils/           # Utility functions
│   │   │   ├── validation.ts
│   │   │   └── formatters.ts
│   │   ├── types/           # TypeScript types and interfaces
│   │   │   ├── perspective.ts
│   │   │   └── content.ts
│   │   └── utils.ts         # shadcn cn() utility
│   ├── app.css              # Global styles, Tailwind imports, theme tokens
│   ├── app.html             # HTML shell (font preload)
│   └── app.d.ts             # TypeScript ambient declarations
├── static/
│   └── fonts/
│       └── Inter-Variable.woff2
├── svelte.config.js         # SvelteKit config (adapter-static)
├── vite.config.ts           # Vite config (Tailwind plugin)
├── tailwind.config.ts       # Tailwind CSS v4 config
├── components.json          # shadcn-svelte config
├── tsconfig.json            # TypeScript config
└── package.json             # Dependencies and scripts
```

## Organization Principles

### Type-Based Organization (Not Feature-Based)

We organize by **what things are**, not **what feature they belong to**:

- ✅ `src/lib/components/PerspectiveCard.svelte`
- ✅ `src/lib/queries/perspectives.ts`
- ❌ `src/lib/features/perspectives/components/PerspectiveCard.svelte`

**Rationale:** In a small-to-medium application with shared components across features, type-based organization reduces deep nesting and makes imports cleaner.

### Flat Component Structure

All application components live in `src/lib/components/` (flat, not nested by feature):

- `PerspectiveCard.svelte` - Displays a single perspective
- `PerspectiveForm.svelte` - Form for creating/editing perspectives
- `PerspectiveGrid.svelte` - AG Grid wrapper for perspectives table
- `ContentCard.svelte` - Displays content (YouTube video)
- `Layout/` (only if needed for complex layout components)

**Exception:** `src/lib/components/ui/` contains shadcn-svelte components (generated, not manually created).

### Route-Based Pages

Pages live in `src/routes/` following SvelteKit's file-based routing:

```
src/routes/
├── +page.svelte              # Home: /
├── +layout.svelte            # Root layout (wraps all pages)
├── perspectives/
│   ├── +page.svelte          # Browse: /perspectives
│   └── [id]/
│       └── +page.svelte      # Detail: /perspectives/123
```

## Naming Conventions

- **Components:** PascalCase (e.g., `PerspectiveCard.svelte`)
- **Utilities/Functions:** camelCase (e.g., `formatDate.ts`)
- **Types:** PascalCase (e.g., `Perspective`, `ContentType`)
- **Files:** Match export name (e.g., `PerspectiveCard.svelte` exports `PerspectiveCard`)

## Styling

### Tailwind CSS v4

Tailwind v4 uses `@theme` in CSS instead of a `tailwind.config.js` file. Configuration lives in `src/app.css`:

```css
@theme {
	--default-font-family: 'Inter', system-ui, -apple-system, sans-serif;
	--color-primary: oklch(0.216 0.006 56.043); /* Navy #1a365d */
	--color-primary-foreground: oklch(0.985 0.001 106.423);
}
```

### shadcn-svelte Components

shadcn-svelte components are in `src/lib/components/ui/`. These are generated via CLI:

```bash
pnpm dlx shadcn-svelte@latest add button
```

Import via `$lib/components/ui/button`:

```svelte
<script>
	import { Button } from '$lib/components/ui/button';
</script>

<Button variant="default">Primary Button</Button>
```

### Responsive Breakpoints

Tailwind CSS v4 default breakpoints:

| Breakpoint | Min Width | Target Devices               |
| ---------- | --------- | ---------------------------- |
| `sm`       | 640px     | Small tablets                |
| `md`       | 768px     | Tablets (portrait)           |
| `lg`       | 1024px    | Tablets (landscape), laptops |
| `xl`       | 1280px    | Desktop                      |
| `2xl`      | 1536px    | Large desktop                |

### Responsive Design Pattern

Mobile-first approach using Tailwind breakpoints:

- **Base (0px+):** px-4 padding, single column layouts, mobile-optimized
- **md (768px+):** px-6 padding, multi-column where appropriate
- **lg (1024px+):** px-8 padding, max-w-screen-xl centered content

**Layout Components:**

- `Header.svelte` - Fixed height (h-16) with responsive padding
- `PageWrapper.svelte` - Consistent page wrapper with responsive padding and max-width

**Test at:** 375px (iPhone SE), 768px (tablet), 1024px+ (desktop)

## Data Fetching (TanStack Query)

Query and mutation definitions live in `src/lib/queries/`:

```typescript
// src/lib/queries/perspectives.ts
import { createQuery, createMutation } from '@tanstack/svelte-query';

export function perspectiveQuery(id: number) {
	return createQuery(() => ({
		queryKey: ['perspective', id],
		queryFn: () => fetchPerspective(id),
	}));
}
```

**Important:** TanStack Query v6 requires **thunk syntax** (functions) for reactivity with Svelte 5 runes.

## Forms (TanStack Form)

Form logic lives in component files (not separate utilities):

```svelte
<script lang="ts">
	import { createForm } from '@tanstack/svelte-form';

	const form = createForm(() => ({
		defaultValues: {
			claim: '',
			quality: 50,
		},
		onSubmit: async ({ value }) => {
			// Submit logic
		},
	}));
</script>
```

## TypeScript Types

Shared types live in `src/lib/types/`:

```typescript
// src/lib/types/perspective.ts
export interface Perspective {
	id: number;
	claim: string;
	quality: number;
	agreement: number;
	privacy: Privacy;
}

export enum Privacy {
	PUBLIC = 'PUBLIC',
	PRIVATE = 'PRIVATE',
}
```

## Example File Purposes

| File                                        | Purpose                             |
| ------------------------------------------- | ----------------------------------- |
| `src/routes/+page.svelte`                   | Home: sends signed-in visitors to the Library |
| `src/routes/content-library/+page.svelte`   | Library page (content grid, search) |
| `src/routes/perspectives/+page.svelte`      | Browse perspectives (grid, filters) |
| `src/lib/components/PerspectiveCard.svelte` | Perspective display card            |
| `src/lib/components/PerspectiveForm.svelte` | Create/edit perspective form        |
| `src/lib/components/PerspectiveGrid.svelte` | AG Grid wrapper for perspectives    |
| `src/lib/queries/perspectives.ts`           | TanStack Query definitions          |
| `src/lib/utils/validation.ts`               | Validation utilities                |
| `src/lib/types/perspective.ts`              | TypeScript types                    |

## Scripts

```bash
pnpm run dev       # Start dev server (http://localhost:5173)
pnpm run build     # Build for production (SSG)
pnpm run preview   # Preview production build
pnpm run check     # Type-check with svelte-check
```

## Next Steps

1. Add TanStack Query and configure QueryClientProvider
2. Add TanStack Form for perspective submission
3. Install AG Grid Svelte wrapper and create PerspectiveGrid component
4. Connect to GraphQL API (backend backend)
