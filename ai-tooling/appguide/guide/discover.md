# Discover

**Route:** /discover
**Summary:** Discover is where you find content to add to Perspectize. It has three sources, **YouTube**, **Movies** and **Books**. YouTube shows trending videos and sends searches to youtube.com, while Movies (TMDB) and Books (Open Library) search inside Perspectize. Every result card has an **Add to Perspectize** button, or follow-up buttons once the item is in the Library.

## discover.switch-source
**Task:** Switch between YouTube, Movies and Books on Discover
**Where:** Discover page → source tabs
**Steps:**
1. Open **Discover** from the header.
2. Select **YouTube**, **Movies** or **Books**.
**Notes:** YouTube is the default. The chosen source is kept in the page address, so a reload or a shared link lands on the same source. The Books source has its own tabs (**Search**, **Trending**, **ISBN**), and switching source starts that source on its default tab.
**Sign-in required:** yes
**Source:** `frontend/src/routes/discover/+page.svelte`

## discover.search
**Task:** Search YouTube for videos to add
**Where:** Discover page → YouTube tab → search box
**Steps:**
1. Open **Discover** from the header. The **YouTube** tab is selected by default.
2. Type your search into the box (placeholder "Search YouTube, or paste a video link").
3. Press Enter or select **Search on YouTube**.
**Notes:** The results open on youtube.com in a new browser tab. Perspectize does not run the search itself. When you find a video, paste its link back into the same box to add it.
**Not supported:** Showing YouTube search results inside Perspectize.
**Sign-in required:** yes
**Source:** `frontend/src/routes/discover/+page.svelte`, `frontend/src/lib/components/discover/SearchBar.svelte`, `frontend/src/lib/services/youtubeApi.ts`

## discover.paste-video-link
**Task:** Add a YouTube video by pasting its link
**Where:** Discover page → YouTube tab → search box
**Steps:**
1. Paste a YouTube video link into the search box.
2. Select **Add to Perspectize** (or press Enter).
**Notes:** As soon as the box holds a YouTube video link (links starting with `http://` or `https://`: youtube.com watch, shorts, live, embed, `/v/` and `/e/` links, including `m.` and `music.` addresses, plus youtu.be links and youtube-nocookie.com/embed links), the **Search on YouTube** button becomes **Add to Perspectize**. It reads "Adding..." while it works, and the box empties once the video is added.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/discover/SearchBar.svelte`, `frontend/src/routes/discover/+page.svelte`, `frontend/src/lib/utils/youtube.ts`, `frontend/src/lib/queries/content/useAddVideo.ts`

## discover.browse-trending
**Task:** See trending YouTube videos
**Where:** Discover page → YouTube tab
**Steps:**
1. Open **Discover** from the header. The **YouTube** tab lists trending videos straight away.
**Notes:** The list is headed "Trending on YouTube" and stays on screen whatever you type in the search box. If it cannot load, the page says "Trending is unavailable right now." (or "Unable to reach Perspectize. Check your connection.") with a **Retry** button.
**Not supported:** Filtering or sorting trending videos (by length, upload date or views) and choosing a region.
**Sign-in required:** yes
**Source:** `frontend/src/routes/discover/+page.svelte`, `frontend/src/lib/components/discover/VideoResultsGrid.svelte`, `frontend/src/lib/services/youtubeApi.ts`

## discover.watch-inline
**Task:** Play a YouTube result without leaving Discover
**Where:** Discover page → YouTube tab → a video card
**Steps:**
1. Select anywhere on a video card (or focus it and press Enter or Space).
**Notes:** An embedded YouTube player replaces the thumbnail in place and starts playing, with no new tab. The **Add to Perspectize**, **Add perspective**, **Compare** and **Go to item** controls on the card do not start playback. Movie and book cards have no player: their titles open the TMDB or Open Library page in a new tab.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/discover/VideoCard.svelte`, `frontend/src/lib/components/discover/MovieCard.svelte`, `frontend/src/lib/components/discover/BookCard.svelte`

## discover.load-more
**Task:** Load more results
**Where:** Discover page → end of the result list
**Steps:**
1. Scroll to the end of the results (trending videos, or movie or book search or trending results).
2. Select **Load More**.
**Notes:** The button appears only when more results are available and reads "Loading..." while it fetches. The **ISBN** tab shows a single book and has no **Load More**.
**Sign-in required:** yes
**Source:** `frontend/src/routes/discover/+page.svelte`, `frontend/src/lib/components/discover/VideoResultsGrid.svelte`, `frontend/src/lib/components/discover/MovieSearchPanel.svelte`, `frontend/src/lib/components/discover/MovieTrendingFeed.svelte`, `frontend/src/lib/components/discover/BookSearchPanel.svelte`, `frontend/src/lib/components/discover/BookTrendingFeed.svelte`

## discover.add-video
**Task:** Add a Discover result to the Library
**Where:** Discover page → a result card
**Steps:**
1. Find a trending video, movie or book that is not in the Library yet.
2. Select **Add to Perspectize** on its card.
**Notes:** A toast confirms with "Added: <title>". For movies and books the toast has a **Go to movie** or **Go to book** action. Adding a video that already exists shows "This video has already been added" with a **Go to video** action. Once added, the card switches to its "In Library" state with follow-up buttons.
**Sign-in required:** yes
**Source:** `frontend/src/routes/discover/+page.svelte`, `frontend/src/lib/components/discover/VideoCard.svelte`, `frontend/src/lib/components/discover/MovieCard.svelte`, `frontend/src/lib/components/discover/BookCard.svelte`, `frontend/src/lib/queries/content/useAddVideo.ts`, `frontend/src/lib/queries/content/useAddMovie.ts`, `frontend/src/lib/queries/content/useAddBook.ts`

## discover.in-library-actions
**Task:** Start a perspective on, compare or open an item that is already in the Library
**Where:** Discover page → a result card marked "In Library"
**Steps:**
1. Find a result whose card shows **In Library** (video, movie and book cards all do).
2. Select **Add perspective** to write a perspective in an editor that opens on Discover, **Compare** to open the Compare page for that item, or **Go to item** to open its details in the Library.
**Notes:** The "In Library" check looks at the 100 most recently updated Library items, so an older item can still show **Add to Perspectize**. Adding it anyway finds the existing item and does not create a duplicate.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/discover/LibraryStatus.svelte`, `frontend/src/routes/discover/+page.svelte`, `frontend/src/lib/utils/contentLinks.ts`, `frontend/src/routes/compare/+page.svelte`

## discover.search-movies
**Task:** Find a movie by title, or add one from a TMDB or IMDb link
**Where:** Discover page → Movies tab → search box
**Steps:**
1. Select the **Movies** tab.
2. Type at least 2 characters of a title into the box (placeholder "Search movies by title, or paste a TMDB or IMDb link"). Results appear after a short pause.
3. Select **Add to Perspectize** on a result.
**Notes:** Results come from TMDB. Each card shows a poster (a film icon when there is none), the title (a link to its TMDB page in a new tab) and, when known, the release year, the TMDB score and a description. To add by link instead, paste a TMDB movie link, an IMDb title link or a bare IMDb id such as tt0133093: the box then offers **Add to Perspectize** (select it or press Enter) and empties once the movie is added.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/discover/MovieSearchPanel.svelte`, `frontend/src/lib/components/discover/MovieCard.svelte`, `frontend/src/lib/utils/movie.ts`, `frontend/src/lib/services/tmdbApi.ts`, `frontend/src/lib/queries/content/useAddMovie.ts`

## discover.browse-trending-movies
**Task:** Browse trending movies
**Where:** Discover page → Movies tab
**Steps:**
1. Select the **Movies** tab. Trending movies show while the search box has fewer than 2 characters.
2. Choose **Today** or **This week** to change the trending period.
**Notes:** The list is headed "Trending movies" and **This week** is selected by default. Typing 2 or more characters replaces it with search results, and clearing the box brings it back. Trending cards have the same **Add to Perspectize** button as search results.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/discover/MovieTrendingFeed.svelte`, `frontend/src/lib/components/discover/MovieSearchPanel.svelte`

## discover.search-books
**Task:** Search for a book by title or author
**Where:** Discover page → Books tab → Search tab
**Steps:**
1. Select the **Books** tab, then the **Search** tab (the default).
2. Type at least 2 characters of a title or author into the box (placeholder "Search books by title or author"). Results appear after a short pause.
3. Select **Add to Perspectize** on a result.
**Notes:** Results come from Open Library. Each card shows a cover, the title (a link to its Open Library page in a new tab), the authors, the first-published year, and the page count and edition count when known. It also shows the rating, the Open Library reading-log counts and up to four subject tags.
**Not supported:** Adding a book by pasting a link into this box. Open Library links are added through **Add Content**.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/discover/BookSearchPanel.svelte`, `frontend/src/lib/components/discover/BookCard.svelte`, `frontend/src/lib/services/openLibraryApi.ts`, `frontend/src/lib/queries/content/useAddBook.ts`, `frontend/src/lib/components/AddContentPopover.svelte`

## discover.browse-trending-books
**Task:** Browse trending books
**Where:** Discover page → Books tab → Trending tab
**Steps:**
1. Select the **Books** tab, then the **Trending** tab.
2. Choose **Today** or **This week** to change the trending period.
**Notes:** The list is headed "Trending books" and **This week** is selected by default. The page describes it as what is being looked up on Open Library right now. The same list also shows on the **Search** tab while its box has fewer than 2 characters.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/discover/BookTrendingFeed.svelte`, `frontend/src/lib/components/discover/BookSearchPanel.svelte`, `frontend/src/routes/discover/+page.svelte`

## discover.add-book-by-isbn
**Task:** Add a book by its ISBN
**Where:** Discover page → Books tab → ISBN tab
**Steps:**
1. Select the **Books** tab, then the **ISBN** tab.
2. Type or paste an ISBN-10 or ISBN-13 into the box labeled "ISBN-10 or ISBN-13". Hyphens and spaces are fine.
3. When the book card appears, select **Add to Perspectize**.
**Notes:** The lookup starts only once the number is complete and its check digit is valid. Until then the page says "An ISBN has 10 or 13 digits." or "That ISBN's check digit doesn't match. Check for a typo." If Open Library has no match it says "No book found for that ISBN".
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/discover/BookISBNPanel.svelte`, `frontend/src/lib/utils/isbn.ts`, `frontend/src/lib/services/openLibraryApi.ts`, `frontend/src/lib/components/discover/BookCard.svelte`, `frontend/src/lib/queries/content/useAddBook.ts`

## discover.keyboard-shortcuts
**Task:** Jump to the search box or clear it from the keyboard
**Where:** Discover page → YouTube tab, Movies tab, or Books → Search tab
**Steps:**
1. Press **Cmd+K** (Mac) or **Ctrl+K** (Windows) to focus the search box.
2. Press **Escape** to clear the text in the box.
**Notes:** The shortcuts act on the search box of the source you are on. On the Books source they work only on the **Search** tab: the **Trending** and **ISBN** tabs ignore them. Escape does nothing while the box is empty. Each search box also has an **X** button ("Clear search") that clears it with the mouse.
**Sign-in required:** yes
**Source:** `frontend/src/routes/discover/+page.svelte`
