---
phase: 01-foundation
plan: 01
subsystem: ui
tags: [sveltekit, svelte5, tailwindcss, shadcn-svelte, typescript, vite]

# Dependency graph
requires: []
provides:
  - SvelteKit 2 project with Svelte 5 (runes API) and TypeScript
  - Tailwind CSS v4 with @tailwindcss/vite plugin
  - shadcn-svelte design system with Button component
  - Custom navy primary color theme (#1a365d)
  - Inter variable font with preloading
  - Type-based folder organization structure
  - Static site generation (SSG) with adapter-static
affects: [02-data-layer, 03-perspectives-ui, 04-grid-integration]

# Tech tracking
tech-stack:
  added:
    - "@sveltejs/kit": "^2.50.1"
    - "svelte": "^5.48.2"
    - "tailwindcss": "4.1.18"
    - "@tailwindcss/vite": "4.1.18"
    - "shadcn-svelte": "1.1.1"
    - "vite": "6.4.1"
    - "clsx": "2.1.1"
    - "tailwind-merge": "3.4.0"
    - "tailwind-variants": "3.2.2"
  patterns:
    - Type-based organization (not feature-based)
    - Flat component structure in lib/components/
    - shadcn-svelte components in lib/components/ui/
    - Tailwind CSS v4 @theme in app.css
    - SSG with prerender = true in +layout.ts

key-files:
  created:
    - frontend/svelte.config.js (adapter-static configuration)
    - frontend/src/app.css (Tailwind imports and theme tokens)
    - frontend/src/routes/+layout.ts (SSG prerender config)
    - frontend/src/lib/utils.ts (cn utility and WithElementRef type)
    - frontend/src/lib/components/ui/button/ (shadcn Button component)
    - frontend/STRUCTURE.md (folder structure documentation)
    - frontend/static/fonts/Inter-Variable.woff2 (variable font)
  modified:
    - frontend/vite.config.ts (added Tailwind plugin)
    - frontend/src/app.html (font preload link)
    - frontend/src/routes/+layout.svelte (app.css import)

key-decisions:
  - "Downgraded Vite from 7.3.1 to 6.4.1 for Tailwind CSS v4 compatibility"
  - "Upgraded Tailwind CSS from 4.0.0 to 4.1.18 to fix build errors"
  - "Custom navy primary color: oklch(0.216 0.006 56.043) = #1a365d"
  - "Type-based organization over feature-based for flat structure"

patterns-established:
  - "Tailwind CSS v4 configuration via @theme in app.css, not tailwind.config.js"
  - "shadcn-svelte components installed via CLI to lib/components/ui/"
  - "cn() utility pattern for merging Tailwind classes"
  - "WithElementRef type for shadcn component props"

# Metrics
duration: 6min
completed: 2026-02-05
---

# Phase 01 Plan 01: SvelteKit Foundation Summary

**SvelteKit 2 with Svelte 5 runes, Tailwind CSS v4, shadcn-svelte, and custom navy theme configured for SSG**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-05T08:10:00Z
- **Completed:** 2026-02-05T08:16:20Z
- **Tasks:** 3
- **Files modified:** 33

## Accomplishments

- SvelteKit 2 project with Svelte 5 (runes API) and TypeScript initialized
- Tailwind CSS v4 with @tailwindcss/vite plugin configured with custom navy primary color
- shadcn-svelte design system integrated with Button component
- Inter variable font (344KB) loaded with preloading for performance
- Type-based folder organization documented with examples and conventions
- Static site generation (SSG) enabled with adapter-static and prerender
- Build succeeds without errors, generating production-ready static site

## Task Commits

Each task was committed atomically:

1. **Task 1: Initialize SvelteKit project with Tailwind and shadcn-svelte** - `a81629b` (feat)
2. **Task 2: Configure Inter font and create folder structure documentation** - `fb72039` (feat)
3. **Task 3: Verify theme and create test page** - `e36b142` (feat)

## Files Created/Modified

**Project Structure:**
- `frontend/package.json` - Dependencies (SvelteKit, Tailwind, shadcn-svelte)
- `frontend/svelte.config.js` - SvelteKit config with adapter-static
- `frontend/vite.config.ts` - Vite config with Tailwind plugin
- `frontend/tailwind.config.ts` - Tailwind CSS v4 config (content paths)
- `frontend/components.json` - shadcn-svelte config

**Styling:**
- `frontend/src/app.css` - Tailwind imports, @font-face, @theme with navy primary
- `frontend/src/app.html` - HTML shell with font preload

**Components:**
- `frontend/src/lib/utils.ts` - cn() utility and WithElementRef type
- `frontend/src/lib/components/ui/button/` - shadcn Button component

**Routes:**
- `frontend/src/routes/+layout.ts` - SSG prerender config
- `frontend/src/routes/+layout.svelte` - Root layout (app.css import)
- `frontend/src/routes/+page.svelte` - Test page verifying theme

**Assets:**
- `frontend/static/fonts/Inter-Variable.woff2` - Inter variable font (344KB)

**Documentation:**
- `frontend/STRUCTURE.md` - Folder structure, naming conventions, tech stack (235 lines)

**Folder Structure:**
- `frontend/src/lib/components/` - Application components (flat)
- `frontend/src/lib/queries/` - TanStack Query definitions
- `frontend/src/lib/utils/` - Utility functions

## Decisions Made

**1. Downgraded Vite from 7.3.1 to 6.4.1**
- **Rationale:** @tailwindcss/vite 4.0.0 requires Vite ^5.2.0 || ^6, not Vite 7
- **Impact:** Build succeeds without errors

**2. Upgraded Tailwind CSS from 4.0.0 to 4.1.18**
- **Rationale:** v4.0.0 had "Cannot convert undefined or null to object" build error
- **Impact:** v4.1.18 fixed the build error, SSG output generated successfully

**3. Moved prerender export from +layout.svelte to +layout.ts**
- **Rationale:** SvelteKit best practice to keep page options in .ts files
- **Impact:** Eliminates warning, cleaner separation of concerns

**4. Added WithElementRef type to utils.ts**
- **Rationale:** shadcn Button component requires this type for ref/class/children props
- **Impact:** Type-checks pass, shadcn components work correctly

**5. Type-based organization pattern**
- **Rationale:** Small-to-medium app with shared components benefits from flat structure
- **Impact:** Cleaner imports, less nesting, documented in STRUCTURE.md

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added WithElementRef type to utils.ts**
- **Found during:** Task 1 (shadcn Button component installation)
- **Issue:** shadcn-svelte Button component imports `WithElementRef` from `$lib/utils.js`, but the type was not defined. Build failed with "Module has no exported member 'WithElementRef'" error.
- **Fix:** Added `WithElementRef` type definition to `src/lib/utils.ts`:
  ```typescript
  export type WithElementRef<T> = T & {
    ref?: any;
    class?: string;
    children?: any;
  };
  ```
- **Files modified:** `frontend/src/lib/utils.ts`
- **Verification:** `pnpm run check` passes with 0 errors
- **Committed in:** `a81629b` (Task 1 commit)

**2. [Rule 3 - Blocking] Upgraded Tailwind CSS v4 to fix build error**
- **Found during:** Task 3 (first build attempt)
- **Issue:** Build failed with "[@tailwindcss/vite:generate:build] Cannot convert undefined or null to object" error using Tailwind CSS v4.0.0
- **Fix:** Upgraded to latest Tailwind CSS v4.1.18: `pnpm add -D tailwindcss@latest @tailwindcss/vite@latest`
- **Files modified:** `frontend/package.json`, `frontend/pnpm-lock.yaml`
- **Verification:** `pnpm run build` succeeds, static site generated in `build/`
- **Committed in:** `e36b142` (Task 3 commit)

**3. [Rule 3 - Blocking] Downgraded Vite from 7.3.1 to 6.4.1**
- **Found during:** Task 3 (attempting to fix Tailwind build error)
- **Issue:** @tailwindcss/vite 4.0.0 has peer dependency requiring Vite ^5.2.0 || ^6, but project was initialized with Vite 7.3.1
- **Fix:** Downgraded Vite: `pnpm add -D vite@^6.0.0`
- **Files modified:** `frontend/package.json`, `frontend/pnpm-lock.yaml`
- **Verification:** Build succeeds with Vite 6.4.1 + Tailwind CSS v4.1.18
- **Committed in:** `e36b142` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 missing critical type, 2 blocking dependency issues)
**Impact on plan:** All auto-fixes necessary for build to succeed. No scope creep - only essential type definitions and version corrections.

## Issues Encountered

**1. Vite 7 incompatibility with Tailwind CSS v4**
- **Problem:** SvelteKit initialized project with Vite 7.3.1, but @tailwindcss/vite requires Vite 5 or 6
- **Resolution:** Downgraded Vite to 6.4.1 (peer dependency satisfied)
- **Prevention:** Check @tailwindcss/vite peer dependencies before initializing SvelteKit project

**2. Tailwind CSS v4.0.0 build error**
- **Problem:** "Cannot convert undefined or null to object" error during build
- **Resolution:** Upgraded to Tailwind CSS v4.1.18 (bug fixed in later version)
- **Prevention:** Use latest stable version of newly released tools (v4 is still new)

**3. shadcn-svelte init requires clean working directory**
- **Problem:** `npx sv add tailwindcss` and `npx shadcn-svelte init` failed because `frontend/` was untracked
- **Resolution:** Manually installed Tailwind and created `components.json` config
- **Prevention:** Either commit before running `sv` commands, or use manual installation approach

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for next phase:**
- SvelteKit project building and running successfully
- Tailwind CSS v4 configured and applying styles
- shadcn-svelte Button component renders correctly with navy primary color
- Inter font loads and renders in browser
- Type-based folder structure documented for future components
- SSG (adapter-static) configured for production deployment

**No blockers.**

**For next phase (Data Layer):**
- TanStack Query will be installed for GraphQL data fetching
- TanStack Form will be added for perspective submission
- GraphQL client configuration will connect to backend backend

---
*Phase: 01-foundation*
*Completed: 2026-02-05*
