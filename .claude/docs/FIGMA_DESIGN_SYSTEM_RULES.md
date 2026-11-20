# Figma Design System Rules

Rules for translating Figma designs into Perspectize Svelte code via the Figma MCP server.

## Figma Files

| File | Key | Role |
|------|-----|------|
| Design 1 | `K1HaZLeNwCckWvhoyAfRhj` | Page designs, custom components |
| Radix 3.0 | `SyvrP9yYbrmCorofJK4Co8` | Design system foundation (variables, base components) |
| App 1 | `dAiiWM7FOsob5upzUjtocY` | Published Make-generated components |

## Required Figma-to-Code Flow

1. Run `get_design_context(fileKey, nodeId)` to fetch structured data for the target node(s)
2. If response is too large/truncated, run `get_metadata` first for the node map, then re-fetch specific children
3. Run `get_screenshot(fileKey, nodeId)` for visual reference
4. Download any assets from the Figma MCP assets endpoint
5. Translate output into Svelte 5 + Tailwind v4 using project conventions below
6. Validate against Figma screenshot for 1:1 visual parity

## Component Organization

- **shadcn primitives:** `frontend/src/lib/components/shadcn/{component}/` — Button, Input, Label, Dialog, Popover, Select
- **Feature components:** `frontend/src/lib/components/*.svelte` — Header, ActivityTable, AddVideoDialog, UserSelector, etc.
- **Page routes:** `frontend/src/routes/+page.svelte`
- **Barrel export:** `frontend/src/lib/components/shadcn/index.ts` — all shadcn components re-exported

IMPORTANT: Always check existing components before creating new ones. Import shadcn primitives from `#lib/components/shadcn`.

## Framework & Patterns

- **Framework:** SvelteKit with Svelte 5 runes (`$state`, `$derived`, `$props`, `$effect`)
- **Styling:** Tailwind v4 utility classes via `@theme` in `app.css`
- **Variant system:** `tailwind-variants` (`tv()`) for component variants (see Button pattern)
- **Class merging:** `cn()` from `#lib/utils.js` (clsx + tailwind-merge)
- **Props pattern:** `let { class: className, ...restProps }: Props = $props()` — all components accept `class` prop
- **Children:** `{@render children?.()}` (Svelte 5, NOT `<slot />`)

IMPORTANT: Treat Figma MCP output (React + Tailwind) as a design spec, NOT final code. Always translate to Svelte 5 syntax.

## Design Tokens

All tokens defined in `frontend/src/app.css` under `@theme`. Tailwind v4 uses `--color-*` prefix.

IMPORTANT: Never hardcode colors. Always use Tailwind token classes.

### Color Tokens

| Figma Variable | CSS Token | Tailwind Class | Hex |
|---------------|-----------|----------------|-----|
| `primary` | `--color-primary` | `bg-primary` / `text-primary` | `#1a365d` |
| `primary-foreground` | `--color-primary-foreground` | `text-primary-foreground` | `#ffffff` |
| `background` | `--color-background` | `bg-background` | `#ffffff` |
| `foreground` | `--color-foreground` | `text-foreground` | `#171717` |
| `muted` | `--color-muted` | `bg-muted` | `#f5f5f5` |
| `muted-foreground` | `--color-muted-foreground` | `text-muted-foreground` | `#525252` |
| `secondary` | `--color-secondary` | `bg-secondary` | `#f5f5f5` |
| `secondary-foreground` | `--color-secondary-foreground` | `text-secondary-foreground` | `#525252` |
| `accent` | `--color-accent` | `bg-accent` | `#f7fafc` |
| `destructive` | `--color-destructive` | `bg-destructive` | `#dc2626` |
| `border` | `--color-border` | `border-border` | `#d4d4d4` |
| `input` | `--color-input` | `border-input` | `#d4d4d4` |
| `ring` | `--color-ring` | `ring-ring` | `#1a365d` |
| `positive` (rating) | `--color-rating-positive` | `text-rating-positive` | `#16a34a` |
| `negative` (rating) | `--color-rating-negative` | `text-rating-negative` | `#dc2626` |
| `neutral` (rating) | `--color-rating-neutral` | `text-rating-neutral` | `#ca8a04` |

### Typography

| Role | Font Family | Tailwind |
|------|-------------|----------|
| Headings, UI, buttons, nav | Geist (variable) | `font-sans` (default) |
| Body text, reviews, long-form | Charter | `font-serif` |

### Figma → Tailwind Spacing

Use Tailwind's default spacing scale. Map Figma pixel values: 4px → `1`, 8px → `2`, 12px → `3`, 16px → `4`, 24px → `6`, 32px → `8`.

## Icon System

Per-icon imports from `@lucide/svelte` for tree-shaking:

```svelte
<script lang="ts">
  import SearchIcon from '@lucide/svelte/icons/search';
</script>
<SearchIcon class="size-4" />
```

- Import path: `@lucide/svelte/icons/{kebab-case-name}`
- Default size in buttons: `size-4`
- IMPORTANT: DO NOT import new icon packages. Use Lucide icons or assets from the Figma payload.

## Asset Handling

- IMPORTANT: If the Figma MCP server returns a `localhost` source for an image or SVG, use that source directly
- IMPORTANT: DO NOT create placeholder images if a localhost source is provided
- Static assets go in `frontend/static/`
- Font files in `frontend/static/fonts/`

## Component Variant Pattern

Follow the `tailwind-variants` (`tv()`) pattern used by shadcn-svelte:

```svelte
<script lang="ts" module>
  import { tv, type VariantProps } from 'tailwind-variants';

  export const myVariants = tv({
    base: 'inline-flex items-center rounded-md text-sm font-medium',
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        outline: 'border border-border bg-background',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  });
</script>

<script lang="ts">
  let { class: className, variant, size, children, ...restProps } = $props();
</script>

<div class={cn(myVariants({ variant, size }), className)} {...restProps}>
  {@render children?.()}
</div>
```

## Responsive Design

- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
- Mobile-first approach: base styles are mobile, add `md:` / `lg:` for larger screens
- AG Grid uses custom 4-tier system: xs (<445px), sm (445-639px), md (640-899px), lg (900px+)

## Existing Component ↔ Figma Mapping

| Svelte Component | Figma Equivalent |
|-----------------|-----------------|
| `shadcn/button` | Button (variants: default, destructive, outline, secondary, ghost, link; sizes: default, sm, lg, icon) |
| `shadcn/input` | Input (text field with focus ring, placeholder styling) |
| `shadcn/label` | Label |
| `shadcn/dialog` | Dialog (overlay + content + header/footer composition) |
| `shadcn/popover` | Popover (trigger + content) |
| `shadcn/select` | Select (trigger + content + items) |
| `Header.svelte` | App header with logo, navigation |
| `ActivityTable.svelte` | AG Grid data table (main content area) |
| `AddVideoDialog.svelte` | Add video dialog form |
| `UserSelector.svelte` | User avatar/selector dropdown |
