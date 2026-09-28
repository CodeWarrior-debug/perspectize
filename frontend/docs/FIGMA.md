# Figma Reference

> Persistent reference for Claude to understand the Perspectize Figma setup.
> Updated as design system evolves.

---

## Files

### Perspectize Youtube - Design 1 (Primary)

The main design file where pages, layouts, and custom components are built.

| Field        | Value                                                 |
| ------------ | ----------------------------------------------------- |
| **File Key** | `K1HaZLeNwCckWvhoyAfRhj`                              |
| **URL**      | `https://www.figma.com/design/K1HaZLeNwCckWvhoyAfRhj` |
| **Role**     | Page designs, custom components, Figma Make output    |

**Pages:**

| Page            | Contents                                                                               | Key Node IDs               |
| --------------- | -------------------------------------------------------------------------------------- | -------------------------- |
| youtube initial | Main app layout — "Perspectize Youtube W/ Reviews 1" frame with table, buttons, inputs | `0:1`, main frame: `3:408` |
| youtube initial | Code capture — Activity Page Desktop (1440px), real data, all columns                  | `52:2`                     |
| youtube initial | Code capture — Activity Page Tablet (768px), 5 columns                                 | `50:2`                     |
| youtube initial | Code capture — Activity Page Desktop (1392px), first capture                           | `49:2`                     |
| youtube initial | Activity Page - Mobile (Make-generated, good layer names)                              | `42:2`                     |

### Perspectize - Radix 3.0 Implementation (Design System)

The design system foundation — color variables, typography, icons, and base components from Radix/shadcn.

| Field        | Value                                                      |
| ------------ | ---------------------------------------------------------- |
| **File Key** | `SyvrP9yYbrmCorofJK4Co8`                                   |
| **URL**      | `https://www.figma.com/design/SyvrP9yYbrmCorofJK4Co8`      |
| **Role**     | Design tokens, base components, typography scale, icon set |

**Pages:**

| Page               | Contents                                                                                |
| ------------------ | --------------------------------------------------------------------------------------- |
| Cover              | File cover art                                                                          |
| Components         | Base shadcn/Radix component library                                                     |
| Colors             | Color palette and swatches                                                              |
| Typography         | Font size scale (text-xs → text-9xl), font weight scale (thin → black), Charter preview |
| Icons              | Icon set                                                                                |
| Changelog          | Design system change history                                                            |
| \_Local Components | Internal/private components                                                             |

**Live Variables (extracted via MCP):**

| Variable               | Value     | Category   |
| ---------------------- | --------- | ---------- |
| `background`           | `#ffffff` | Color      |
| `foreground`           | `#171717` | Color      |
| `primary`              | `#1a365d` | Color      |
| `primary-foreground`   | `#ffffff` | Color      |
| `secondary-foreground` | `#525252` | Color      |
| `muted`                | `#262626` | Color      |
| `muted-foreground`     | `#737373` | Color      |
| `accent`               | `#f7fafc` | Color      |
| `popover`              | `#ffffff` | Color      |
| `popover-foreground`   | `#171717` | Color      |
| `border`               | `#d4d4d4` | Color      |
| `input`                | `#d4d4d4` | Color      |
| `font/family/sans`     | `Geist`   | Typography |
| `font/size/sm`         | `14`      | Typography |
| `font/size/base`       | `16`      | Typography |
| `font/size/6xl`        | `60`      | Typography |
| `font/weight/normal`   | `400`     | Typography |
| `font/weight/medium`   | `500`     | Typography |
| `font/weight/semibold` | `600`     | Typography |
| `font/leading/5`       | `20`      | Typography |
| `font/leading/6`       | `24`      | Typography |
| `font/tracking/normal` | `0`       | Typography |
| `font/tracking/tight`  | `-0.4`    | Typography |
| `border-radius/md`     | `6`       | Layout     |
| `border-radius/lg`     | `8`       | Layout     |
| `border-radius/3xl`    | `24`      | Layout     |
| `border-radius/full`   | `9999`    | Layout     |
| `border-width/1`       | `1`       | Layout     |
| `spacing/1`            | `4`       | Layout     |
| `spacing/1-5`          | `6`       | Layout     |
| `spacing/2`            | `8`       | Layout     |
| `spacing/2-5`          | `10`      | Layout     |
| `spacing/3`            | `12`      | Layout     |
| `spacing/4`            | `16`      | Layout     |
| `spacing/6`            | `24`      | Layout     |
| `spacing/8`            | `32`      | Layout     |
| `opacity/50`           | `50`      | Layout     |

**Text Styles (from variables):**

| Style              | Definition                             |
| ------------------ | -------------------------------------- |
| `text-sm/normal`   | Geist Regular, 14px, line-height 20px  |
| `text-sm/medium`   | Geist Medium, 14px, line-height 20px   |
| `text-sm/semibold` | Geist SemiBold, 14px, line-height 20px |
| `text-base/normal` | Geist Regular, 16px, line-height 24px  |
| `text-base/medium` | Geist Medium, 16px, line-height 24px   |

**Shadows:**

| Shadow      | Definition                                                          |
| ----------- | ------------------------------------------------------------------- |
| `shadow/sm` | `0 1px 2px rgba(0,0,0,0.05)`                                        |
| `shadow/lg` | `0 4px 6px -2px rgba(0,0,0,0.05), 0 10px 15px -3px rgba(0,0,0,0.1)` |

### Perspectize Youtube - App 1 (Published Library)

Published component library — Make-generated app design.

| Field        | Value                                               |
| ------------ | --------------------------------------------------- |
| **File Key** | `dAiiWM7FOsob5upzUjtocY`                            |
| **URL**      | `https://www.figma.com/make/dAiiWM7FOsob5upzUjtocY` |
| **Type**     | Figma Make file                                     |
| **Role**     | Published/generated app components                  |

---

## Team & Project

| Field       | Value                          |
| ----------- | ------------------------------ |
| **Team**    | Edify+Ente (Professional plan) |
| **Project** | Perspectize                    |

---

## Design System State

### Fonts

| Font        | Role                                                | Weights                                                 | Source                                                                     |
| ----------- | --------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Geist**   | Headings, UI labels, buttons, navigation            | 400 (Regular), 500 (Medium), 600 (SemiBold), 700 (Bold) | [vercel.com/font](https://vercel.com/font) — Variable woff2                |
| **Charter** | Body text, reviews, descriptions, long-form content | 400 (Regular), 400i (Italic), 700 (Bold)                | [Matthew Carter / Bitstream](https://practicaltypography.com/charter.html) |

### Color Variables — Radix vs Design Spec Differences

The Radix 3.0 file has base variables that differ from the DESIGN_SPEC.md targets. Both are documented for reference.

| Variable             | Radix 3.0 (current) | Design Spec (target) | Notes                                   |
| -------------------- | ------------------- | -------------------- | --------------------------------------- |
| `foreground`         | `#171717`           | `#0A0A0A`            | Spec uses darker black                  |
| `muted`              | `#262626` (dark)    | `#F5F5F5` (light)    | Major difference — Radix has dark muted |
| `muted-foreground`   | `#737373`           | `#525252`            | Spec uses darker gray                   |
| `accent`             | `#f7fafc`           | `#F5F5F5`            | Slight tint difference                  |
| `primary-foreground` | `#ffffff`           | `#F0F4F8`            | Spec uses slight blue-white             |
| `border`             | `#d4d4d4`           | `#E5E5E5`            | Different neutral grays                 |
| `input`              | `#d4d4d4`           | `#E5E5E5`            | Different neutral grays                 |
| `primary`            | `#1a365d`           | `#1A365D`            | Same                                    |
| `background`         | `#ffffff`           | `#FFFFFF`            | Same                                    |

> When implementing, use the **Design Spec** values as the source of truth for the frontend CSS tokens.

### Target Collections (from DESIGN_SPEC.md)

| Collection    | Count | Key Variables                                                                                                                       |
| ------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Theme / Light | 22    | `primary` (#1A365D), `background` (#FFFFFF), `foreground` (#0A0A0A), `destructive` (#DC2626), `muted` (#F5F5F5), `border` (#E5E5E5) |
| Rating        | 4     | `positive` (#16A34A), `negative` (#DC2626), `neutral` (#525252), `undecided` (#D4D4D4)                                              |
| Brand         | 1     | `logo-purple` (#7C3AED)                                                                                                             |

> Full token list: see [DESIGN_SPEC.md](DESIGN_SPEC.md) § Color Tokens

### Text Styles

Status: **Step 2 pending** — not yet applied to Design 1 file.

Target styles (from DESIGN_SPEC.md):

| Style         | Font    | Size/Line Height | Weight   |
| ------------- | ------- | ---------------- | -------- |
| Display       | Geist   | 36/40            | Bold     |
| H1            | Geist   | 30/36            | SemiBold |
| H2            | Geist   | 24/32            | SemiBold |
| H3            | Geist   | 20/28            | SemiBold |
| Label         | Geist   | 14/20            | Medium   |
| Small/Caption | Geist   | 12/16            | Regular  |
| Body Large    | Charter | 16/24            | Regular  |
| Body          | Charter | 14/20            | Regular  |
| Body Italic   | Charter | 14/20            | Italic   |
| Body Bold     | Charter | 14/20            | Bold     |

### Components

Status: **Not yet created in Design 1** — Steps 3-13 pending.

---

## Code ↔ Figma Component Mapping

Maps Svelte components to their Figma counterparts. Updated as components are built.

| Svelte Component                        | Figma Component          | File     | Figma Node ID | Notes            |
| --------------------------------------- | ------------------------ | -------- | ------------- | ---------------- |
| `$lib/components/shadcn/button`         | Button                   | Design 1 | —             | Step 3 (pending) |
| `$lib/components/shadcn/input`          | Input                    | Design 1 | —             | Step 4 (pending) |
| `$lib/components/shadcn/label`          | Label                    | Design 1 | —             | Step 4 (pending) |
| `$lib/components/shadcn/dialog`         | Dialog                   | Design 1 | —             | Step 6 (pending) |
| `$lib/components/Header.svelte`         | Header                   | Design 1 | —             | Step 7 (pending) |
| `$lib/components/AddVideoDialog.svelte` | Add Video Dialog         | Design 1 | —             | Step 9 (pending) |
| `$lib/components/ActivityTable.svelte`  | Activity Table / AG Grid | Design 1 | —             | —                |
| `$lib/components/UserSelector.svelte`   | User Selector            | Design 1 | —             | —                |
| `$lib/components/PageWrapper.svelte`    | Page Wrapper             | Design 1 | —             | —                |

---

## Code ↔ Figma Token Mapping

Maps CSS custom properties to Figma variable names.

| CSS Token (`app.css`)        | Figma Variable       | Collection    |
| ---------------------------- | -------------------- | ------------- |
| `--color-primary`            | `primary`            | Theme / Light |
| `--color-primary-foreground` | `primary-foreground` | Theme / Light |
| `--color-background`         | `background`         | Theme / Light |
| `--color-foreground`         | `foreground`         | Theme / Light |
| `--color-muted`              | `muted`              | Theme / Light |
| `--color-muted-foreground`   | `muted-foreground`   | Theme / Light |
| `--color-destructive`        | `destructive`        | Theme / Light |
| `--color-border`             | `border`             | Theme / Light |
| `--color-input`              | `input`              | Theme / Light |
| `--color-ring`               | `ring`               | Theme / Light |
| `--color-rating-positive`    | `positive`           | Rating        |
| `--color-rating-negative`    | `negative`           | Rating        |
| `--color-rating-neutral`     | `neutral`            | Rating        |
| `--color-rating-undecided`   | `undecided`          | Rating        |

> Pattern: Figma variable `foo` → CSS `--color-foo` → Tailwind class `bg-foo` / `text-foo`

---

## MCP Interaction Protocol

**IMPORTANT: Always follow the pre-flight checklist before calling any Figma MCP tool.** Skipping these steps causes silent failures.

### Pre-Flight Checklist (Ask User Before Every Call)

Before calling any tool that requires file context, **prompt the user** with:

1. **Which file?** — Confirm the target file is open in Figma desktop app
2. **Which mode?** — Must be in **design mode** (not dev mode, not prototype mode)
3. **Selected layer?** — Ask user to click on a specific element/frame on the canvas
4. **Which page?** — If the file has multiple pages, confirm they're on the correct page

Example prompt to user:

> "Before I pull data from Figma, please confirm:
>
> - You have **[file name]** open in Figma desktop
> - You're in **design mode** (not dev mode)
> - You've **clicked on any element** on the canvas
>   Ready?"

### Tool Requirements Matrix

| Tool                         | Needs File Open | Needs Design Mode | Needs Layer Selected | Needs Node ID |
| ---------------------------- | :-------------: | :---------------: | :------------------: | :-----------: |
| `get_screenshot`             |       Yes       |        No         |          No          |      Yes      |
| `get_design_context`         |       Yes       |        No         |          No          |      Yes      |
| `get_metadata`               |       No        |        No         |          No          | Yes (page ID) |
| `get_variable_defs`          |     **Yes**     |      **Yes**      |       **Yes**        |      Yes      |
| `get_code_connect_map`       |       No        |        No         |          No          |      Yes      |
| `add_code_connect_map`       |       No        |        No         |          No          |      Yes      |
| `send_code_connect_mappings` |       No        |        No         |          No          |      No       |
| `create_design_system_rules` |       No        |        No         |          No          |      No       |
| `whoami`                     |       No        |        No         |          No          |      No       |

### Common Failure Modes

| Error Message                                            | Cause                             | Fix                                                                   |
| -------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| "You currently have nothing selected"                    | No layer selected, or in dev mode | Ask user to switch to design mode and click an element                |
| "The node ID provided was invalid"                       | Used `0:0` (document root)        | Use page IDs like `0:1`, `0:2`, etc.                                  |
| "MCP server only available if active tab is design file" | Wrong Figma tab/file is active    | Ask user to switch to the correct file tab                            |
| Result exceeds maximum tokens                            | Large page with many nodes        | Use `get_metadata` first for structure, then target specific node IDs |

### Node ID Reference

| What You Want            | How to Get the Node ID                                  |
| ------------------------ | ------------------------------------------------------- |
| First page of a file     | `0:1`                                                   |
| Second page              | `0:2` (increment by 1)                                  |
| Specific frame/component | Extract from Figma URL: `?node-id=123-456` → `123:456`  |
| Make file (App 1)        | Use `0:0`                                               |
| Unknown structure        | Call `get_metadata` on `0:1` first to discover node IDs |

### File Key Quick Reference

| File      | Key                      | Type        |
| --------- | ------------------------ | ----------- |
| Design 1  | `K1HaZLeNwCckWvhoyAfRhj` | Design file |
| Radix 3.0 | `SyvrP9yYbrmCorofJK4Co8` | Design file |
| App 1     | `dAiiWM7FOsob5upzUjtocY` | Make file   |

### Workflow: Extracting Data from Figma

1. **Tell user** which file and page you need open
2. **Wait for confirmation** that they're in design mode with a layer selected
3. **Call `get_metadata`** first to understand the page structure (lightweight, doesn't need selection)
4. **Then call** `get_variable_defs`, `get_design_context`, or `get_screenshot` on specific nodes
5. **If a call fails**, diagnose using the failure modes table above — don't retry blindly

---

## Figma Make Workflow

### How Make Works

Figma Make is a **standalone prompt interface** — it is NOT run from within a file. To target a specific file:

1. Open Figma Make (separate prompt window)
2. In the initial step, **link to the target file** (usually Design 1)
3. Paste the prompt
4. Make applies changes to the linked file

**Target file for all 13 steps:** Perspectize Youtube - Design 1 (`K1HaZLeNwCckWvhoyAfRhj`)

### Progress

Tracks the 13-step design build process. See [DESIGN_SPEC.md](DESIGN_SPEC.md) for full prompts.

| Step | Name                 | Status            |
| ---- | -------------------- | ----------------- |
| 1    | Color Variables      | Done (unverified) |
| 2    | Typography           | Pending           |
| 3    | Buttons              | Pending           |
| 4    | Form Inputs          | Pending           |
| 5    | Card Components      | Pending           |
| 6    | Dialog               | Pending           |
| 7    | Header               | Pending           |
| 8    | Home Page            | Pending           |
| 9    | Add Video Dialog     | Pending           |
| 10   | Video Detail         | Pending           |
| 11   | User Profile         | Pending           |
| 12   | Responsive Variants  | Pending           |
| 13   | Empty/Loading States | Pending           |
