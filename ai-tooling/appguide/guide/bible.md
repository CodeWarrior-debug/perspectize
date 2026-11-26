# Bible Passages

**Route:** (part of the Library's item details dialog; no dedicated route)
**Summary:** A Bible passage's details dialog shows the passage text itself, a bar showing where it falls in Scripture, links out to Bible Gateway and commentaries, and an optional original-language (interlinear) view. The verse numbers of a multi-verse passage open any one verse on its own. You come here by opening a Bible passage's details from the Library, from the **Go to passage** button on the toast after adding one, or from **View content** in a Plan item's edit dialog.

## bible.read-passage
**Task:** Read a Bible passage's text
**Where:** Library → a Bible passage's details → passage text
**Steps:**
1. Open the passage's details: in the Library, select its title in the **Item** column (or its card's title on a narrow screen). The dialog header reads "Bible Passage".
2. Read the verse text below the title; each verse number is a small superscript before its verse.
3. On a passage of more than 30 verses only the first 10 show until you select **Show full passage**; the button then reads **Show less** and collapses it again.
**Not supported:** Passages of more than 150 verses show no text at all, only a "too long to display here" message with the verse count. Use the Bible Gateway link to read them (see bible.passage-links).
**Notes:** The Library starts with only YouTube videos showing, so tick **Bible Passage** in the **Type** filter to see passages (on a narrow screen, which has no Type menu, remove the **Type** chip instead; see activity.filter-by-type). Adding a passage happens elsewhere (see adding-content.add-bible-passage). The translation name and copyright line appear at the end of the text.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PassageText.svelte`, `frontend/src/lib/components/ActivityDetailsModal.svelte`, `frontend/src/lib/utils/contentLinks.ts`

## bible.position-bar
**Task:** See where a passage falls within the whole Bible
**Where:** Bible passage details → position bar, below the passage text
**Steps:**
1. Open a Bible passage's details (see bible.read-passage).
2. Find the bar: a filled segment shows the passage's span within the whole Bible, and a thin marker on the bar shows where the New Testament begins.
3. Read the line under the bar. It gives the passage's verse numbers counted from Genesis 1:1 out of 31,102, then the book and its place among the 66 books, for example "Verses 1–31 of 31,102 · Genesis (book 1 of 66)".
4. Hover the bar to see, as percentages, how far through Scripture and through its Testament the passage reaches.
**Not supported:** The bar doesn't appear for a passage that spans more than one book.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PassagePositionBar.svelte`, `frontend/src/lib/utils/biblePosition.ts`

## bible.passage-links
**Task:** Open a passage on Bible Gateway, or find a commentary on it
**Where:** Bible passage details → **Read on Bible Gateway** link and **Commentaries**, below the position bar
**Steps:**
1. Open a Bible passage's details (see bible.read-passage).
2. Select the **Read on Bible Gateway** link, which carries your chosen version's code in parentheses, for example "Read on Bible Gateway (ESV)". It opens the passage in that version on biblegateway.com in a new tab.
3. To read a commentary instead, expand **Commentaries** and choose **Matthew Henry (chapter)** or **Multiple commentators (verse)**. Each opens BibleHub in a new tab, at the passage's first chapter or first verse.
**Not supported:** The on-platform translation (Berean Standard Bible) isn't one of the Bible Gateway version choices, since Bible Gateway doesn't host it, so the link always uses the version you picked (see bible.choose-bible-gateway-version). Other named commentators (for example Gill, Barnes or Calvin) aren't offered.
**Notes:** For NABRE on Psalms, Joel and Malachi, where verse numbering differs, the link goes to the chapter instead of the exact verse, with a short note saying so.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PassageLinks.svelte`, `frontend/src/lib/utils/bibleLinks.ts`, `frontend/src/lib/utils/bibleCommentary.ts`

## bible.choose-bible-gateway-version
**Task:** Change which Bible version the Bible Gateway link uses
**Where:** Bible passage details → **Bible Gateway version** dropdown
**Steps:**
1. Open a Bible passage's details (see bible.read-passage).
2. Open the **Bible Gateway version** dropdown and pick a translation. Options read like "NIV — New International Version" and cover NIV, ESV, KJV, NKJV, NLT, NASB, CSB, AMP, MSG and NABRE (marked "(Catholic)").
3. The **Read on Bible Gateway** link updates to use that version.
**Notes:** The default is ESV. Your choice is remembered in this browser and applies to every passage. It changes only the outbound Bible Gateway link, never the passage text shown in Perspectize.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/BibleVersionPicker.svelte`, `frontend/src/lib/data/bible-translations.json`, `frontend/src/lib/utils/bibleVersion.svelte.ts`

## bible.original-language
**Task:** View a passage's original-language (Hebrew/Greek) text with word-by-word detail
**Where:** Bible passage details → **Show original language** button below the passage text
**Steps:**
1. Open a Bible passage's details (see bible.read-passage) and select **Show original language**. Select it again to turn the view off.
2. Underlined phrases in the passage text are the ones with original-language data. A group headed **Original language** appears below the text with one chip for each original word, in English word order, showing its script, transliteration and Strong's number.
3. Hover an underlined phrase or a chip to open its popover: the Strong's number, "Hebrew" or "Greek", the original script, a transliteration, and, when available, its gloss and its grammatical parsing. When the word matches an English phrase, the popover also reads "Rendered here as" followed by that phrase, and a dashed line joins the phrase to its chip. A phrase made of several original words shows the first one; every original word has its own chip.
4. Select a phrase or chip once to pin its popover open, and select the same one again to unpin it. Double-click an underlined phrase or a chip, click outside both the passage text and the **Original language** group, or press Escape to dismiss the popover.
**Not supported:** Original-language data isn't available for every passage. When it isn't, a message says so and the plain text stays shown. The button isn't offered while the text is loading, if it failed to load, or for passages over 150 verses.
**Notes:** On a passage of more than 30 verses the view covers only the verses currently shown, so select **Show full passage** first to see them all. If the original-language data fails to load, a **Retry** button appears. Verse numbers stay selectable in this view (see bible.see-single-verse). Under the view, word alignment credits the Berean Standard Bible (public domain) and word meanings and tags credit STEP Bible and Tyndale House (CC BY 4.0).
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/PassageText.svelte`, `frontend/src/lib/components/interlinear/OriginalLanguage.svelte`, `frontend/src/lib/components/interlinear/InterlinearPassage.svelte`, `frontend/src/lib/components/interlinear/WordPopover.svelte`, `frontend/src/lib/components/interlinear/InterlinearCredit.svelte`, `frontend/src/lib/utils/interlinear.ts`

## bible.see-single-verse
**Task:** Open one verse of a longer passage on its own
**Where:** Bible passage details → a verse number in the passage text
**Steps:**
1. Open the details of a passage that covers two or more verses (see bible.read-passage) and select one of its verse numbers.
2. A small prompt opens that reads "See" followed by that verse's reference and "only", for example "See John 3:16 only", with an arrow button. Select it.
3. The Library opens that single verse as its own passage, with its details showing. If the verse isn't in the Library yet, it is added first, and the arrow shows a spinner while that happens.
4. To close the prompt without going anywhere, select the same verse number again, press Escape or click elsewhere.
**Not supported:** A passage of a single verse has plain, non-selectable verse numbers. The prompt offers one verse only, never a range.
**Notes:** It works with **Show original language** on, from the verse numbers in the text and in the **Original language** group. Opened from a Plan item's **View content**, it takes you to the Library. Failures show a toast: "Please sign in to open this passage", "Cannot reach the server. Check your connection and try again." or "Failed to open passage. Please try again."
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/VerseNumber.svelte`, `frontend/src/lib/components/VerseJumpPrompt.svelte`, `frontend/src/lib/components/PassageText.svelte`, `frontend/src/lib/components/interlinear/InterlinearPassage.svelte`, `frontend/src/lib/queries/content/useOpenPassage.ts`, `frontend/src/lib/utils/verseJump.ts`, `frontend/src/lib/utils/contentLinks.ts`
