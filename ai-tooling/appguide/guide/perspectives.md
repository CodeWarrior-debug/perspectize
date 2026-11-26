# Perspectives

**Route:** (opened as a dialog, not a page — from the Library, Discover and Plan)
**Summary:** A perspective is your take on a piece of content: an overall thumbs up/down, ratings on Quality/Agreement/Importance/Confidence (plus any custom fields you add), feelings, a written review, and a public/private setting. One dialog adds a first perspective, edits one you already shared, or deletes it. It opens from the Library, from Discover's **In Library** cards and from the Plan page; on phone-width screens it appears as a bottom sheet.

## perspectives.open
**Task:** Add your perspective on a piece of content
**Where:** Library → the perspective column, or Discover → an **In Library** card → **Add perspective**, or Plan → a Todo's **Perspective** column
**Steps:**
1. In the Library table, select the perspective column's cell on an item's row. It shows a **+** (tooltip "Add a perspective") when you have no perspective on that item yet. On narrow screens, where cards replace the table, select the **+** button (**Add a perspective**) on the item's card instead.
2. On Discover, find a result marked **In Library** (video, movie and book cards all show this) and select **Add perspective**.
3. On the Plan page, select **Add** in the **Perspective** column of a Todo. On narrow screens each Todo card has an **Add perspective** button instead.
4. The **Add perspective** dialog opens for that item.
**Notes:** The item has to be in the Library first. A Todo that isn't linked to content has no **Add**, and its card button is disabled with "Link this to content first". Discover's button always opens a blank dialog, so change a perspective you already have from the Library or Plan (see perspectives.edit). The Getting started coach has its own **Leave a perspective** button (see getting-started.onboarding-coach).
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/components/ActivityCardList.svelte`, `frontend/src/lib/utils/formatting.ts`, `frontend/src/lib/components/discover/LibraryStatus.svelte`, `frontend/src/lib/components/plan/PlanTable.svelte`, `frontend/src/lib/components/plan/PlanBoard.svelte`, `frontend/src/lib/utils/plan-grid-config.ts`, `frontend/src/lib/utils/plan-todo-helpers.ts`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.edit
**Task:** Edit a perspective you've already shared
**Where:** Library → the perspective column (a glasses icon on rows where you have one), or Plan → a Todo's **Add** / **Add perspective** control
**Steps:**
1. In the Library table, select the glasses icon on a row where you already have a perspective (tooltip "Edit your perspective"). On narrow screens, select the glasses button (**Edit your perspective**) on the item's card.
2. On the Plan page, the same **Add** control (or **Add perspective** on a card) opens your existing perspective when you have one on that Todo's content.
3. The dialog opens titled **Edit perspective**, pre-filled with your existing ratings, thumbs, review, custom fields, feelings and privacy setting.
**Notes:** Discover's **Add perspective** always opens a blank **Add perspective** dialog, so it is not the way to edit.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/components/ActivityCardList.svelte`, `frontend/src/lib/components/plan/PlanBoard.svelte`, `frontend/src/lib/components/discover/LibraryStatus.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.thumbs
**Task:** Give your overall take: thumbs up or down
**Where:** Add/Edit perspective dialog → **Overall**
**Steps:**
1. Open the perspective dialog for a piece of content.
2. Under **Overall**, select **Thumbs down** (the left icon) or **Thumbs up** (the right icon).
3. Select the same icon again to clear it.
**Notes:** Only one of thumbs up/down can be selected at a time; selecting the other icon switches the choice.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Thumbs.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.rate
**Task:** Rate quality, agreement, importance, and confidence
**Where:** Add/Edit perspective dialog → ratings grid
**Steps:**
1. Open the perspective dialog for a piece of content.
2. For **Quality**, **Agreement**, **Importance** or **Confidence**, use the up and down arrows beside the number (each click moves it by 0.25, and holding repeats), type a value into the number field, or select a point along the bar underneath to set that value.
**Notes:** Each rating runs from 0 to 10. An untouched rating shows a grey 5.000 and is not saved until you set it. The bar's colour changes with the value: low (below 3), middle, or high (above 7).
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/RatingInput.svelte`, `frontend/src/lib/utils/ratings.ts`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.add-field
**Task:** Add another rating dimension beyond the default four
**Where:** Add/Edit perspective dialog → **Add a field — e.g. clarity** search box
**Steps:**
1. Open the perspective dialog for a piece of content.
2. Select the **Add a field — e.g. clarity** box and type in it.
3. Select a suggested field (Originality, Clarity, Depth, Entertainment, Rigor, Relevance, Bias or Actionability) from the results, or select **Create "<your text>"** to add a custom field with that name.
4. The new field appears in the ratings grid with its own stepper and bar; rate it as in perspectives.rate.
**Notes:** A field you've already added isn't offered again. A default field you removed (see perspectives.remove-field) is offered again here.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/AddFieldSearch.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.remove-field
**Task:** Remove a rating field from a perspective
**Where:** Add/Edit perspective dialog → ratings grid
**Steps:**
1. Select the small **x** beside a field's stepper (its label reads "Remove" plus the field name, such as **Remove Quality**).
**Notes:** This works for the four default fields (Quality, Agreement, Importance, Confidence) as well as any field you added. Removing a default field clears its value and hides its row; add it back through **Add a field**.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/RatingInput.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.feelings
**Task:** Add feelings to your perspective
**Where:** Add/Edit perspective dialog → **Add a feeling**
**Steps:**
1. Select **Add a feeling** to open the feel wheel. It is already open when you edit a perspective that has feelings.
2. Select an emoji on the wheel, or type in the **Search more feelings — e.g. nervous** box and select a result, to add that feeling.
3. For each added feeling, set its **Intensity** (a stepper like the ratings) and optionally write in the "Why / nuance / observations…" note box.
4. Select the **x** beside a listed feeling, or select its emoji on the wheel again, to remove it.
**Not supported:** Adding more than 10 feelings to one perspective. At 10 the search and the unselected wheel emojis are disabled (selected ones stay active so you can remove them) and the dialog says "Up to 10 feelings per perspective".
**Notes:** A feeling alone is enough to save a perspective. A feeling whose intensity you leave unset is saved with a neutral 5.000.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/FeelWheel.svelte`, `frontend/src/lib/data/feelings.ts`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.review
**Task:** Write a review of your take
**Where:** Add/Edit perspective dialog → comment box next to **Overall**
**Steps:**
1. Select the comment box (it reads "Anything to write about your take?" while empty) and type. On phone-width screens (under 640px) the box first appears as a button reading **Add a comment**, or a preview of your review text; select it to open the editor.
2. Use the toolbar: the text-style menu (**Paragraph**, **Heading 2**, **Heading 3**), Bold, Italic, Underline, Bullet list, Numbered list, Link and Image. Link and Image each ask for a URL in a browser prompt; confirming an empty Link URL removes the link. On screens 640px or wider the toolbar also has Insert table, Add row, Add column and Delete table.
3. Select the **Expand comment** icon at the toolbar's right end to enlarge the writing area (on a wide screen the dialog widens too), or **Collapse comment** to shrink it back.
**Not supported:** Uploading image files: images are added by URL only. Code blocks, inline code, blockquotes, strikethrough and horizontal rules.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/CommentsEditor.svelte`, `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.privacy
**Task:** Make a perspective private or public
**Where:** Add/Edit perspective dialog → **Private** toggle
**Steps:**
1. Turn on the **Private** switch ("Only you can see private perspectives") so only you can see this perspective.
2. Turn it off to make it public.
**Notes:** A new perspective is public until you turn **Private** on. When you edit, the switch shows the perspective's current setting.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PerspectivePopover.svelte`

## perspectives.save
**Task:** Save your perspective
**Where:** Add/Edit perspective dialog → **Save perspective**
**Steps:**
1. Fill in at least one field (a rating, thumbs, review, custom field or feeling).
2. Select **Save perspective**. The dialog closes at once, and a toast reads "Perspective added" or "Perspective updated" when the server has saved it.
**Not supported:** Saving an entirely empty perspective (you'll see "Please fill in at least one field").
**Notes:** **Cancel** closes the dialog without saving. If the save fails, a toast reads "Failed to add perspective." or "Failed to update perspective." with a **Retry** button, and your review stays available as a draft (see perspectives.draft). When editing, a field you've cleared is saved as cleared; a brand-new perspective only sends the fields you actually filled in. Within a moment of creating a perspective, saving or deleting it again shows "Still saving your perspective — try again in a moment".
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PerspectivePopover.svelte`, `frontend/src/lib/queries/perspectives/useCreatePerspective.ts`, `frontend/src/lib/queries/perspectives/useUpdatePerspective.ts`

## perspectives.delete
**Task:** Delete a perspective you've shared
**Where:** Edit perspective dialog → trash icon left of **Cancel**
**Steps:**
1. Open your perspective for editing (see perspectives.edit).
2. Select the trash icon (**Delete perspective**) at the left of the bottom row.
3. The buttons are replaced by "Delete this perspective? This can't be undone." Select **Delete** to confirm, or **Keep it** to back out.
4. The dialog closes and a toast reads "Perspective deleted".
**Not supported:** Restoring a deleted perspective.
**Notes:** The trash icon shows only when you edit your own perspective, so the blank dialog that Discover's **Add perspective** opens never has it. Deleting also discards any unsaved review draft for that item.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PerspectivePopover.svelte`, `frontend/src/lib/queries/perspectives/useDeletePerspective.ts`

## perspectives.mark-todo-done
**Task:** Mark a Plan Todo done right after saving a perspective
**Where:** The "Mark this Todo done?" toast after **Save perspective**
**Steps:**
1. Save a perspective on an item that has a Todo on your Plan whose action is **Consume** or **Review** and whose status is **Not started** or **In progress**.
2. When the save succeeds, a toast asks "Mark this Todo done?" with two buttons.
3. Select **Done + 100%** to set the Todo to done and its percent complete to 100, or **Done, keep %** to set it to done and leave its percent as it is.
**Notes:** Either button also fills an empty end date with today. The toast stays up for about 4 seconds; ignore it to leave the Todo as it is. It covers every Consume or Review Todo for that item that is Not started or In progress.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PerspectivePopover.svelte`, `frontend/src/lib/utils/plan-todo-helpers.ts`, `frontend/src/lib/utils/toast.ts`

## perspectives.draft
**Task:** Recover a review you were writing but didn't save
**Where:** Add/Edit perspective dialog → the "Restored unsaved draft" notice
**Steps:**
1. While you write, the review is saved as a draft in this browser about a second after you stop typing, and again when you close the dialog.
2. Reopen the dialog for the same item: the draft is restored into the comment box with a "Restored unsaved draft" notice.
3. Select **Discard draft** to drop it and revert to your last saved review (empty for a new perspective).
**Notes:** Only the written review is kept, not ratings, thumbs, feelings or privacy. Drafts are stored per item and per user. A draft started from an older saved review than the one now saved is dropped instead of restored, and a successful save clears the draft.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PerspectivePopover.svelte`, `frontend/src/lib/utils/perspectiveDraft.ts`
