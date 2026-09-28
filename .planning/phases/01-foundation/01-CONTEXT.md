# Phase 1: Foundation - Context

**Gathered:** 2026-02-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish SvelteKit project scaffolding with all core libraries, mobile-first design system, and navigation working end-to-end. Includes AG Grid validation to derisk the community Svelte wrapper early. Data fetching and actual content display are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Project Structure
- Type-based folder organization: `pages/`, `layouts/`, `components/`, `utils/`, `queries/`
- Flat component organization within `/components/` — all components at top level
- Centralized `/queries/` folder for all GraphQL queries and mutations
- PascalCase component naming: `Button.svelte`, `DataTable.svelte`, `UserSelector.svelte`

### Navigation & Page Structure
- **Add Video is a modal dialog**, not a separate page — button on Activity page opens modal overlay
- Activity page is the single main page (default landing)
- Responsive breakpoints (sm/md/lg/xl) are negotiable — document if helpful, don't over-engineer

### Design Token Application
- Tokens as reference — use Figma tokens for key brand elements (colors, fonts), Tailwind defaults elsewhere
- shadcn defaults for CSS custom property naming (`--primary`, `--secondary`, `--background`, etc.)
- Dark mode ready — set up token structure for dark mode; custom color config already prepared
- Override shadcn primary with navy (#1a365d) — all primary buttons/accents become navy

### AG Grid Integration
- Full feature set validation required: sorting, filtering, pagination, column resize, row selection
- Custom shadcn-matched styling — AG Grid must look consistent with shadcn components
- Feature checklist validation approach — test each feature, document what works/fails before deciding

### Claude's Discretion
- Fallback plan if AG Grid Svelte wrapper (v0.0.15) doesn't work with Svelte 5 — evaluate vanilla JS wrapper vs TanStack Table vs fixing the wrapper
- Exact folder structure details beyond the top-level organization
- Specific Tailwind configuration choices

</decisions>

<specifics>
## Specific Ideas

- Custom color config for theming is already prepared — integrate rather than recreate
- Navy (#1a365d) is the primary brand color, should feel prominent in the UI
- AG Grid should blend seamlessly with shadcn components, not look like a separate library

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-05*
