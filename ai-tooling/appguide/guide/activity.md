# Activity

**Route:** /
**Summary:** Activity is the home page: a feed of recently updated content (currently YouTube videos and Bible passages). It's where you browse what's been added or perspectived, filter and sort it, switch between an "All Content" table and a "By User" feed, and open an item's details before adding or comparing perspectives elsewhere.

## activity.switch-view
**Task:** Switch between the content table and the by-user activity feed
**Where:** Activity page header
**Steps:**
1. Select **All Content** to see every content item in a sortable, filterable table (or stacked cards on narrow screens).
2. Select **By User** to see a feed of recent additions and perspectives grouped by who did them.
**Notes:** This choice is session-only — it isn't saved to the URL or your account, so it resets on refresh.
**Sign-in required:** yes
**Source:** `frontend/src/routes/+page.svelte`

## activity.search-content
**Task:** Search for content by keyword
**Where:** Activity page header (All Content view) → search box
**Steps:**
1. In **All Content** view, type into the "Search content..." box.
2. Select the sliders icon next to the search box to choose which fields are searched: **Title**, **Description**, **Channel**, **Tags**.
**Not supported:** Searching is only available in "All Content" view; the "By User" feed has no search box.
**Notes:** At least one field must stay checked — unchecking the last one is a no-op. Search is debounced and updates the page's URL.
**Sign-in required:** yes
**Source:** `frontend/src/routes/+page.svelte`, `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/utils/gridUrlState.ts`

## activity.filter-columns
**Task:** Filter content by a column's value
**Where:** Activity page → All Content table → column header filter menus (desktop grid only)
**Steps:**
1. Open a column's filter menu from its header (e.g. Type, Length, Views, Date, Channel, Tags) and set a condition.
2. Active filters appear as removable chips above the table; select the **x** on a chip to remove that filter, or **Clear all** to remove every filter.
**Not supported:** The mobile card list (narrow screens, grid replaced by cards) has no column filter menus of its own, but filters already set from the URL still apply to it in "Loaded" data mode.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/components/FilterChips.svelte`

## activity.sort-content
**Task:** Sort content by one or more columns
**Where:** Activity page → All Content table → column headers, or the "Edit sorts" button below the table
**Steps:**
1. Select a column header to sort by it (or shift-click additional headers to add more columns to the sort).
2. Or select **Edit sorts** to open a dialog: choose a column and direction (Asc/Desc) per row, reorder rows to change priority, add rows with **Add sort column**, or remove one with its **x**.
3. Select **Clear sorts** to reset to the default order.
**Notes:** "Edit sorts" works the same way on mobile and desktop, and in both data modes.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/components/SortPickerDialog.svelte`

## activity.choose-columns
**Task:** Choose which table columns are shown
**Where:** Activity page → All Content table → **Columns** button below the table
**Steps:**
1. Select **Columns** to open the dialog.
2. Check or uncheck columns to show or hide them. Admins additionally see an "Internal" group of columns.
**Not supported:** The **Columns** button isn't shown in mobile card mode (the grid is replaced by cards, which have a fixed layout).
**Notes:** Column choices last only for the current session — refreshing the page returns to the default responsive columns. Before you make a manual choice, visible columns adjust automatically to your screen width.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/components/ColumnPickerDialog.svelte`, `frontend/src/lib/utils/grid-config.ts`

## activity.data-mode
**Task:** Switch between "All Items" and "Loaded" data mode
**Where:** Activity page → All Content table → data-mode toggle below the table
**Steps:**
1. Select **All Items** to sort, filter, and paginate against the full content set on the server.
2. Select **Loaded [N] Items** to sort and filter only within the batch of rows already fetched, without another server request.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/DataModeToggle.svelte`, `frontend/src/lib/components/ActivityTable.svelte`

## activity.open-details
**Task:** Open a content item's details
**Where:** Activity page → a row's Item cell (table) or a card (card list / By User feed)
**Steps:**
1. Select an item's title/thumbnail area (the "Item" cell in the table, or the card in mobile/By User view).
2. The details modal shows the item's stats (perspective count, average rating, and for videos: views, likes, length, publish date, category, date added), its description and tags, and links to open the source or **Compare** perspectives on it.
**Notes:** For a YouTube video, a **Update source data** button re-fetches title/description/stats from YouTube, subject to a cooldown shown in the modal. Adding content and creating/editing a perspective happen from elsewhere (the Perspectize column / card affordance, and their own areas) — this modal itself doesn't edit anything except, for a Bible passage with no title yet, an optional one-time title field.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityDetailsModal.svelte`, `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/components/ActivityCardList.svelte`, `frontend/src/lib/components/UserActivityView.svelte`

## activity.hover-cell-details
**Task:** See a full value that's truncated in the table
**Where:** Activity page → All Content table → hovering a cell (desktop grid only)
**Steps:**
1. Hover over a cell whose value is cut off (e.g. Description, Tags).
2. A popover shows the full text (or, for multi-value cells like Tags, a list of chips you can select and copy).
**Not supported:** Hover popovers only appear on the desktop AG Grid table, not on the mobile card list.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/CellPopover.svelte`, `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/utils/tooltipHover.ts`

## activity.by-user-privacy
**Task:** Include or exclude your own private perspectives from the By User feed
**Where:** Activity page → By User view → "Include my private perspectives" toggle
**Steps:**
1. Switch to **By User** view.
2. Use the **Include my private perspectives** switch (only shown when signed in) to add or remove your own private perspectives from the feed.
**Notes:** This only affects your own private perspectives — other users' private perspectives are never shown to you, regardless of this toggle.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/UserActivityView.svelte`
