# Bible Passages

**Route:** (part of Activity's details view; no dedicated route)
**Summary:** When a piece of content is a Bible passage rather than a video, its details view shows the passage text itself, a bar showing where it falls in Scripture, links out to Bible Gateway and commentaries, and an optional original-language (interlinear) view. You come here by opening a Bible-passage content item's details.

## bible.read-passage
**Task:** Read a Bible passage's text
**Where:** A Bible-passage content item's details → passage text
**Steps:**
1. Open a Bible-passage content item's details (the header reads "Bible Passage").
2. Read the verse text below the title; each verse's number appears as a small superscript before it.
**Not supported:** Passages longer than 150 verses show no inline text at all (just a "too long to display here" message) — use the passage links to read it on Bible Gateway instead. Passages over 30 verses show only the first 10 verses until you select **Show full passage**.
**Notes:** Adding a passage as content happens elsewhere (see Adding Content); this covers reading one that's already added. The translation name and copyright line appear below the text.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PassageText.svelte`, `frontend/src/lib/components/ActivityDetailsModal.svelte`

## bible.position-bar
**Task:** See where a passage falls within the whole Bible
**Where:** Passage details, below the passage text
**Steps:**
1. Open a Bible-passage content item's details.
2. Below the passage text, view the bar: a filled segment shows the passage's span, and a thin marker on the bar shows where the New Testament begins.
3. Read the line below the bar for the verse range, its position out of the total verse count, and the book.
**Not supported:** The bar doesn't appear for a passage that spans more than one book.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PassagePositionBar.svelte`, `frontend/src/lib/utils/biblePosition.ts`

## bible.passage-links
**Task:** Open a passage on Bible Gateway, or find a commentary on it
**Where:** Passage details, below the position bar
**Steps:**
1. Open a Bible-passage content item's details.
2. Select **Read on Bible Gateway (CODE)** to open the passage in the currently chosen version on biblegateway.com in a new tab.
3. To read a commentary instead, expand **Commentaries** and choose **Matthew Henry (chapter)** or **Multiple commentators (verse)**, each opening BibleHub in a new tab.
**Not supported:** The on-platform translation (Berean Standard Bible) isn't one of the Bible Gateway version choices, since Bible Gateway doesn't host it — the link always uses whichever version you've picked instead. Other named commentators (e.g. Gill, Barnes, Calvin) aren't offered.
**Notes:** For a few version/book combinations (e.g. NABRE on Psalms) verse numbering diverges, so the link goes to the chapter instead of the exact verse, with a short note explaining why.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PassageLinks.svelte`, `frontend/src/lib/utils/bibleLinks.ts`, `frontend/src/lib/utils/bibleCommentary.ts`

## bible.choose-bible-gateway-version
**Task:** Change which Bible version the Bible Gateway link uses
**Where:** Passage details → passage links → "Bible Gateway version" dropdown
**Steps:**
1. Open a Bible-passage content item's details.
2. Use the **Bible Gateway version** dropdown to pick a translation (e.g. NIV, ESV, KJV, NASB, NABRE).
3. The **Read on Bible Gateway** link updates to use that version.
**Notes:** This only changes the outbound Bible Gateway link's version — it doesn't change the passage text shown on-platform.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/BibleVersionPicker.svelte`, `frontend/src/lib/data/bible-translations.json`, `frontend/src/lib/utils/bibleVersion.svelte.ts`

## bible.original-language
**Task:** View a passage's original-language (Hebrew/Greek) text with word-by-word detail
**Where:** Passage details → passage text → "Show original language" toggle
**Steps:**
1. Open a Bible-passage content item's details.
2. Select **Show original language** below the passage text.
3. In the passage text, select any underlined word or phrase to see its original-language word(s). Below the passage, each verse's original-language words also appear as their own row of chips, in English word order.
4. Hover a chip (or an underlined phrase) to show its popover: Strongs number, the Hebrew or Greek script, a transliteration, its gloss, how it's rendered in the English text, and (when available) its grammatical parsing.
5. Select it once to pin the popover open (it stays even after you stop hovering); select the same word again to unpin it. Double-click a word, click elsewhere, or press Escape to dismiss the popover entirely.
**Not supported:** Original-language data isn't available for every passage — when it isn't, a message says so and the plain text stays shown.
**Notes:** Word alignment credits the Berean Standard Bible (public domain); word meanings and tags credit STEP Bible / Tyndale House (CC BY 4.0), shown under the original-language view.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PassageText.svelte`, `frontend/src/lib/components/interlinear/OriginalLanguage.svelte`, `frontend/src/lib/components/interlinear/InterlinearPassage.svelte`, `frontend/src/lib/components/interlinear/WordPopover.svelte`, `frontend/src/lib/components/interlinear/InterlinearCredit.svelte`
