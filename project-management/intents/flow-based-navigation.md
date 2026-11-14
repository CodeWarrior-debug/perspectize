# Flow-based navigation (Retrieve · Review · Respond)

Status: draft

<!-- Idea phase. This intent captures the problem and what has been gathered so far; it is not yet a request for a spec. -->

## Problem

The header nav (`frontend/src/lib/components/Header.svelte`, `navLinks`) is a flat row of five page links: Library, Discover, Compare, Plan, Import. It is getting crowded, especially at small widths, and pages are not intuitive to find: the list says nothing about how the pages relate or what you would go there to do.

The app really has three kinds of activity, and the nav hides them:

| Flow | What the user is doing | Pages today |
|------|------------------------|-------------|
| **Retrieve** | gathering content to look at | Discover, Import |
| **Review** | working through what has been gathered | Library (Content Library), Compare |
| **Respond** | acting on it: planning, or leaving a perspective | Plan; a perspective is left from the + Add popover and the Library, not a page |

## Proposed outcome

- The header shows the three flows, not every page, so it stops growing with each new page.
- Someone who knows what they want to *do* (find something, look through what they have, respond to it) can tell which link to pick.
- Flow labels alliterate. The working set is **Retrieve · Review · Respond**. *Respond* was chosen over *React* because it reads as the user's action and avoids confusion with React the framework.
- Possibly, later: the flow labels rotate through other alliterative sets (see Gatherings), as a playful touch that must not cost findability.

## Affected users and systems

- Every signed-in and signed-out user: the header appears on every page.
- `frontend/src/lib/components/Header.svelte` (`navLinks`, `isActive`) and whatever new sub-navigation is added.
- `frontend/CLAUDE.md` → UI conventions: "Nav labels are one word … name new top-level pages with a one-word verb" will need restating in terms of flows.
- Routes: `/discover`, `/import`, `/import/[id]`, `/content-library` (`LIBRARY_PATH`), `/compare`, `/plan`. `/messages` exists but is not in the nav today.

## Constraints

- Must reduce, not add, cognitive load: the original complaint is findability.
- Existing URLs and bookmarks keep working (other code links to `LIBRARY_PATH`, `/import`, etc.).
- Must work on mobile; the header is already tight at the xs breakpoint and the right side holds + Add, Settings and the user menu.
- Labels stay one-word verbs (current convention).

## Gatherings

### Structure options considered

1. **Grouped dropdowns:** three header items, each opening a menu of its pages. Smallest change, but every page is a click deeper, siblings are hidden, and hover menus are awkward on touch.
2. **Flow links plus a contextual sub-nav row** (current lean): three header links; a thin second row appears only inside a flow and lists its pages (e.g. *Discover · Import* while on either). Routes stay unchanged, the active flow is derived from the pathname, and the familiar page names stay visible.
3. **Route restructure** under `/retrieve/…`, `/review/…`, `/respond/…` with a hub page per flow. Cleanest model; most work, needs redirects, larger blast radius than the problem.

```
Perspectize   Retrieve   Review   Respond            [+ Add] ⚙ 👤
              ─ Discover · Import ─        ← only while on a Retrieve page
```

### Alliterative label sets, A–Z

Each letter needs one natural verb for each flow: **retrieve** (gather content in), **review** (look through it), **respond** (act on it / leave a view). Several options are listed per cell; the first is the best fit.

**18 letters that work**

| Letter | Retrieve | Review | Respond | Fit |
|--------|----------|--------|---------|-----|
| A | Acquire, Amass, Add | Assess, Appraise, Analyze | Answer, Annotate, Affirm, Argue | strong |
| B | Bring, Bag, Borrow | Browse, Brood | Broadcast, Blog, Back | okay |
| C | Collect, Capture, Curate | Consider, Compare, Check | Comment, Critique, Contribute | strong |
| D | Discover, Dig up, Draw in | Digest, Dissect, Deliberate | Discuss, Declare, Debate | strong |
| E | Explore, Extract, Excavate | Examine, Evaluate | Express, Endorse, Echo | strong |
| F | Find, Fetch, Forage | Focus, Filter, Feel out | Formulate, Frame | okay |
| G | Gather, Grab, Glean | Gauge, Go over, Grasp | Grade, Gloss | okay |
| I | Import, Ingest, Intake | Inspect, Investigate, Inquire | Interpret, Interject, Impart | strong |
| L | Locate, Load, Lasso | Look over, Learn, Linger | Lend (a view), Laud, Log | stretch |
| M | Mine, Muster, Map | Mull, Measure, Mark up | Muse, Mark, Make a case | okay |
| O | Obtain, Onboard | Observe, Outline, Overview | Opine, Offer, Object | strong |
| P | Procure, Pull, Prospect | Peruse, Ponder, Pore over | Publish, Post, Posit | strong |
| Q | Quest, Quarry | Question, Query, Quiz | Quip, Quote, Qualify | playful |
| R | Retrieve, Reap, Round up | Review, Read, Revisit | **Respond**, React, Reflect, Remark | strong (current) |
| S | Source, Scout, Save | Study, Scan, Scrutinize | Share, Speak, Say | strong |
| T | Trawl, Track down, Take in | Think, Test, Taste | Tell, Talk, Testify | stretch |
| U | Unearth, Uncover | Unpack, Understand | Utter, Underline, Uphold | stretch |
| W | Wrangle, Wander | Weigh, Watch | Write, Weigh in, Witness | strong |

Strong: A C D E I O P R S W (10). Okay: B F G M (4). Stretch or playful: L Q T U (4).

**8 letters that don't work**

| Letter | Retrieve | Review | Respond | Why it fails |
|--------|----------|--------|---------|--------------|
| H | Hunt, Haul | Heed? | Hold forth? | *Heed* means obey, not examine; no plain respond verb |
| J | — | Judge | Jot | no retrieve verb |
| K | Keep? | Know? | Kvetch | nothing natural in any column |
| N | Nab, Net | Note, Notice | Narrate? | respond is weak; *Note* fits review and respond equally, so they blur |
| V | Vacuum? | Vet, View | Voice, Vouch | no retrieve verb (*Voice* would be a great respond) |
| X | — | — | — | no usable verbs |
| Y | Yank | — | Yell, Yap | no review verb; the rest are jokes |
| Z | — | Zero in, Zoom in | Zing | no retrieve verb |

### Rotating labels: guardrails if pursued

Rotation pulls against the findability goal, so if it happens:

- Only the label word rotates. Position, an icon per flow and the sub-nav page names (Discover, Library, Plan …) stay fixed.
- Rotate rarely (daily or weekly), never mid-session.
- Opt-in setting or easter egg; **R (Retrieve · Review · Respond) is the default**.
- A tooltip gives the canonical meaning (e.g. "Opine = Respond").
- Only "strong" letters go in the rotation pool.
- Store the sets as data (`{ letter, retrieve, review, respond }`), so rotating is choosing a row.

## Open questions

- Structure: option 2 (flow links plus contextual sub-nav) or another?
- Compare: does it belong under Review (current assumption) or Respond?
- Respond has one page (Plan). Is leaving a perspective a page of its own, or does it stay an action (+ Add, Library)?
- Where does `/messages` go: a fourth area, the user menu, or Respond?
- Where does a flow link land: its first page, the last page visited in that flow, or a hub?
- Icons per flow: wanted, and do they stand in for labels on mobile?
- Rotation: part of this change, a follow-up, or dropped?

## Downstream

- Spec: <!-- link, e.g. ../../docs/superpowers/specs/YYYY-MM-DD-flow-based-navigation-design.md -->
- Plan(s): <!-- link(s) -->
- PRs (one line each, add as they open; tick on merge):
  - [ ] <!-- title — PR link — open | merged -->
