import { Extension, textblockTypeInputRule } from '@tiptap/core';

/**
 * Writing shortcuts that acclaimed editors (Notion, Linear, Ghost, Google Docs) share and that
 * Tiptap's StarterKit does not provide for this editor's two heading levels:
 *
 * - `# ` at the start of a line makes a Heading 2 (the largest level the editor offers, so the
 *   shortcut every Markdown writer reaches for first does something instead of typing a literal `#`).
 * - `Mod-K` opens the link prompt (the universal link shortcut; Link itself binds no key).
 */
export function createWritingShortcuts(options: { onLink: () => void }) {
	return Extension.create({
		name: 'writingShortcuts',

		addInputRules() {
			const heading = this.editor.schema.nodes.heading;
			if (!heading) return [];
			return [textblockTypeInputRule({ find: /^#\s$/, type: heading, getAttributes: { level: 2 } })];
		},

		addKeyboardShortcuts() {
			return {
				'Mod-k': () => {
					options.onLink();
					return true;
				},
			};
		},
	});
}
