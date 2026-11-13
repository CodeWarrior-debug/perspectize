# Glossary Map

Perspectize is a platform for storing, refining and sharing **perspectives** on **content**. The language is split into contexts so one word means one thing inside each file. Read the context that matches the work; follow the relationships below when a term crosses a boundary.

## Contexts

- [Perspectives](./docs/glossary/perspectives/GLOSSARY.md): what a person thinks about a piece of content: perspectives, ratings, feelings, privacy, aggregates
- [Content Types](./docs/glossary/content-types/GLOSSARY.md): what content is: the types, how each is identified and enriched, parent/child content, and the vocabulary of the content-type designer
- [Browsing](./docs/glossary/browsing/GLOSSARY.md): how people look at content: Library, Discover, Compare, the grid and its columns
- [Import](./docs/glossary/import/GLOSSARY.md): bringing many items in at once through a staging sheet
- [Plan](./docs/glossary/plan/GLOSSARY.md): what a person intends to do with content: todos, actions, lists
- [Scripture](./docs/glossary/scripture/GLOSSARY.md): Bible passages, verse positions, translations, interlinear text
- [Messaging](./docs/glossary/messaging/GLOSSARY.md): threads, messages, read state and presence between users
- [Accounts](./docs/glossary/accounts/GLOSSARY.md): users, roles, ownership, sentinel users and onboarding
- [Delivery](./docs/glossary/delivery/GLOSSARY.md): how work is specified, staged and shipped (intents, specs, ADRs, dark backend)

## Relationships

- **Content Types → Perspectives**: a perspective is always about one content item, and what can be said about it (columns, ratings shown) depends on the item's type.
- **Content Types → Scripture**: a Bible passage is one content type; Scripture owns its identity and text rules.
- **Content Types ↔ Import**: every import source declares the content type its candidates become. Import reuses the Content Types identity rules to detect items already in the library.
- **Perspectives → Browsing**: the Library lists content with aggregates of its perspectives; Compare puts two people's perspectives on the same content side by side.
- **Content Types → Browsing**: the column picker and Discover page are driven by each type's column and Discover decisions.
- **Perspectives ↔ Plan**: a todo names an action on a content item and may later become a perspective. Privacy is shared language: lists and todos each carry their own, independent of each other.
- **Accounts → everything**: every owned row (perspective, todo, list, import) has an owner and a privacy level; the viewer decides what a read may return.
- **Messaging → Accounts**: participants are users; messaging shares no vocabulary with content.
- **Delivery → Content Types**: a new content type starts as an intent, then a spec, then an implementation plan, and ships behind the dark-backend rule.

## Overloaded words (resolved across contexts)

| Word | Resolution |
|------|------------|
| Item | **Content** (domain). "Item" is only the UI label of the Library grid's first column. A staging-sheet row is a **candidate**. |
| Source | Three different things: **data source** (the provider of metadata), **import source** (a channel or filmography), **source content** (what a claim was drawn from). |
| Parent | **Parent content** is the hierarchy (show → season → episode). A claim's origin is **source content**. |
| Plan | **Plan** is the page and a user's set of todos. A written implementation approach is an **implementation plan**. |
| Review | **Review** is the text field on a perspective. Moderation is **review status**. An admin's decision on an import is a **request decision**. |
| Category | **Category** is a Wikidata-backed grouping of content. A **categorized rating** is a rating on a named axis inside one perspective. |
| Relevance | **Relevance** is a user-addable rating field ("does it matter now?"). The hint about which columns apply is the **column relevance callout**. |
