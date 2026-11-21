# Writing-editor layouts worth learning from

Output 1 of the perspective-editor review. Output 2 is [perspective-editor-persona-report.md](perspective-editor-persona-report.md).

**Question:** which acclaimed WYSIWYG / block editors exist, and how are they laid out, so the Add / Edit perspective dialog can borrow what works.

**Evidence quality.** A web search found no editor-design awards, and no independent layout comparisons; the sources were mostly vendor blog posts. The layout descriptions below are from knowledge of the products and should be re-checked against the live editors before anything is copied. Only the two points marked *(sourced)* come from the search results.

## The reference editors

| Editor | Layout | What it does well |
|---|---|---|
| Medium | One centred column, no chrome; a floating toolbar appears only on text selection *(sourced)* | Nothing is visible until needed, so it feels like writing |
| Ghost | Narrow centred column, large title field, `+` or `/` to insert blocks; clean, minimal interface *(sourced)* | The page looks like the published result |
| Notion | Block list; drag handle and `+` in the left gutter; `/` inserts, selection shows a toolbar | Every paragraph is a movable, nestable block |
| Substack | Centred column, floating selection toolbar, `+` for embeds | Simple enough for non-writers |
| Linear (issue / doc) | Compact title and body, `/` and markdown shortcuts, properties in a side panel | Fast, keyboard-first, metadata beside the text instead of inside it |
| iA Writer | One column, focus mode dims all but the current line | The strongest example of minimal chrome |

## The pattern they share

1. One centred column, roughly 650-750px, no sidebars while writing.
2. Two ways in: a floating toolbar on selection (format existing text) and a `/` or `+` menu (insert new things). Most modern editors ship both *(sourced)*.
3. Markdown shortcuts (`#` + space, `-` + space, `>` + space for a quote).
4. Structured fields live outside the prose (title, metadata), not in the body.

## What this means for Perspectize

A perspective is not a blog post. The prose is the point, and the structured parts (thumbs, four ratings, custom fields, feelings, privacy) surround it. That maps best to Linear's arrangement: a writing column with the properties beside or below it, not competing with it.

The current dialog does the reverse: at 1280x800 the writing area is a 68px strip while the feel wheel takes the whole right half, and on a 768x1024 tablet the editor is still 68px inside an 800px-tall dialog (see the report, finding F04).

**Recommendation:** keep the dialog, but make the writing area the dominant element, keep one selection toolbar plus the existing slash-free toolbar, add quote support, and move the ratings and feel wheel into a secondary region.

## Tiptap is already the right base

`frontend/package.json` already depends on Tiptap v3 (built on ProseMirror), which has first-class bubble-menu and slash-command patterns. Lexical and Plate were not considered further: Lexical's Svelte support was not confirmed, and Plate is React-only.

## Sources

- [Top Notion-style WYSIWYG editors for React](https://www.wisp.blog/blog/top-notion-style-wysiwyg-editors-for-react)
- [Ghost editor UX review](https://goodux.appcues.com/blog/ghost-cms-editor-user-onboarding)
- [Ghost: using the editor](https://ghost.org/faq/using-the-editor/)
- [Floating toolbar guide](https://dev.to/eddyter/floating-toolbar-a-complete-guide-for-modern-rich-text-editors-1ado)
- [Which rich text editor framework should you choose (Liveblocks)](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025)
