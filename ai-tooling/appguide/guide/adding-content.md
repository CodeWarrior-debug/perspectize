# Adding Content

**Route:** Header on every page, and /import
**Summary:** Adding Content covers getting a YouTube video, movie, book or Bible passage into the shared Library so you and others can share perspectives on it. You add content from the **Add Content** control in the header, available whenever you're signed in, or from the **Add video** button in the getting-started checklist for a new account. The **Import** page requests and imports whole YouTube channels or a person's films. Writing a perspective on something you've added is a separate area.

## adding-content.open-add-content
**Task:** Open the form for adding a video, movie, book or Bible passage
**Where:** Header → **Add Content** button
**Steps:**
1. Select **Add Content** in the header. On a narrow screen the button shows only a plus icon.
2. The form opens as a popover on a wide screen and as a dialog on a narrow one, with the same contents: the description "Paste a YouTube, TMDB, IMDb or Open Library link, or type a Bible reference like John 3:16-18.", a "Link or reference" field, a type row, and **Cancel** and **Add** buttons.
3. As you type or paste, the type row names what the form recognized: "Detected: YouTube", "Detected: Movie", "Detected: Book" or "Detected: Bible passage". "Select a type" means nothing has been recognized.
**Not supported:** Adding a claim. Free text of two or more words that isn't a link or a Bible reference shows "Detected: Claim" and "Claims can't be added from here yet. Pick a type above to continue.", and **Add** stays disabled. Links to other sites, such as a podcast or an article, aren't recognized either: the type row stays on "Select a type".
**Notes:** A successful add closes the form and shows a confirmation toast, and adding something already in the library never creates a duplicate. The form takes only links, bare IMDb ids (such as `tt0133093`) and Bible references. To find a movie or book by title, use **Discover**, whose Movies tab searches TMDB and Books tab searches Open Library without leaving Perspectize (its YouTube tab opens a YouTube search in a new tab, and you paste the video link back here); to bring in a whole YouTube channel or a person's films, use **Import**.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/Header.svelte`, `frontend/src/lib/components/AddContentPopover.svelte`, `frontend/src/lib/components/FormPopover.svelte`, `frontend/src/lib/utils/detectContentType.ts`, `frontend/src/routes/discover/+page.svelte`, `frontend/src/routes/import/+page.svelte`

## adding-content.add-youtube-video
**Task:** Add a YouTube video to your library
**Where:** Add Content form → "Link or reference" field
**Steps:**
1. Open **Add Content**.
2. Paste a full YouTube link, including `https://`, into the "Link or reference" field, or select the paste-from-clipboard icon in the field. Recognized forms are `youtube.com` watch, shorts, live, embed, `/v/` and `/e/` links (including `m.` and `music.` addresses), `youtu.be` short links, and `youtube-nocookie.com/embed` links.
3. The type row reads "Detected: YouTube" once the link is recognized. You can also pick **YouTube** from the "Change type" dropdown yourself.
4. Select **Add**.
**Notes:** A new video shows "Added: {video title}". A video anyone has already added shows "This video has already been added" with a **Go to video** button instead. With **YouTube** picked by hand, text that isn't a YouTube link shows "Please enter a valid YouTube URL" and nothing is sent.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/AddContentPopover.svelte`, `frontend/src/lib/utils/youtube.ts`, `frontend/src/lib/utils/detectContentType.ts`, `frontend/src/lib/queries/content/useAddVideo.ts`

## adding-content.add-movie
**Task:** Add a movie to your library
**Where:** Add Content form → "Link or reference" field
**Steps:**
1. Open **Add Content**.
2. Paste a TMDB movie link (`themoviedb.org/movie/<id>`), an IMDb title link (`imdb.com/title/tt…`) or a bare IMDb id such as `tt0133093` into the "Link or reference" field. The `https://` is optional.
3. The type row reads "Detected: Movie", or you can pick **Movie** from the "Change type" dropdown yourself.
4. Select **Add**.
**Not supported:** TMDB TV-show links. Among TMDB links, only `themoviedb.org/movie/` links are recognized.
**Notes:** The toast reads "Added: {movie title}" with a **Go to movie** button, whether the movie is new or was already in the library. If the movie can't be added, the form shows "Could not add this movie. Check the link and try again.", or the server's own reason when it refuses the movie as not allowed. With **Movie** picked by hand, text that isn't a TMDB or IMDb movie link shows "Please enter a valid TMDB or IMDb movie link".
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/AddContentPopover.svelte`, `frontend/src/lib/utils/movie.ts`, `frontend/src/lib/utils/detectContentType.ts`, `frontend/src/lib/queries/content/useAddMovie.ts`

## adding-content.add-book
**Task:** Add a book to your library
**Where:** Add Content form → "Link or reference" field
**Steps:**
1. Open **Add Content**.
2. Paste an Open Library work link (`openlibrary.org/works/OL…W`) or edition link (`openlibrary.org/books/OL…M`) into the "Link or reference" field. The `https://` is optional.
3. The type row reads "Detected: Book", or you can pick **Book** from the "Change type" dropdown yourself.
4. Select **Add**.
**Not supported:** Open Library author links.
**Notes:** This form doesn't take an ISBN or a title. To add a book that way, use **Discover** → **Books** and its **ISBN** or **Search** tab. The toast reads "Added: {book title}" with a **Go to book** button, whether the book is new or was already in the library. If the book can't be added, the form shows "Could not add this book. Check the link and try again.", or the server's own reason when it refuses the book as not allowed. With **Book** picked by hand, text that isn't an Open Library book link shows "Please enter a valid Open Library book link".
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/AddContentPopover.svelte`, `frontend/src/lib/utils/book.ts`, `frontend/src/lib/utils/detectContentType.ts`, `frontend/src/lib/queries/content/useAddBook.ts`, `frontend/src/routes/discover/+page.svelte`

## adding-content.add-bible-passage
**Task:** Add a Bible passage to your library
**Where:** Add Content form → Bible passage pickers
**Steps:**
1. Open **Add Content**.
2. In the "Link or reference" field, type a reference such as "John 3:16-18" (a chapter alone, like "Psalm 23", selects the whole chapter) or paste a Bible Gateway link whose address carries the reference in its `search=` part. Or pick **Bible passage** from the "Change type" dropdown to show the pickers directly.
3. The type row reads "Detected: Bible passage" and the pickers fill in from what you typed. Adjust the exact passage with the **Book**, **Start chapter**, **Start verse**, **End chapter** and **End verse** dropdowns. Changing a start field moves the end to match until you change an end field yourself, so a single verse needs no end edits. Choosing a different book resets the range to chapter 1, verse 1.
4. Select **Add**.
**Not supported:** A passage whose end comes before its start. The form shows "The end of the passage can't come before its start." and **Add** stays disabled.
**Notes:** Only the book, chapter and verse numbers are sent, and the server builds the passage's name and link, so a pasted Bible Gateway address is never stored. The toast reads "Added: {passage title}" with a **Go to passage** button, whether the passage is new or was already in the library. A reference whose chapter or verse doesn't exist in the book isn't recognized as a passage.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/AddContentPopover.svelte`, `frontend/src/lib/components/PassagePicker.svelte`, `frontend/src/lib/utils/passageRange.ts`, `frontend/src/lib/utils/detectContentType.ts`, `frontend/src/lib/queries/content/useAddPassage.ts`

## adding-content.switch-or-clear-type
**Task:** Change the detected type, or clear the form to start over
**Where:** Add Content form → type row ("Change type" dropdown and the **Type** and **All** buttons)
**Steps:**
1. With the Add Content form open, use the "Change type" dropdown to choose **YouTube**, **Bible passage**, **Movie** or **Book**, whatever was auto-detected. The type row then reads "Type: …" instead of "Detected: …".
2. Select **Type** to clear the text and any picker choices for the current type while keeping that type selected.
3. Select **All** to clear the text, the chosen type and any picker edits, back to how the form looked when opened.
**Notes:** A type you chose by hand lasts until you next edit or paste text in the field, and then the form goes back to auto-detecting. **Type** is available only while a type is selected, and **All** only once there is text, a chosen type or a picker edit to clear.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/AddContentPopover.svelte`

## adding-content.onboarding-add-video
**Task:** Add your first video from the getting-started checklist
**Where:** Getting-started checklist (step 1 of 2) → **Add video** button
**Steps:**
1. In the "Getting started" checklist shown on a new account, select **Add video** on step 1.
2. Paste a YouTube URL into the "YouTube URL" field of the **Add Video** dialog.
3. Select **Add Video**.
**Not supported:** This dialog takes only a YouTube URL, with no type picker. To add a Bible passage, movie or book, use **Add Content** in the header.
**Notes:** A successful add closes the dialog and moves the checklist to step 2. Text that isn't a YouTube link shows "Please enter a valid YouTube URL".
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/onboarding/OnboardingCoach.svelte`, `frontend/src/lib/components/AddVideoDialog.svelte`, `frontend/src/lib/queries/content/useAddVideo.ts`

## adding-content.request-import
**Task:** Request an import of a whole YouTube channel or a person's films
**Where:** Import page → **Request an import** tab
**Steps:**
1. Select **Import** in the header, then the **Request an import** tab.
2. Enter a **Name** for the import. A **Description** is optional.
3. In **Sources**, choose a source type, **YouTube channel** or **Person's films (TMDB)**, and enter the channel handle or URL, or the person's name, TMDB id or TMDB person URL. For a person, also choose **Directed**, **Acted in** or **Both**. Select **Add a source** for more, up to 10 in all.
4. Select **Send request**.
**Not supported:** Source types other than a YouTube channel or a person's films on TMDB.
**Notes:** You need a name plus either a description or at least one source. The page is marked Preliminary. Nothing is added to the library until you import rows from the approved import (see adding-content.import-from-sheet). An admin has to approve a request before anything is listed, and you can have up to 3 requests waiting at once. After you send a request, the page returns to the **Imports** tab, where it shows as "Requested" until an admin approves or declines it.
**Sign-in required:** yes
**Source:** `frontend/src/routes/import/+page.svelte`, `frontend/src/lib/components/imports/ImportRequestForm.svelte`, `frontend/src/lib/components/imports/ImportSourceRows.svelte`, `frontend/src/lib/components/imports/ImportJobStatus.svelte`

## adding-content.import-from-sheet
**Task:** Pick rows from an approved import and add them to the library
**Where:** Import page → **Imports** tab → an approved import's name
**Steps:**
1. Select **Import** in the header and, on the **Imports** tab, select the name of an approved import. A request that is still waiting isn't a link yet.
2. Narrow the sheet with the **Source** dropdown, the **All**, **Not imported**, **In library** and **Won't import** buttons, or the search box. Select a row to open its details.
3. Tick the rows you want; the checkbox in the header row ticks every row the filters leave showing. Rows already in the library can't be ticked.
4. Select **Import** (the button reads **Import {n}** once rows are ticked), then **Start import** to confirm.
**Notes:** Each imported item is added to the library with its full details and attributed to you, and anything already added is skipped rather than duplicated. Without admin rights you can import up to 1,000 rows at a time. **Don't import** hides the ticked rows from **Not imported** for everyone, and anyone can undo it with **Clear "don't import"** until the import is closed. Progress shows in a progress bar on the page while rows import. A closed import is hidden from everyone but admins.
**Sign-in required:** yes
**Source:** `frontend/src/routes/import/+page.svelte`, `frontend/src/routes/import/[id]/+page.svelte`, `frontend/src/lib/components/imports/ImportSheet.svelte`, `frontend/src/lib/utils/import-sheet.ts`
