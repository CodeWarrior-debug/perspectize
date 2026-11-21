import { describe, it, expect, vi, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { createWritingShortcuts } from '#lib/utils/writingShortcuts.js';

let editor: Editor | null = null;

function makeEditor(content: string, onLink = vi.fn()) {
	editor = new Editor({
		element: document.createElement('div'),
		extensions: [createWritingShortcuts({ onLink }), StarterKit.configure({ heading: { levels: [2, 3] } })],
		content,
	});
	return { editor, onLink };
}

// Types one character the way the browser does, so input rules run.
function typeText(e: Editor, text: string) {
	for (const ch of text) {
		const { from, to } = e.state.selection;
		const handled = e.view.someProp('handleTextInput', (f) =>
			f(e.view, from, to, ch, () => e.state.tr.insertText(ch, from, to)),
		);
		if (!handled) e.view.dispatch(e.state.tr.insertText(ch, from, to));
	}
}

afterEach(() => {
	editor?.destroy();
	editor = null;
});

describe('writing shortcuts', () => {
	it('turns "# " at the start of a line into a Heading 2', () => {
		const { editor: e } = makeEditor('<p></p>');
		e.commands.focus('end');
		typeText(e, '# ');
		expect(e.isActive('heading', { level: 2 })).toBe(true);
		expect(e.state.doc.textContent).toBe('');
	});

	it('keeps "## " and "### " working', () => {
		const { editor: e } = makeEditor('<p></p>');
		e.commands.focus('end');
		typeText(e, '### ');
		expect(e.isActive('heading', { level: 3 })).toBe(true);
	});

	it('leaves a "#" that is not followed by a space as text', () => {
		const { editor: e } = makeEditor('<p></p>');
		e.commands.focus('end');
		typeText(e, '#tag');
		expect(e.isActive('heading')).toBe(false);
		expect(e.getText()).toBe('#tag');
	});

	it('does not convert "# " typed in the middle of a paragraph', () => {
		const { editor: e } = makeEditor('<p></p>');
		e.commands.focus('end');
		typeText(e, 'issue # ');
		expect(e.isActive('heading')).toBe(false);
		expect(e.getText()).toBe('issue # ');
	});

	it('Mod-K calls the link handler', () => {
		const { editor: e, onLink } = makeEditor('<p>hi</p>');
		e.commands.focus('end');
		const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
		const handled = e.view.someProp('handleKeyDown', (f) => f(e.view, event));
		expect(handled).toBe(true);
		expect(onLink).toHaveBeenCalledTimes(1);
	});
});
