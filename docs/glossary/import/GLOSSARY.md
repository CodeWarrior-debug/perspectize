# Import

Bringing many items into Perspectize at once: list a source's candidates, decide on a staging sheet, then import the chosen ones.

## Language

**Import**:
A named batch with one or more import sources that share one staging sheet.
_Avoid_: Job, batch, sync

**Import source**:
One channel or one person's filmography inside an import.
_Avoid_: Source (alone)

**Candidate**:
One row of a staging sheet: something that could become content, with the facts needed to decide.
_Avoid_: Item, row, import item

**Staging sheet**:
The working table of an import's candidates, where people select, exclude and decide.

**Decide columns / All columns**:
The short set of columns that support a decision, and the full set.

**Facts**:
The decision columns of a candidate. A fact means the same for every type (a video's and a film's length are both a duration); an unknown fact is empty, never zero.

**Details panel**:
The lazily loaded extra detail on a candidate: description, tags, chapters, people.

**Kind**:
What sort of candidate it is: video, short, livestream or movie. People include or exclude a kind as a group.

**Excluded**:
The shared "don't import" mark on a candidate. An excluded candidate cannot be queued.

**In library**:
A candidate whose canonical URL already belongs to existing content.
_Avoid_: Duplicate

**Destination type**:
The content type a source's candidates become.

**Source status**:
How far listing a source has got: waiting, listing, ready, failed.

**Candidate status**:
The outcome of importing one candidate: queued, imported, skipped (already existed) or failed. Empty means nobody has asked to import it.

**Request**:
An import by a non-admin, which waits for an admin's decision because listing spends outside quota.

**Request decision**:
An admin's answer to a request: approved or declined, with an optional note. An admin's own import is approved on creation.
_Avoid_: Review (reserved for perspectives)

**Closed import**:
An import an admin has finished with: hidden from non-admins and read-only.

**Batch result**:
What one import action did: how many were queued, already in the library, already queued, not found, excluded.

**Progress**:
The live count of finished candidates in a running import, pushed to anyone watching.

**Stats snapshot**:
The time a candidate's counts (views, likes, ratings) were last fetched.
