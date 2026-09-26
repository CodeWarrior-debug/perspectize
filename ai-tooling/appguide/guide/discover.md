# Discover

**Route:** /discover
**Summary:** Discover searches YouTube (or shows trending videos when you haven't searched) so you can find content to add to Perspectize. Each result is a card with an inline player and, once added, quick links to start a perspective or compare it with someone else's.

## discover.search
**Task:** Search YouTube for videos to add
**Where:** Discover page → search box
**Steps:**
1. Go to **Discover** from the header.
2. Type into the search box (placeholder "Search Content Sources...").
**Notes:** Search runs automatically shortly after you stop typing — there's no separate search button. Press **Cmd+K**/**Ctrl+K** anywhere on the page to jump back into the search box; press **Escape** to clear the query and return to trending (unless a filter dropdown is open, in which case Escape just closes that dropdown).
**Sign-in required:** yes
**Source:** `frontend/src/routes/discover/+page.svelte`, `frontend/src/lib/components/discover/SearchBar.svelte`

## discover.browse-trending
**Task:** See trending videos without searching
**Where:** Discover page, shown by default
**Steps:**
1. Go to **Discover** with an empty search box.
**Notes:** Results are labeled "Showing Trending Content". Clearing the search box (the **X** button, or Escape) returns you to this view.
**Not supported:** Trending results can't be narrowed with the duration/upload-date/sort filters — those only apply to a search.
**Sign-in required:** yes
**Source:** `frontend/src/routes/discover/+page.svelte`, `frontend/src/lib/components/discover/VideoResultsGrid.svelte`

## discover.filter-search
**Task:** Narrow or reorder search results
**Where:** Discover page → filter row (shown while searching)
**Steps:**
1. Search for something.
2. Use the duration dropdown ("Any duration", "Under 4 minutes", "4-20 minutes", "Over 20 minutes") to filter by length.
3. Use the upload-date dropdown ("Any time", "Last hour", "Today", "This week", "This month", "This year") to filter by recency.
4. Use the sort dropdown ("Relevance", "Upload date", "View count", "Rating") to change result order.
**Notes:** A **Clear Filters** link appears once any filter differs from the defaults, and resets all three at once.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/discover/FilterBar.svelte`, `frontend/src/lib/services/youtubeApi.ts`

## discover.watch-inline
**Task:** Play a result's video without leaving Discover
**Where:** Discover page → a result card
**Steps:**
1. Select anywhere on a result card (or focus it and press Enter/Space).
**Notes:** The card plays the video in an embedded YouTube player in place; you don't navigate away or open a new tab. Selecting the **Add to Perspectize**, **Add perspective**, or **Compare** control on the same card does not trigger playback.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/discover/VideoCard.svelte`

## discover.load-more
**Task:** Load additional search or trending results
**Where:** Discover page, below the result list
**Steps:**
1. Search or browse trending until results appear.
2. Select **Load More** (shown when more results are available).
**Sign-in required:** yes
**Source:** `frontend/src/routes/discover/+page.svelte`, `frontend/src/lib/components/discover/VideoResultsGrid.svelte`

## discover.add-video
**Task:** Add a Discover result to your Perspectize library
**Where:** Discover page → a result card
**Steps:**
1. Find a video via search or trending that isn't already in your library.
2. Select **Add to Perspectize** on that card.
**Notes:** A card already in your library shows a disabled "In Library" state instead of the Add button. Once a video is added this way, its card shows a details panel (duration, views, likes, channel, category) with **Add perspective** and **Compare** buttons: **Add perspective** opens the perspective editor right there on Discover; **Compare** navigates to the Compare page.
**Sign-in required:** yes
**Source:** `frontend/src/routes/discover/+page.svelte`, `frontend/src/lib/components/discover/VideoCard.svelte`, `frontend/src/lib/queries/content/useAddVideo.ts`
