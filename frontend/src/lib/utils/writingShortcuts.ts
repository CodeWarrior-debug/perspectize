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

/**
 * Typography keeps the typeset punctuation writers expect (curly quotes, an em dash for `--`, an
 * ellipsis for `...`) and drops the symbol swaps, which would rewrite plain text a reviewer typed on
 * purpose (`(c)` to a copyright sign, `->` to an arrow, `1/2` to a fraction).
 */
export const typographyOptions = {
	copyright: false,
	trademark: false,
	servicemark: false,
	registeredTrademark: false,
	leftArrow: false,
	rightArrow: false,
	plusMinus: false,
	notEqual: false,
	laquo: false,
	raquo: false,
	multiplication: false,
	superscriptTwo: false,
	superscriptThree: false,
	oneHalf: false,
	oneQuarter: false,
	threeQuarters: false,
} as const;
