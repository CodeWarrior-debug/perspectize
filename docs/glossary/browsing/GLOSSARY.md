# Browsing

How people look at content and perspectives: the pages, the grid, filtering and comparison.

## Language

### Pages

**Library**:
The content library for all Perspectize members, at `/content-library`: a grid (cards on narrow screens) of content with its perspectives and facts. Signed-in visitors to `/` are sent here. "Content library" in full; "Library" in the nav and headings. It was called Activity until it was renamed, and code names from then remain (`ActivityTable`, `activityList`).
_Avoid_: Activity (former name), feed, dashboard

**Discover**:
The page for finding content to add: a feed when the search box is empty, and search per type.
_Avoid_: Explore, search page

**Compare**:
The page that puts two users' perspectives on the same content side by side.

**Plan**:
The page of a person's todos. See the Plan context.

**Messages**:
The page of message threads. See the Messaging context.

**Guest landing**:
What a signed-out visitor sees.

### The grid

**Item column**:
The grid column showing a content item's thumbnail and name. "Item" is only this label; the thing is content.

**Column picker**:
The dialog where a person chooses which columns show.
_Avoid_: Column layout, column view (code names)

**Column view**:
Which saved column set applies: one for movies, one for everything else.

**Column relevance callout**:
The hint "pick a type or choose columns" shown when the type filter is empty or mixed, because some columns do not apply to every row.

**Type filter**:
The checkbox filter on content type. Filtering to one type switches to that type's default columns.

**Search scope**:
Which fields free-text search covers: title, description, channel, tags and, for movies, cast and director.

**Data mode**:
Whether sorting, filtering and search run across all items on the server ("All") or only within what is already loaded ("Loaded").

**Age rating**:
The film or TV audience certification (G, PG, PG-13, R, NC-17, NR). One name for the column, the filter and the stored value.
_Avoid_: Rated, certification

**Creator**:
The generic "who made it" column. Its per-type labels are Channel, Director, Author and so on.
_Avoid_: Channel (as the generic name)

**Cell popover**:
The hover or click panel on a cell showing full text, with a copy button; single or multi-select.

**Details modal**:
The full view of one content item opened from the grid.

**Display title**:
A user-set title that replaces a content item's name where shown.

**Responsive tier**:
A screen-width band (extra small, small, medium, large) that decides how many columns show.

**Card mode**:
The card list used on narrow screens in place of the grid.

### Discover

**Feed**:
What Discover shows for a type with an empty search box: trending, daily, curated or recent.
_Avoid_: Trending (unless it ranks by a stated number)

**Hand-off search**:
Search that opens the source's own site in a new tab and takes a pasted link back, used when the source's search is scarce or costly.

**In-app search**:
Search that calls the source and shows result cards inside Discover.

### Compare

**Participant**:
One of the two people in a comparison: the viewer and another user.

**Rating row**:
One dimension shown for both participants, with each value and the gap between them.

**Similar / diverges / conflict**:
How far apart two ratings on one dimension are: close, noticeably apart, or opposed.

**Filled in differently**:
A dimension that only one participant rated; left out of the similar, diverges and conflict counts.

**Overall**:
The thumbs-up or thumbs-down reaction compared across the two perspectives.

**Matching feeling**:
A feeling both participants picked, matched by label, else by emoji.
