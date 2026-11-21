# Compare Perspectives

**Route:** /compare
**Summary:** Compare puts two people's perspectives on the same piece of content (a video, movie, book or Bible passage) side by side: their overall thumbs, their ratings on each dimension and their written reviews. You come here from an item's **Compare** button, or from the header's **Compare** link, which lets you search for an item to compare.

## compare.open
**Task:** Open the Compare page for a specific item
**Where:** Library → an item's details dialog → **Compare**, or Discover → a result card marked "In Library" → **Compare**
**Steps:**
1. In the Library, select an item's title to open its details dialog, then select **Compare**. On Discover, find a result card that shows **In Library** and select its **Compare** button.
2. The Compare page opens on that item, and a banner under the "Compare perspectives" heading shows its title (and its length, when it has one).
**Notes:** The button is there for every item, whether or not anyone has shared a perspective on it yet. A Plan to-do that is linked to an item has a **View content** button in its dialog that opens the same details dialog. The **← Back to Library** link at the top of the Compare page returns to the Library. If the comparison fails to load, the page says "Failed to load this comparison." with a **Retry** button.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityDetailsModal.svelte`, `frontend/src/lib/components/discover/LibraryStatus.svelte`, `frontend/src/routes/compare/+page.svelte`, `frontend/src/lib/components/Compare.svelte`, `frontend/src/lib/components/plan/TodoDialog.svelte`

## compare.choose-content
**Task:** Find an item to compare when you open Compare from the header
**Where:** Header → **Compare** → "Choose something to compare"
**Steps:**
1. Select **Compare** in the header. With no item chosen, the page is headed "Choose something to compare".
2. To narrow the list, type in the search box (placeholder "Search Content Sources..."). The list updates after a short pause, and the clear button (an X icon labeled "Clear search") empties the box.
3. Select a row to open the comparison for that item.
**Notes:** The list shows only items that have more than one perspective visible to you, most recently updated first, and at most the first 40, so search to reach older ones. Each row shows the title, the channel when the item has one, a thumbnail for YouTube videos and a count such as "3 perspectives". When nothing qualifies, the page says "No content has more than one perspective yet." (or "No content matching your search has more than one perspective yet.") with a **Go to Library** button. If the list cannot load, it says "Couldn't load content. Please try again."
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Header.svelte`, `frontend/src/routes/compare/+page.svelte`, `frontend/src/lib/components/ComparePicker.svelte`, `frontend/src/lib/components/ContentSearchInput.svelte`

## compare.pick-two
**Task:** Compare two perspectives on the same content
**Where:** Compare page → picker row
**Steps:**
1. Open Compare for an item that at least two people have shared a perspective on.
2. Use the left and right dropdowns in the picker row to choose which two people's perspectives to compare. Each dropdown lists people by username ("You" for yourself) and leaves out whoever is chosen on the other side.
**Not supported:** Comparing more than two perspectives at once, comparing perspectives on two different items, and choosing the same person on both sides.
**Notes:** The left side starts on your own perspective when you have shared one on this item, and otherwise on the first person in the list. The right side starts on whichever other person updated their perspective most recently. You see public perspectives plus your own private one. With no perspectives the page says "No one has shared a perspective on this content yet.", and with only one it says "No other perspectives on this content yet to compare against." and shows no dropdowns. When two or more people's perspectives are visible and none is yours, a panel says "You haven't shared a perspective on this yet — these are all other people's takes." and offers **Add yours**, which opens the Library. After you change a dropdown or swap sides, the page address records the pair, so a copied link reopens the same comparison.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Compare.svelte`, `frontend/src/lib/components/ComparePickerRow.svelte`, `frontend/src/lib/queries/perspectives/index.ts`

## compare.swap-sides
**Task:** Swap which perspective is on the left vs. the right
**Where:** Compare page → picker row → the arrows button between the two dropdowns
**Steps:**
1. With two people selected, select the two-way arrows button between the dropdowns (its accessible name is "Swap sides").
**Notes:** Everything on the page flips with it: the thumbs, the left and right values and the two **Take** columns.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ComparePickerRow.svelte`, `frontend/src/lib/components/Compare.svelte`

## compare.read-results
**Task:** See where two perspectives agree, diverge, or conflict
**Where:** Compare page, below the picker row
**Steps:**
1. Pick two perspectives to compare.
2. Read the counts just below the picker row: "N similar", "N diverge" and "N conflict" summarize the rating rows, and "N only <name> rated" counts dimensions that only one of the two rated.
3. In the **Overall** panel, compare the two thumbs (up, down, or a dash for none). The status between them reads "Agree overall", "Different", "Only <name> gave a verdict" or "No verdict yet", and "N% aligned" next to the **Overall** heading is an alignment score across the shared dimensions (100% means no difference, rounded to the nearest percent).
4. Below that, the left person's **Take** column, the rating table and the right person's **Take** column sit side by side (they wrap onto separate rows on narrow screens). In the rating table, each dimension both people rated (Quality, Agreement, Importance, Confidence, and any custom field both filled in) shows its status (Similar, Diverges or Conflict), both values on a 0 to 10 scale and a bar between them: a filled dot marks the left person's value and a hollow ring the right person's.
5. At the bottom of the rating table, **Filled in differently** lists each dimension only one person rated, as "<dimension> — <name> filled in <value>".
6. At the top of the rating table, **Matching feelings** lists the emoji both people chose. Each **Take** column shows that person's written review (or "No written review.") and, under it, **Unique feelings** that only they chose.
**Notes:** Similar means the two values are within about 1 point of each other, Diverges within about 3 points, and Conflict more than 3 points apart. The status uses the exact values (with floating-point rounding), while the table shows one decimal, so a pair right at a boundary can read either way. When the two share no rated dimension, a one-line message replaces the counts (for example "Neither of you rated any shared dimensions." when neither of you rated anything), the **Overall** panel drops its "N% aligned" score, and any one-sided ratings still appear under **Filled in differently**. The headings **Overall**, **Take**, **Filled in differently** and **Unique feelings** display in capitals.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Compare.svelte`, `frontend/src/lib/components/CompareOverallRow.svelte`, `frontend/src/lib/components/CompareRatingTable.svelte`, `frontend/src/lib/components/CompareTakeColumn.svelte`, `frontend/src/lib/utils/comparePerspectives.ts`

## compare.sort-differences
**Task:** Sort the rating rows by how similar or different they are
**Where:** Compare page → rating table → sort toggle
**Steps:**
1. With two perspectives compared, find the sort toggle above the rating rows. It reads "Most similar first" by default, which lists the smallest differences first.
2. Select it to flip the order. It then reads "Most similar last", which lists the biggest differences first. Select it again to flip back.
**Notes:** The toggle shows only when the two people rated at least one dimension in common.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/CompareRatingTable.svelte`, `frontend/src/lib/components/Compare.svelte`, `frontend/src/lib/utils/comparePerspectives.ts`
