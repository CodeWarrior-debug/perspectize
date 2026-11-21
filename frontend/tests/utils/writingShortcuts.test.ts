import { describe, it, expect, vi, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Typography from '@tiptap/extension-typography';
import { createWritingShortcuts, EditorHeading, typographyOptions } from '#lib/utils/writingShortcuts.js';

let editor: Editor | null = null;

function makeEditor(content: string, onLink = vi.fn()) {
	editor = new Editor({
		element: document.createElement('div'),
		extensions: [
			createWritingShortcuts({ onLink }),
			Typography.configure(typographyOptions),
			StarterKit.configure({ heading: { levels: [2, 3] } }),
		],
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

describe('typography', () => {
	it('typesets quotes, double hyphens and ellipses', () => {
		const { editor: e } = makeEditor('<p></p>');
		e.commands.focus('end');
		typeText(e, '"hi" it\'s a -- b...');
		expect(e.state.doc.textContent).toBe('\u201chi\u201d it\u2019s a \u2014 b\u2026');
	});

	it('leaves symbol look-alikes as typed', () => {
		const { editor: e } = makeEditor('<p></p>');
		e.commands.focus('end');
		typeText(e, '(c) a -> b 1/2 (tm) +/-');
		expect(e.state.doc.textContent).toBe('(c) a -> b 1/2 (tm) +/-');
	});
});

describe('pasted headings', () => {
	it('maps H1-H6 onto the two heading levels the editor has', () => {
		editor = new Editor({
			element: document.createElement('div'),
			extensions: [EditorHeading, StarterKit.configure({ heading: false })],
			content: '<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h6>e</h6><p>f</p>',
		});
		expect(editor.getHTML()).toBe('<h2>a</h2><h2>b</h2><h3>c</h3><h3>d</h3><h3>e</h3><p>f</p>');
	});
});
