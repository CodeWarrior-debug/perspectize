# Library

**Route:** /content-library
**Summary:** The Library is the page behind **Library** in the header (signed-in visitors to `/` are forwarded to it): a table of everything members have added, including YouTube videos, Bible passages, movies and books. Here you search, filter, sort and page through that content, choose columns, open an item's details, and start a perspective, comparison or plan item. Search text, filters and data mode stay in the page address (and, in All Items mode, the sort and page), so a refresh or a shared link keeps them. Column headings display in capitals; this guide writes them as Type, Views and so on.

## activity.search-content
**Task:** Search the Library by keyword
**Where:** Library page header → search box
**Steps:**
1. Type into the "Search content..." box; results update after a brief pause.
2. To change which fields are searched, select the sliders icon next to the box and tick or untick the fields under **Search in**: **Title**, **Description**, **Channel**, **Tags**, plus **Cast** and **Director** while the Type filter includes Movie.
**Notes:** At least one field must stay ticked; unticking the last one does nothing. Search only covers the types the Type filter allows, and that filter starts as YouTube Video only (see activity.filter-by-type). There is no author search field; to find books by author, use the **Author** column's filter, which shows by default while Book is the only ticked type.
**Sign-in required:** yes
**Source:** `frontend/src/routes/content-library/+page.svelte`, `frontend/src/routes/+page.svelte`, `frontend/src/lib/utils/gridUrlState.ts`

## activity.filter-columns
**Task:** Filter content by a column's value
**Where:** Library → table → funnel icon in a column header (desktop grid only)
**Steps:**
1. Select the funnel icon in the header of a column such as Duration, Views, Likes, Date, Channel, User, Tags or Description, and set a condition (the options are text, number or date conditions, depending on the column).
2. Each active filter appears as a chip labelled with its column; select the **x** on a chip to remove that filter, or **Clear all** to remove every filter.
**Not supported:** Filtering by Category, % Liked, ROI, Editions, Readers, Budget, Votes, Collection, Synopsis or TMDB ID, because those headers have no funnel. The narrow-screen card list has no column filter menus, though filters already in the page address still apply and its chips can still be removed.
**Notes:** In Loaded mode every filter except Type applies only to the rows already loaded (see activity.data-mode). When no row matches, the table says "No results match your filters".
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/components/FilterChips.svelte`, `frontend/src/lib/utils/grid-config.ts`, `frontend/src/lib/utils/gridUrlState.ts`

## activity.filter-by-type
**Task:** Show only certain content types (YouTube videos, Bible passages, movies, books)
**Where:** Library → table → funnel icon in the **Type** header (desktop grid only)
**Steps:**
1. Select the funnel icon in the **Type** header.
2. Tick one or more of **YouTube Video**, **Bible Passage**, **Movie** and **Book**; rows of any ticked type are shown.
3. Select **Clear** in the menu to remove the type filter and show every type.
**Notes:** The Library opens with only **YouTube Video** ticked, so Bible passages, movies and books stay hidden until you tick them or remove the **Type** chip (**Clear all** removes it too). Ticking only **Movie**, or only **Book**, switches the table to that type's own columns (see activity.column-sets). On narrow screens there is no Type menu, so remove the **Type** chip to see every type.
**Sign-in required:** yes
**Source:** `frontend/src/lib/utils/contentTypeFilter.ts`, `frontend/src/lib/utils/grid-config.ts`, `frontend/src/lib/utils/gridUrlState.ts`, `frontend/src/lib/components/FilterChips.svelte`

## activity.column-sets
**Task:** Get the columns that suit one content type
**Where:** Library → Type filter, and the **Columns** dialog
**Steps:**
1. Tick only **Movie** in the Type filter: the Item column's heading becomes **Film**, and the table shows Genre, Rated, Cast, Duration, Released, Take, ROI, Rating and Tags.
2. Tick only **Book**: the Item heading becomes **Book**, and the table shows Author, Published, Pages, Book rating and Tags.
3. With anything else (YouTube Video, Bible Passage, several types or none), the standard columns show: Category, Channel, Duration, Date, Views, Likes, % Liked and Tags.
4. When the set changes, a toast reads "Showing Movie columns" (or "Showing Book columns" or "Showing standard columns"). Select **Revert** to get your previous columns back, or **Choose columns** to open the **Columns** dialog.
5. While the Type filter is empty or has several types, a note says "Select one type or custom columns for the most relevant info." Select **one type** to open the Type filter, or **custom columns** to open the **Columns** dialog.
**Notes:** Windows narrower than about 900px show only the first columns of each set; add the rest with **Columns**. Each set keeps its own saved column choices (see activity.choose-columns). The toast and the note appear only on the desktop grid.
**Sign-in required:** yes
**Source:** `frontend/src/lib/utils/grid-config.ts`, `frontend/src/lib/utils/columnLayouts.ts`, `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/components/ColumnRelevanceCallout.svelte`

## activity.filter-by-user
**Task:** Show only the items you added, or that a particular member added
**Where:** Library page header → **Mine** button next to the search box, or the **User** column's funnel
**Steps:**
1. Select **Mine** to show only the items you added; select it again to show everyone's.
2. To see another member's additions, show the **User** column (**Columns** dialog), open its funnel and type their username.
**Not supported:** A separate By User tab or feed that groups recent activity by member; the **User** column and **Mine** replace it.
**Notes:** **Mine** is a shortcut that sets the **User** column's filter to your username, so a **User** chip appears. The match is "contains", so a username that includes yours also matches. In Loaded mode the filter looks only at the rows already loaded; switch to All Items to cover the whole library. The **User** column can also be sorted.
**Sign-in required:** yes
**Source:** `frontend/src/routes/content-library/+page.svelte`, `frontend/src/lib/utils/grid-config.ts`, `frontend/src/lib/components/ActivityTable.svelte`

## activity.filter-by-person
**Task:** Find movies by an actor or director
**Where:** Library → table → **Cast** column (desktop grid only)
**Steps:**
1. Show the **Cast** column: it is part of the default columns while Movie is the only ticked type, and otherwise comes from the **Columns** dialog.
2. Select a person's name in a Cast cell. The table narrows to movies crediting that person, and a **Person** chip with their name appears.
3. Select the **x** on that chip, or **Clear all**, to undo it.
**Notes:** Directors are marked "dir." and "+N" counts people not listed in the cell; hover the cell for the full list. You can also type a name in the search box, which searches Cast and Director while Movie is among the ticked types, or in the **Cast** column's funnel.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/utils/formatting.ts`, `frontend/src/lib/utils/grid-config.ts`, `frontend/src/lib/components/FilterChips.svelte`

## activity.sort-content
**Task:** Sort content by one or more columns
**Where:** Library → table column headers, or **Edit sorts** in the bar below the table
**Steps:**
1. Select a column header to sort by it, or shift-click more headers to add columns to the sort.
2. Or select **Edit sorts** to open the **Sort by** dialog: pick a column and **Asc** or **Desc** on each row (below 640px wide the words are replaced by an arrow you select to flip the direction), use the up and down arrows to change priority, add a row with **Add sort column**, remove one with its **x**, and select **Done** when finished. Changes apply as you make them.
3. Select **Clear sorts** to return to the default order (most recently updated first).
**Not supported:** Sorting by Category, Genre, Cast, Tags, Description, Editions, Budget, Votes, Collection, Synopsis or TMDB ID. Published, Pages, Book rating and Readers sort in Loaded mode only, not in All Items mode.
**Notes:** **Edit sorts** and **Clear sorts** work the same in both data modes; below 768px wide they show as icons without text. In Loaded mode a sort covers the loaded rows only; in All Items mode it covers the whole library.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/components/SortPickerDialog.svelte`, `frontend/src/lib/utils/grid-config.ts`

## activity.choose-columns
**Task:** Choose which table columns are shown
**Where:** Library → table → **Columns** button in the bar below the table (desktop grid only)
**Steps:**
1. Select **Columns** to open the dialog.
2. Tick or untick columns; each change applies at once and is saved.
3. Select **Reset to default columns** (shown once you have saved a setup) to go back to the defaults for the current column set, then select **Done**.
**Not supported:** Hiding the **Item** column or the perspective column, which always show and stay pinned at the left when you scroll sideways. Saving column choices to your account or syncing them between devices. The **Columns** button is not shown on narrow screens, where cards replace the table.
**Notes:** Choices are saved in this browser only, separately for the Movie, Book and standard column sets, and they survive a refresh. Until you change a set, its default columns show. Some columns are available only here, such as **User**, **Updated** and **Date Added**.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ColumnPickerDialog.svelte`, `frontend/src/lib/utils/columnLayouts.ts`, `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/utils/grid-config.ts`

## activity.data-mode
**Task:** Switch between "Loaded" and "All Items" data mode
**Where:** Library → bar below the table → data-mode toggle
**Steps:**
1. **Loaded [N] Items** is selected by default. It fetches the 50 most recently updated items that match your Type filter and search; N counts the rows loaded; in the desktop table it follows column filters, so a filter that leaves 7 of the 50 loaded rows reads "Loaded 7 Items" (the card list on narrow screens keeps showing the loaded count). Other filters and sorting then work on those rows only, without another server request.
2. Select **All Items** to sort, filter and page through the whole library on the server (see activity.paginate).
**Notes:** Search and the Type filter go to the server in both modes, so in Loaded mode a new search or Type choice loads a fresh batch. "N total" next to the toggle counts every item that matches on the server.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/DataModeToggle.svelte`, `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/queries/content/activityList.ts`, `frontend/src/lib/utils/gridUrlState.ts`

## activity.paginate
**Task:** Move between pages or change how many rows show per page
**Where:** Library → bar below the table (All Items mode)
**Steps:**
1. Select **All Items** in the data-mode toggle.
2. Use **Previous** and **Next** to move between pages; "Page X of Y" shows where you are.
3. On windows at least 768px wide, choose 10, 25 or 50 in the **Page size:** menu.
**Not supported:** Paging in Loaded mode, which shows only its first 50 rows; switch to All Items to see more.
**Notes:** The page size starts at 10. On screens under 640px wide, **Previous** and **Next** show as < and >.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/queries/content/activityList.ts`, `frontend/src/lib/utils/gridUrlState.ts`

## activity.open-details
**Task:** Open a content item's details
**Where:** Library → a row's **Item** cell (table) or a card (narrow screens)
**Steps:**
1. Select an item's title or the rest of its Item cell, or select a card's title.
2. The details dialog opens. Every type shows **Perspectives**, **Avg. Rating**, "Last updated in Perspectize", **Compare** and **Add to plan** buttons, a link to the source (not for Bible passages) and, for items that came through an import, an "Imported from" link.
3. The other tiles depend on the type. A YouTube video shows Views, Likes, Duration, Date, Category and Date Added, with its description and tags. A movie shows TMDB Score, Duration, Released, Rated, Director(s), Genre, Budget, Box office and Vs. budget, with synopsis, top cast and keywords. A book shows Rating, Rating count, Pages, Published, Editions, Want to read, Reading now and Have read, with description, related works and tags. A Bible passage shows its text, a position bar and links.
4. To open the original instead, select the thumbnail: it opens the video, the TMDB page or the Open Library page in a new tab.
**Not supported:** Editing an item's title or description, apart from the one-time passage title below, and deleting an item.
**Notes:** **Update source data** appears for YouTube videos and books (not movies or passages) and re-fetches their details from the source; right after an update it is disabled and a message says when to check back. A Bible passage with no title yet shows an "Add a title (optional, set once)" field and **Save title**. "Imported from" shows only for items that came through an import. Your perspective is added or edited from the perspective column at the table's left edge (a **+** or glasses icon), which is its own area. The toast after adding a passage, movie or book offers a "Go to passage", "Go to movie" or "Go to book" button (a video that was already added offers "Go to video"), which opens the Library with that item's details already showing.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityDetailsModal.svelte`, `frontend/src/lib/components/MovieTiles.svelte`, `frontend/src/lib/components/MovieBody.svelte`, `frontend/src/lib/components/BookTiles.svelte`, `frontend/src/lib/components/BookBody.svelte`, `frontend/src/lib/utils/activityItemCellRenderer.ts`, `frontend/src/lib/components/ActivityCardList.svelte`, `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/queries/content/useUpdateSourceData.ts`, `frontend/src/lib/utils/contentLinks.ts`

## activity.hover-cell-details
**Task:** See a full value from a table cell, or copy it
**Where:** Library → table → hovering a cell (desktop grid only)
**Steps:**
1. Rest the pointer on a cell for a moment, for example Item, Description, Views or Tags.
2. A popover shows the full value, such as the exact view count or the whole description, with a copy icon.
3. For list cells (Tags, Cast, Author) the popover shows chips: select some, then choose **Copy selected**, or choose **Copy all**.
**Not supported:** Hover popovers on the narrow-screen card list, and on the perspective column.
**Notes:** Description and Synopsis are not in the default columns; show them with **Columns**. Resting on a column heading for about a second shows a short description of that column.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/CellPopover.svelte`, `frontend/src/lib/utils/tooltipHover.ts`, `frontend/src/lib/utils/activityTooltipSpecs.ts`, `frontend/src/lib/components/ActivityTable.svelte`

## activity.set-category
**Task:** Set an item's category
**Where:** Library → table → **Category** cell (desktop grid only)
**Steps:**
1. Select a **Category** cell (it shows the category name, or a **+** when empty).
2. Type at least 2 characters in the "Search Wikidata..." box and select a result.
3. A toast confirms with "Category set: …".
**Not supported:** Changing a category from the narrow-screen card list or from the details dialog, which only display it.
**Notes:** The **Category** column is part of the standard columns; otherwise add it with **Columns**. Selecting the underlined category name opens its Wikipedia page instead of the picker.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/components/CategoryTypeahead.svelte`, `frontend/src/lib/queries/categories/useSetPrimaryCategory.ts`, `frontend/src/lib/utils/formatting.ts`

## activity.add-to-plan
**Task:** Add a Library item to your plan
**Where:** Library → item details dialog → **Add to plan**, or the **Add to plan** icon on a card (narrow screens)
**Steps:**
1. Open the item's details and select **Add to plan**; on a narrow screen you can select the **Add to plan** icon on its card instead.
2. In the **Add Todo** dialog the item is already filled in. Choose the **Action** and set any other fields you want, such as Priority, Status, dates, Privacy or List.
3. Select **Save**.
**Not supported:** An **Add to plan** icon on desktop table rows; use the details dialog.
**Notes:** Plan items are managed on the **Plan** page in the header.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/plan/AddToPlanButton.svelte`, `frontend/src/lib/components/plan/AddToPlanDialog.svelte`, `frontend/src/lib/components/plan/TodoDialog.svelte`, `frontend/src/lib/components/ActivityDetailsModal.svelte`, `frontend/src/lib/components/ActivityCardList.svelte`

## activity.narrow-screens
**Task:** Use the Library on a phone or narrow window
**Where:** Library on a screen narrower than about 860px
**Steps:**
1. Stacked cards replace the table; each shows a thumbnail, the title and a few facts such as channel and duration.
2. Select a card's title to open its details, or its thumbnail to open the original in a new tab.
3. Select the **+** (**Add a perspective**) or glasses (**Edit your perspective**) button to write or edit your perspective, or the **Add to plan** icon to plan the item.
4. Search, **Mine**, filter chips, **Edit sorts**, **Clear sorts** and the data-mode toggle work as on a wide screen.
**Not supported:** Column filter menus, the **Columns** button, hover popovers and category editing, which belong to the desktop table.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityCardList.svelte`, `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/utils/responsive.svelte.ts`
