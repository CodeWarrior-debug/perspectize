# Compare Perspectives

**Route:** /compare
**Summary:** Compare puts two people's perspectives on the same piece of content (a video or Bible passage) side by side: their overall thumbs, their ratings on each dimension, and their written reviews. You come here from a content item's "Compare" button, or from the header's Compare link if you already have two perspectives in mind.

## compare.open
**Task:** Open the Compare page for a piece of content
**Where:** Activity details / a video card → **Compare** button
**Steps:**
1. From Activity, open a content item's details (or a Discover video card) that has at least one shared perspective.
2. Select **Compare**.
**Not supported:** Opening Compare with no content selected shows a placeholder ("Choose something to compare") rather than a comparison — you must come from a content item's Compare button, or a link that already includes it in the address.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityDetailsModal.svelte`, `frontend/src/lib/components/discover/VideoCard.svelte`, `frontend/src/routes/compare/+page.svelte`

## compare.pick-two
**Task:** Compare two perspectives on the same content
**Where:** Compare page → picker row
**Steps:**
1. Open **Compare** for a piece of content that has perspectives from more than one person.
2. Use the left and right dropdowns in the picker row to choose which two perspectives to compare.
**Not supported:** Comparing more than two perspectives at once. The two dropdowns can't select the same perspective (each list excludes whichever one is already picked on the other side).
**Notes:** If you've shared a perspective on this content, it's picked as the left side by default; the right side defaults to whichever other perspective was most recently updated. Only perspectives already visible to you (privacy-scoped by the server) appear as options.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Compare.svelte`, `frontend/src/lib/components/ComparePickerRow.svelte`

## compare.swap-sides
**Task:** Swap which perspective is on the left vs. the right
**Where:** Compare page → picker row → swap button
**Steps:**
1. With two perspectives selected, select the swap icon between the two pickers (labeled "Swap sides").
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ComparePickerRow.svelte`, `frontend/src/lib/components/Compare.svelte`

## compare.read-results
**Task:** See where two perspectives agree, diverge, or conflict
**Where:** Compare page, below the picker row
**Steps:**
1. Pick two perspectives to compare.
2. Check the **Overall** row for whether both thumbs (up/down) agree.
3. Check the rating table in the middle column: each dimension (Quality, Agreement, Importance, Confidence, and any custom fields both perspectives filled in) shows both values, the percent difference, and a status label (Similar, Diverges, or Conflict).
4. Look under "Filled in differently" for any dimension only one side rated.
5. Look for "Matching feelings" (shared emoji reactions) above the rating rows, and "Unique feelings" under each side's written review.
6. Read each side's full written review in its own column.
**Notes:** The counts below the picker row ("similar", "diverge", "conflict") summarize the rating table's statuses.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Compare.svelte`, `frontend/src/lib/components/CompareOverallRow.svelte`, `frontend/src/lib/components/CompareRatingTable.svelte`, `frontend/src/lib/components/CompareTakeColumn.svelte`, `frontend/src/lib/utils/comparePerspectives.ts`

## compare.sort-differences
**Task:** Sort the rating rows by how similar or different they are
**Where:** Compare page → rating table → sort toggle
**Steps:**
1. With two perspectives compared, select the sort toggle above the rating rows (reads "Most similar first" or "Most similar last").
2. Select it again to flip the order.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/CompareRatingTable.svelte`, `frontend/src/lib/components/Compare.svelte`
