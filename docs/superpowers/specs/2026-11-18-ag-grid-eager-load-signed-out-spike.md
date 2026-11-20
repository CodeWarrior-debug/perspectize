# Spike: is the eager AG Grid download acceptable for signed-out visitors? (#642)

**Status:** spike, not a superpowers plan. Research record for issue #642 (follow-up to #636). Nothing here changes code.

**Demo:** not applicable, docs-only research.

## 1. Question

Commit `ddb934ff` (branch `feature/INI-636-first-load-perf`) starts the Activity table import from `frontend/src/routes/+page.svelte`'s `<script module>`. Outside demo mode the root layout renders nothing until `ClerkLoaded`, so the old serial chain (Clerk script, then table import) is shortened by starting the import early. The cost is that signed-out visitors, who land on `/` and see `GuestLanding`, now also download the grid. This spike measures that cost from the build alone and states what still needs a browser.

## 2. Method (no browser, no login)

- One production build of `frontend/` on the current `main` (`pnpm --dir frontend run build`, no Clerk key, so the build is the same as the one the `/` route would load).
- Route-to-node mapping from `frontend/.svelte-kit/output/server/manifest.js`: `/` = layout node 0, leaf node 3. `/content-library` = layout node 0, leaf node 5.
- Static import closure of each node in `frontend/build/_app/immutable/nodes/`, plus the dynamic `import()` targets, followed transitively. Sizes are raw bytes and gzip level 9. Gzip here is a local approximation; production serves its own encoding, so treat figures as +/- a few percent.

## 3. Measurements

| Set | Files | Raw KB | Gzip KB |
|---|---|---|---|
| Root layout only (node 0, static closure) | 48 | 745 | 259 |
| `/` page, static closure (node 0 + node 3) | 50 | not measured | 260 |
| `/` page's dynamic target (`BKm1EZx7.js`, the Activity table module, own bytes) | 1 | 94 | 29 |
| Extra bytes a signed-out `/` visitor downloads from the table import (target closure minus the static set) | 14 | - | **294** |

Notes:

- The 294 KB gzip delta includes the Activity table's own code and its AG Grid dependency. The issue's ~244 KB gzip figure is AG Grid alone; the table code makes up the rest.
- The delta contains the AG Grid marker (`ag-grid` string present in the target closure), confirming the grid is inside it.
- Node 0's 259 KB is the existing root cost for every visitor. The Clerk script (~372 KB, from its CDN, not in this build) is additional and not measured here.

## 4. Other signed-out paths to the same chunk

These were found by reading the code. They were not timed.

- **Library link in the header.** The header's "Library" link is outside `AuthShow`, so guests see it. `app.html` sets `data-sveltekit-preload-data="hover"`, so hovering it preloads `/content-library`, whose module script imports the same table module.
- **Anonymous list request on `/`.** `routes/+page.ts` calls `prefetchActivityList` for every visitor (only demo mode is skipped). Guests therefore send an anonymous `LIST_CONTENT` request on landing. That is a data request, not a bundle, and the issue does not mention it.
- **Onboarding video.** `GuestLanding` renders `OnboardingVideo` with `preload="metadata"`. Metadata-only loading is small, but it shares bandwidth with the grid download. Not measured.

## 5. Recommendation

**Not acceptable as it stands; decide after the signed-in measurement.**

- The guest cost is fixed and large: about 294 KB gzip on every landing at `/`, against a page whose own static cost is 260 KB gzip.
- The benefit is for signed-in visitors only, and it has not been measured. The change removes one serial step (the table import after Clerk) from the signed-in LCP path. Its size is unknown until the signed-in medians from the acceptance criteria exist.
- If the signed-in gain is less than the issue's bar (LCP should be clearly under the 2.5 s "good" line and the gain should be material), the cheapest change is to revert the `/` module import and keep the `content-library` one. A signed-in visitor on `/` is redirected to `/content-library` after mount, so that route's own module import still starts the chunk for them; the cost moves to after Clerk for that one redirect path, and guests stop paying.
- Gating the early import on a Clerk session cookie is the alternative the issue lists. It needs the cookie name and semantics for this Clerk instance, which are unverified, so it is not recommended until someone checks them.

## 6. Not verified

- Real-network LCP, FCP and TBT for a **signed-in** visitor, before and after. Needs a browser session, which this spike does not use.
- Real-network LCP, FCP and TBT for a **signed-out** visitor, before and after. Same reason.
- Whether the extra ~294 KB gzip competes with Clerk's script on a real connection, and by how much. Needs the request waterfall from a browser.
- The production gzip/brotli sizes. Figures above are local gzip level 9.
- Whether the hover preload of `/content-library` happens in practice for guests. Read from code and the body attribute; not observed.

## 7. Next step

Run the issue's acceptance criteria on the demo stack or a signed-in session (before and after, median of several runs, LCP/FCP/TBT and the request waterfall), then record the decision here as a "Spike Results" section.
