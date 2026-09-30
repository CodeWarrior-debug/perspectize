# Perspectives

**Route:** (opened as a dialog, not a page — from Activity or Discover)
**Summary:** A perspective is your take on a piece of content: an overall thumbs up/down, ratings on Quality/Agreement/Importance/Confidence (plus any custom fields you add), feelings, a written review, and a public/private setting. You open the same dialog to add a first perspective or to edit one you already shared.

## perspectives.open
**Task:** Add your perspective on a piece of content
**Where:** Activity → a row's perspective icon column, or Activity's mobile card list → **Add a perspective**, or Discover → an added video's card → **Add perspective**
**Steps:**
1. From Activity, select the perspective icon in a row (shows a "+" if you haven't rated this content yet). On the mobile card list (no grid), select **Add a perspective** instead.
2. On Discover, after adding a video to Perspectize, select **Add perspective** on its card.
3. The **Add perspective** dialog opens for that content.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/components/ActivityCardList.svelte`, `frontend/src/lib/components/discover/VideoCard.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.edit
**Task:** Edit a perspective you've already shared
**Where:** Activity → a row's perspective icon column (now shown as glasses), or Activity's mobile card list → **Edit your perspective**
**Steps:**
1. Select the perspective icon (Activity grid) or **Edit your perspective** (mobile card list) on a row where you already have a perspective.
2. The dialog opens titled **Edit perspective**, pre-filled with your existing ratings, thumbs, review, custom fields, feelings, and privacy setting.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/components/ActivityCardList.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.thumbs
**Task:** Give your overall take: thumbs up or down
**Where:** Add/Edit perspective dialog → **Overall**
**Steps:**
1. Open the perspective editor for a piece of content.
2. Select the thumbs-down or thumbs-up icon under **Overall**.
3. Select the same icon again to clear it.
**Notes:** Only one of thumbs up/down can be selected at a time.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Thumbs.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.rate
**Task:** Rate quality, agreement, importance, and confidence
**Where:** Add/Edit perspective dialog → ratings grid
**Steps:**
1. Open the perspective editor for a piece of content.
2. For **Quality**, **Agreement**, **Importance**, or **Confidence**, use the up/down arrows next to the number, type a value directly into the number field, or select a point along the bar underneath it to set that value.
**Notes:** Each rating runs 0–10 and shows gray/unset until you interact with it; the bar's color changes with the value (low, mid, high).
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/RatingInput.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.add-field
**Task:** Add another rating dimension beyond the default four
**Where:** Add/Edit perspective dialog → **Add a field — e.g. clarity** search box
**Steps:**
1. Open the perspective editor for a piece of content.
2. Type in the **Add a field — e.g. clarity** box.
3. Select a suggested field (e.g. Clarity, Depth, Originality, Entertainment, Rigor, Relevance, Bias, Actionability) from the results, or select **Create "<your text>"** to add a custom field with that name.
4. The new field appears in the ratings grid with its own stepper and bar.
**Notes:** A field you've already added isn't offered again.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/AddFieldSearch.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.remove-field
**Task:** Remove a rating field from a perspective
**Where:** Add/Edit perspective dialog → ratings grid
**Steps:**
1. Select the small "x" button next to a field's stepper.
**Notes:** This works for the four default fields (Quality, Agreement, Importance, Confidence) as well as any field you added — removing a default field clears its value and hides its row; it can be added back later through **Add a field**.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/RatingInput.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.feelings
**Task:** Add feelings to your perspective
**Where:** Add/Edit perspective dialog → **Add a feeling**
**Steps:**
1. Select **Add a feeling** to open the feel wheel.
2. Select an emoji on the wheel, or type in the **Search more feelings** box (e.g. "nervous") and select a result, to add that feeling.
3. For each added feeling, set its **Intensity** and optionally type a note.
4. Select the "x" next to a listed feeling, or select its emoji on the wheel again, to remove it.
**Not supported:** Adding more than 10 feelings to one perspective.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/FeelWheel.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.review
**Task:** Write a review of your take
**Where:** Add/Edit perspective dialog → comment box next to **Overall**
**Steps:**
1. Select the comment box (shows "Anything to write about your take?" when empty) and type.
2. Use its toolbar for bold, italic, underline, bullet or numbered lists, headings, links, and images (added by URL); on desktop, table insertion and row/column/table editing are also available.
3. Select the **Expand comment** icon to grow the writing area, or **Collapse comment** to shrink it back.
**Not supported:** Uploading image files directly — images are added by URL only. Code blocks, blockquotes, and strikethrough formatting.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PerspectiveEditor.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.privacy
**Task:** Make a perspective private or public
**Where:** Add/Edit perspective dialog → **Private** toggle
**Steps:**
1. Turn on the **Private** switch so only you can see this perspective.
2. Turn it off to make it public again.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.save
**Task:** Save your perspective
**Where:** Add/Edit perspective dialog → **Save perspective**
**Steps:**
1. Fill in at least one field (a rating, thumbs, review, custom field, or feeling).
2. Select **Save perspective**.
**Not supported:** Saving an entirely empty perspective (you'll see "Please fill in at least one field"). Deleting a perspective once it's saved.
**Notes:** When editing, a field you've cleared is saved as cleared; a brand-new perspective only sends the fields you actually filled in.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PerspectivePopover.svelte`, `frontend/src/lib/queries/perspectives/useCreatePerspective.ts`, `frontend/src/lib/queries/perspectives/useUpdatePerspective.ts`

## perspectives.draft
**Task:** Recover a review you were writing but didn't save
**Where:** Add/Edit perspective dialog → notice above the ratings grid
**Steps:**
1. Reopen the perspective editor for the same content: an unsaved comment (saved automatically about a second after you stop typing) is restored into the comment box, with a "Restored unsaved draft" notice.
2. Select **Discard draft** to drop it and revert to your last saved review instead.
**Notes:** Drafts are stored on your device only, per content item and per user.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PerspectivePopover.svelte`, `frontend/src/lib/utils/perspectiveDraft.ts`
