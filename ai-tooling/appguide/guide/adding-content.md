# Adding Content

**Route:** / (header)
**Summary:** Adding Content covers getting a YouTube video or a Bible passage into your library so you (and others) can share perspectives on it. You add content from the **Add Content** control in the header, available whenever you're signed in, or from the "Add video" step of the getting-started checklist for a new account. Perspectives themselves — writing your take on something you've added — are a separate area.

## adding-content.open-add-content
**Task:** Open the form for adding a video or Bible passage
**Where:** Header → **Add Content** button
**Steps:**
1. Select **Add Content** in the header (visible when signed in).
2. On a narrow screen this opens as a dialog; on a wider screen it opens as a popover. Both show the same fields: a link/reference input, and a type indicator.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Header.svelte`, `frontend/src/lib/components/AddContentPopover.svelte`, `frontend/src/lib/components/FormPopover.svelte`

## adding-content.add-youtube-video
**Task:** Add a YouTube video to your library
**Where:** Add Content form → link/reference field
**Steps:**
1. Open **Add Content**.
2. Paste a YouTube URL into the "Link or reference" field (or select the paste-from-clipboard icon inside the field). Supported forms include `youtube.com/watch`, `youtube.com/shorts`, `youtu.be/...`, and `youtube-nocookie.com/embed/...` links.
3. The type indicator shows "Detected: YouTube" once the input is recognized; you can instead pick **YouTube** from the type dropdown yourself.
4. Select **Add**.
**Not supported:** A non-YouTube link, or text that doesn't parse as a YouTube URL, blocks submission with "Please enter a valid YouTube URL".
**Notes:** If the video was already added by anyone, submitting shows "This video has already been added" instead of adding a duplicate; a genuinely new video shows "Added: {video title}".
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/AddContentPopover.svelte`, `frontend/src/lib/utils/youtube.ts`, `frontend/src/lib/utils/detectContentType.ts`, `frontend/src/lib/queries/content/useAddVideo.ts`

## adding-content.add-bible-passage
**Task:** Add a Bible passage to your library
**Where:** Add Content form → book/chapter/verse pickers
**Steps:**
1. Open **Add Content**.
2. Either type a reference like "John 3:16-18" (or paste a Bible Gateway URL) into the "Link or reference" field, or select **Bible passage** from the type dropdown to reveal the book/chapter/verse pickers directly.
3. Use the Book, Start chapter, Start verse, End chapter, and End verse dropdowns to set the exact passage. Changing the start updates the end to match until you deliberately change an end field yourself, so a single verse doesn't require setting the end fields separately.
4. Select **Add**.
**Not supported:** Submitting is blocked while the end of the range comes before its start ("The end of the passage can't come before its start.").
**Notes:** Only the book/chapter/verse numbers are sent to the server, which regenerates the canonical name and link — a pasted Bible Gateway URL's own text is never stored. Adding a passage that already exists in the library doesn't create a duplicate; it shows "Added: {passage title}" either way.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/AddContentPopover.svelte`, `frontend/src/lib/components/PassagePicker.svelte`, `frontend/src/lib/utils/passageRange.ts`, `frontend/src/lib/utils/detectContentType.ts`, `frontend/src/lib/queries/content/useAddPassage.ts`

## adding-content.switch-or-clear-type
**Task:** Change the detected type, or clear the form to start over
**Where:** Add Content form → type row (dropdown and clear buttons)
**Steps:**
1. With the Add Content form open, use the "Change type" dropdown to force **YouTube** or **Bible passage** regardless of what was auto-detected.
2. Select the **Type** button to clear only the current type's fields (keeping the chosen type).
3. Select the **All** button to clear the input, the chosen type, and any picker edits back to how the form looked when opened.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/AddContentPopover.svelte`

## adding-content.onboarding-add-video
**Task:** Add your first video from the getting-started checklist
**Where:** Getting-started coach (step 1 of 2) → **Add video** button
**Steps:**
1. In the "Getting started" checklist shown on a new account, select **Add video** on step 1.
2. Paste a YouTube URL into the dialog's "YouTube URL" field.
3. Select **Add Video**.
**Not supported:** This dialog only accepts a YouTube URL — there's no Bible passage or type picker here.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/onboarding/OnboardingCoach.svelte`, `frontend/src/lib/components/AddVideoDialog.svelte`, `frontend/src/lib/queries/content/useAddVideo.ts`
