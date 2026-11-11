# Content Types

What content is: the kinds of thing people can write perspectives on, how each kind is identified, where its facts come from, and the vocabulary used to design a new kind.

## Language

### Content

**Content**:
Anything a user can write a perspective on: a video, a film, a passage, a claim. Each content item has one type and one canonical web address.
_Avoid_: Item (UI label only), media, resource, post

**Content type**:
A kind of content with its own identity rule, metadata and columns.
_Avoid_: Media type, category, kind

**Canonical URL**:
The one address a content item is always stored under, rebuilt from its ids and never kept as pasted. The same address cannot exist twice.
_Avoid_: Link, permalink

**Identity**:
The natural key that makes two additions the same content: a video id, a TMDB id, a verse range, a barcode. Used when there is no unique URL or the URL is shared across types.
_Avoid_: Dedupe key, primary key

**Data source**:
The outside provider whose facts fill a content item (YouTube, TMDB, a public library catalogue).
_Avoid_: Source (alone), API

**Enrichment**:
Filling a content item's facts from its data source, on add and on request.

**Missing is not zero**:
An unknown fact is left empty and shown as "—"; it is never stored or shown as 0.

**Source content**:
The content a claim was drawn from, when there is one.
_Avoid_: Parent (reserved for hierarchy)

### Hierarchy

**Parent content**:
The content a child belongs to: a show for a season, a season for an episode.
_Avoid_: Series (that is a column label), container

**Child content**:
Content that exists as a part of another: a season, an episode.

**Force-add**:
Adding a child also adds each missing ancestor, so a child never exists without its parent. Never works downward.

**Added via parent**:
Marks content that exists only because a child was added.

**No rollup**:
A parent's perspectives are only those written on the parent itself, never on its children.

### The types

**YouTube video**:
One video, identified by its video id.

**Movie**:
A feature film, independent of where it is watched; identified by its TMDB id.

**TV show / TV season / TV episode**:
A series, one season of it (season 0 is "Specials"), and one episode. A season is identified by show and season number; an episode by show, season and episode number. Designed, not shipped.

**Bible passage**:
A contiguous range of verses in one book. See the Scripture context.

**Claim**:
A single proposition stated so it can be affirmed or denied.

**Book**:
A published work, not a particular physical copy. Identified by ISBN-13, or by title and primary author when there is none.
_Avoid_: Edition, copy

**Edition**:
One published form of a book (a printing, a translation, a format), carrying its own ISBN. Many editions belong to one book.
_Avoid_: Version, copy

**Book part**:
A distinct section of a book that can be written about on its own: a chapter, a piece of frontmatter or a piece of endmatter. Belongs to exactly one book. Proposed.
_Avoid_: Subtype, section

**Chapter**:
A numbered or titled division of a book's main text. Not a video chapter marker and not a Bible chapter.

**Frontmatter**:
The material before a book's main text: a preface, foreword, introduction, dedication and the like.
_Avoid_: Preliminaries, front matter (two words)

**Endmatter**:
The material after a book's main text: an appendix, notes, glossary, bibliography, index and the like.
_Avoid_: Backmatter, back matter, ensnared

**Food item**:
A food or drink with a nutrition panel: packaged, generic or a beverage.

**Painting**:
A fine-art painting as a work held in a collection.

**News article**:
A web article at a canonical URL, with a rating of its source's bias and reliability.

**Photo / Facebook video**:
Proposed or deferred. A Facebook video stays out of scope until its source opens up.

**Placeholder types**:
Types listed in the catalog but not designed: article, podcast episode, music track, joke, purchase, perspective-as-content, place visit, paper.

### Adding content

**Add Content**:
The single input where a person pastes a link or typed details to bring one item in; it recognises the type and lets the person correct it.
_Avoid_: Add video, import

**Detection**:
Recognising a pasted link as a type, by its host and path. Only known hosts are recognised; any other address is never guessed.

**Ingestion**:
How a type's row gets its metadata: from an external API, by scraping, by hand, from a URL alone, or internally.

**Update source data**:
Refetching a content item's facts from its data source. Rate-limited per item.

**Informed decision**:
The rule for any preview or picker: enough about each item (what it is, how big, how current, how well received, full detail on demand) to decide without leaving the page.

### Designing a type (content-type designer)

**Catalog**:
The designer's list of every content type with its identity, enrichment, thumbnail and columns.

**Generic column**:
A column defined once for all types (creator, length, date, rating) and bound to each type that has it.
_Avoid_: Shared column

**Binding**:
How one type fills one generic column: its own header label, whether it applies, where the value comes from, and whether it is visible by default.

**Applicability**:
How much a column matters to a type: required, typical or optional.

**Column source**:
Where a bound value comes from: the data source, a scrape, the user, a derivation or the system.

**Column group**:
A cluster of columns shown together in the picker: identity, attribution, scale, nutrition, reception, time and progress, economics, epistemic, system.

**Gap fallback**:
What a column shows for a selected type that has no binding: a dash, blank, hide the column, or a substitute value.

**Solo view / mixed view**:
The columns shown when exactly one type is filtered in, and when several or none are.

**Default columns**:
The columns a type shows before anyone customises.

**Cell tooltip / header tooltip / detail tooltip**:
The three hover explanations: of a value, of a column, and of a stat tile in the details view.

**Details view**:
The per-item panel: media, subtitle, stat tiles, sections of text, chips, people or lists.

**Discover decision**:
A type's answer on the Discover page: whether it appears, what its feed shows, and whether search runs in the app or hands off to the source's site.

**Preview**:
A throwaway single-type page showing a proposed type's columns, tooltips, details view and add form.
