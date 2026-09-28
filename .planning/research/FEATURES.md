# Features Research

**Domain:** Perspective/Content Browsing Frontend (SvelteKit + Go Backend)
**Researched:** 2026-02-04
**UX Goal:** "Effortless to input, calm to browse" - opposite of social media overwhelm

---

## Discover Page

The content discovery page is where users browse videos in a data table, search, filter, sort, and select content to add perspectives to.

### Table Stakes

Features users expect for a functional discovery experience. Missing = product feels broken.

| Feature | Why Expected | Complexity | Implementation Notes |
|---------|--------------|------------|----------------------|
| Column sorting with indicators | Users need to organize data; chevron icons show sort direction | Low | Click header to sort, show arrow icon, toggle ASC/DESC |
| Search with instant feedback | Typing should filter immediately (< 300ms perceived delay) | Medium | Debounce input, show loading indicator if server-side |
| Multi-filter support | Users need to refine by multiple criteria simultaneously | Medium | Allow combining filters; provide clear "X" to remove each filter |
| Cursor-based pagination | Data tables need page navigation (already built in backend) | Low | Show 25-50 rows default; options for 10/25/50/100 |
| Clear filter state | Users must see what filters are active | Low | Chips/tags showing active filters with remove buttons |
| Loading states | Users need feedback during data fetch | Low | Skeleton loaders or spinner; never blank screen |
| Empty states | Users need guidance when no results match | Low | "No videos match your filters" with suggested actions |

### Differentiators

Features that support "calm browsing" goal and set Perspectize apart.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Focused column selection** | Show only 5-6 essential columns by default; hide complexity behind "Customize Columns" | Low | Reduces cognitive load; follows 2026 minimalist trend |
| **Calm color palette** | Muted tones, soft edges, generous whitespace | Low | Avoid sharp contrasts; use spacing as design element |
| **Clear content hierarchy** | Visual weight guides attention to what matters | Medium | Larger titles, subtle secondary info, intentional typography |
| **Pause-aware design** | No infinite scroll; explicit pagination creates natural stopping points | Low | Counter to social media patterns; users feel in control |
| **Savable filter presets** | Save common filter combinations for quick access | Medium | Reduces repetitive setup; supports power users |
| **Context-aware density** | Desktop shows more; mobile shows less but more usable | Medium | Progressive disclosure based on viewport |

### Anti-features

Features to deliberately NOT build. These are social media patterns that contradict "calm browsing."

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Infinite scroll** | Removes natural stopping points; enables mindless consumption | Pagination with clear page numbers and row counts |
| **Auto-playing video previews** | Distracting; increases cognitive load; feels aggressive | Static thumbnails; play on explicit hover/click |
| **Aggressive engagement metrics** | View counts, trending indicators create FOMO | Simple, factual metadata (title, channel, date added) |
| **Pull-to-refresh** | Mobile pattern that encourages compulsive checking | Manual refresh button; data stays stable during session |
| **Animation-heavy transitions** | Flashy animations increase stimulation | Subtle, purposeful transitions (150-200ms) |
| **Notification badges** | Create urgency anxiety | No notifications; users check at their own pace |

---

## Add Video Flow

The flow for adding new YouTube videos to the system by pasting a URL.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| URL paste field | Single input to paste YouTube URL | Low | Large, prominent input field |
| Instant metadata fetch | < 1 second to show video details after paste | Medium | Already built in backend; show loading state |
| Preview before save | Show title, thumbnail, channel before confirming | Low | User verification prevents mistakes |
| Error handling | Clear message for invalid URLs or fetch failures | Low | "Invalid YouTube URL" or "Video not found" |
| Duplicate detection | Warn if video already exists in system | Medium | Check before save; offer to view existing |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Auto-detect URL on paste** | No need to click fetch button; metadata appears automatically | Low | Detects youtube.com/youtu.be patterns |
| **One-click add** | After paste, single "Add" button | Low | Minimal friction; effortless input |
| **Smart field population** | Auto-populate title, channel, description from API | Low | Already implemented in backend |
| **Inline add from discover** | "Add video" button in header, modal/slide-out | Medium | No context switch to separate page |

### Anti-features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Multi-step wizard** | Overkill for simple URL paste | Single-step: paste, preview, confirm |
| **Required manual metadata entry** | Tedious when API provides it | Auto-populate all available fields |
| **Bulk import without preview** | Error-prone; reduces quality | Show each video before adding |

---

## Add Perspective Flow

The multi-step flow for adding ratings and perspectives on content.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Progress indicator | Users need to know where they are in multi-step flow | Low | Step dots or numbered progress bar |
| Required field indicators | Clear marking of what must be filled | Low | Asterisk or visual distinction |
| Validation feedback | Immediate feedback on invalid inputs | Low | Inline errors, not just on submit |
| Save/submit confirmation | Clear success feedback | Low | Toast or confirmation message |
| Cancel with warning | Warn if unsaved changes exist | Low | "Discard changes?" modal |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Progressive disclosure** | Start with simple agree/disagree; reveal detailed ratings only if wanted | Medium | Core to "effortless to input" goal |
| **Quick mode vs Detailed mode** | Two paths: quick (3 clicks) or detailed (all 0-1000 fields) | Medium | Most users want quick; power users want detail |
| **Slider with visual labels** | 0-1000 scale with semantic anchors (e.g., "Disagree" to "Agree") | Medium | Better than raw numbers; research supports labeled endpoints |
| **Smart defaults** | Pre-select neutral/middle values | Low | Reduces cognitive load; users adjust from baseline |
| **Claim as primary input** | Lead with text claim, ratings secondary | Low | Claims are unique; ratings without claims feel empty |
| **Optional fields clearly marked** | "Optional" label, dimmed styling | Low | Users know what they can skip |

### Anti-features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **All fields required** | Increases abandonment; feels like homework | Only claim required; all ratings optional |
| **Precise number input (0-1000)** | Impossible on mobile; false precision | Slider with stepped increments (e.g., 50 or 100) |
| **Long single-page form** | Overwhelming; high abandonment | Progressive disclosure or 2-3 step flow |
| **Auto-save without indication** | Users feel loss of control | Either explicit save or clear "saving..." indicator |
| **Gamification (points, badges)** | Encourages quantity over quality; social media pattern | No points; intrinsic motivation only |

---

## User Experience Patterns

Cross-cutting UX patterns for the application.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Consistent navigation | Same header/nav on all pages | Low | Standard layout pattern |
| Keyboard accessibility | Tab navigation, Enter to submit | Medium | Required for accessibility |
| Responsive layout | Works on desktop, tablet, mobile | Medium | Mobile-first CSS |
| Error boundaries | Graceful degradation on failures | Medium | "Something went wrong" with retry |
| Back button support | Browser back works as expected | Low | Use proper routing |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Calm visual identity** | Muted colors, generous spacing, soft corners | Low | 2026 design trend; differentiates from loud apps |
| **Content-focused layout** | Minimal chrome; data is the star | Low | Hide UI elements that don't serve current task |
| **Respectful defaults** | No aggressive notifications, no engagement nudges | Low | "Calm technology" principle |
| **Contextual help** | Tooltips explain rating dimensions on hover | Low | Reduces confusion without cluttering UI |
| **Batch actions** | Select multiple, act once (delete, export) | Medium | Power user efficiency |

### Anti-features (Social Media Patterns to Avoid)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Variable reinforcement** | "What will I find next?" creates addiction loops | Predictable, stable content; no algorithmic sorting by engagement |
| **Social proof pressure** | "X people rated this" creates conformity pressure | Show only your own perspective; others' ratings hidden by default |
| **Infinite content feeds** | Enables mindless consumption | Fixed-size pages with explicit navigation |
| **Read receipts / activity indicators** | Creates social pressure and anxiety | No presence indicators; privacy by default |
| **Streak mechanics** | "Keep your streak!" creates guilt and obligation | No streaks; use app when you want to |
| **Like/reaction counts** | Creates popularity contests; reduces nuance | Private perspectives; no public voting |
| **Push notifications** | Interrupt-driven design; addictive | No push notifications; email digest at most (opt-in) |
| **Autoplay anything** | Removes user agency | Explicit play triggers only |
| **Dark patterns for retention** | "Are you sure you want to leave?" | Clean exits; no guilt-tripping |
| **Gamification leaderboards** | Encourages gaming the system | No leaderboards; personal reflection only |

---

## User Switching (No Auth Demo Mode)

For the initial version without authentication, users switch via dropdown selector.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| User dropdown in header | Visible, accessible user selector | Low | Standard placement: top-right header |
| Clear current user indicator | Show who is currently selected | Low | Display name prominently |
| Persist selection | Selection survives page refresh | Low | localStorage or cookie |
| Quick switching | Dropdown, not separate page | Low | 2 clicks max to switch users |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Visual user differentiation** | Different avatar colors per user | Low | Quick visual confirmation of current user |
| **Recent users first** | Show most recently used users at top of dropdown | Low | Reduces scrolling in long lists |
| **Type-ahead filter** | Type to filter users when list is long (>10) | Medium | Improves findability |

### Anti-features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Login flow simulation** | Overkill for demo; adds friction | Simple dropdown switch |
| **Session timeouts** | No reason to expire in no-auth mode | Persistent selection |
| **"Create user" modal interruption** | Context switch | Separate "Manage Users" page |

---

## Mobile Considerations

Responsive patterns for data-heavy UIs on mobile devices.

### Recommended Patterns

| Pattern | Description | When to Use |
|---------|-------------|-------------|
| **Card transformation** | Table rows become stacked cards on mobile | Data tables with 5+ columns |
| **Column prioritization** | Show only 3-4 most important fields on mobile | Any table; hide secondary data behind expand |
| **Progressive disclosure** | Tap to expand full details | When row data is too dense for mobile width |
| **Sticky header** | Column headers remain visible while scrolling | Long lists on mobile |
| **Bottom sheet modals** | Slide up from bottom for actions/filters | Mobile filter panels, quick actions |
| **Floating action button** | Primary action (Add Video, Add Perspective) | Mobile primary CTAs |

### Avoid on Mobile

| Pattern | Why Problematic | Alternative |
|---------|-----------------|-------------|
| **Horizontal scroll tables** | Frustrating UX; users miss data | Card layout or column hiding |
| **Hover-dependent interactions** | No hover on touch | Tap-based interactions |
| **Small touch targets** | < 44px causes mis-taps | Minimum 44x44px touch targets |
| **Dense data grids** | Illegible on small screens | Progressive disclosure |
| **Multi-column filters** | Too cramped | Stacked filter inputs or filter sheet |

### Mobile-First Responsive Strategy

```
Mobile (< 640px):
- Card-based table layout
- Single column forms
- Bottom sheet for modals/filters
- 3-4 data points per card
- Floating action button

Tablet (640-1024px):
- Hybrid table (5-6 columns visible)
- Side panel for details
- Two-column forms where sensible

Desktop (> 1024px):
- Full table with all columns
- Inline editing
- Multi-column filter bar
- Modal dialogs (centered)
```

---

## MVP Recommendation

Based on research, prioritize for MVP:

### Must Have (Table Stakes)
1. Sortable, filterable data table with pagination (not infinite scroll)
2. URL paste with auto-fetch for adding videos
3. Simple perspective form with progressive disclosure
4. User dropdown selector
5. Responsive card layout for mobile

### Should Have (Differentiators aligned with "calm browsing")
1. Focused 5-6 column default with column customization
2. Quick mode vs Detailed mode for perspectives
3. Calm visual design (muted palette, generous spacing)
4. No engagement metrics shown (no view counts, no trending)

### Defer to Post-MVP
- Savable filter presets
- Batch operations
- Advanced column customization
- Type-ahead user filter

---

## Sources

### Data Tables & UX Patterns
- [Pencil & Paper: Data Table Design UX Patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables)
- [Mann Howie: Data Table UX Rules](https://mannhowie.com/data-table-ux)
- [LogRocket: Data Table Design Best Practices](https://blog.logrocket.com/ux-design/data-table-design-best-practices/)
- [NN/g: Slider Design Rules of Thumb](https://www.nngroup.com/articles/gui-slider-controls/)

### Calm UX & Mental Wellbeing
- [UXmatters: Designing Calm](https://www.uxmatters.com/mt/archives/2025/05/designing-calm-ux-principles-for-reducing-users-anxiety.php)
- [UX Design Institute: 7 Fundamental UX Principles 2026](https://www.uxdesigninstitute.com/blog/ux-design-principles-2026/)
- [Toptal: Reducing Cognitive Overload](https://www.toptal.com/designers/ux/cognitive-overload-burnout-ux)

### Dark Patterns to Avoid
- [Eleken: 18 Dark Patterns Examples](https://www.eleken.co/blog-posts/dark-patterns-examples)
- [Fair Patterns: Dark Patterns in Social Media](https://www.fairpatterns.com/post/dark-patterns-social-media-gaming-and-e-commerce)
- [Weizenbaum Journal: Dark Patterns and Addictive Designs](https://ojs.weizenbaum-institut.de/index.php/wjds/article/view/5_3_2/189)

### Mobile Responsive Tables
- [NN/g: Mobile Tables](https://www.nngroup.com/articles/mobile-tables/)
- [Smashing Magazine: Accessible Responsive Tables](https://www.smashingmagazine.com/2022/12/accessible-front-end-patterns-responsive-tables-part1/)
- [WP Data Tables: Mobile-Friendly Tables](https://wpdatatables.com/mobile-friendly-tables/)

### Rating Scales
- [IxDF: Rating Scales in UX Research](https://www.interaction-design.org/literature/article/rating-scales-for-ux-research)
- [NN/g: Likert or Semantic Differential](https://www.nngroup.com/articles/rating-scales/)
- [MeasuringU: Sliders vs Numeric Scales](https://measuringu.com/uxlite-numeric-slider-desktop-mobile/)

### Forms & Multi-Step UX
- [IxDF: How to Design UI Forms 2026](https://www.interaction-design.org/literature/article/ui-form-design)
- [UXPin: Dropdown Interaction Patterns](https://www.uxpin.com/studio/blog/dropdown-interaction-patterns-a-complete-guide/)
- [UX Power Tools: Account Switching UX](https://medium.com/ux-power-tools/breaking-down-the-ux-of-switching-accounts-in-web-apps-501813a5908b)

### 2026 Design Trends
- [Index.dev: 12 UI/UX Trends 2026](https://www.index.dev/blog/ui-ux-design-trends)
- [Sanjay Dey: Minimalist UI Design Trends 2026](https://www.sanjaydey.com/minimalist-ui-design-clean-website-design-web-trends-2026/)
- [Figma: Web Design Trends 2026](https://www.figma.com/resource-library/web-design-trends/)
