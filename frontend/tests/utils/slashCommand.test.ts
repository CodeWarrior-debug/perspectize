import { describe, it, expect, vi, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { createSlashCommand, filterSlashItems, type SlashItem, type SlashMenuState } from '#lib/utils/slashCommand.js';

const items: SlashItem[] = [
	{
		id: 'h2',
		label: 'Heading 2',
		hint: '##',
		keywords: ['title'],
		run: (e) => e.chain().setHeading({ level: 2 }).run(),
	},
	{ id: 'h3', label: 'Heading 3', hint: '###', run: (e) => e.chain().setHeading({ level: 3 }).run() },
	{
		id: 'bullets',
		label: 'Bullet list',
		hint: '-',
		keywords: ['points'],
		run: (e) => e.chain().toggleBulletList().run(),
	},
];

let editor: Editor | null = null;

function setup() {
	const states: Array<SlashMenuState | null> = [];
	editor = new Editor({
		element: document.createElement('div'),
		extensions: [
			StarterKit.configure({ heading: { levels: [2, 3] } }),
			createSlashCommand({
				items,
				getMenuElement: () => undefined,
				getContainer: () => undefined,
				onState: (s) => states.push(s),
			}),
		],
		content: '<p></p>',
	});
	editor.commands.focus('end');
	return { e: editor, states, last: () => states[states.length - 1] };
}

function typeText(e: Editor, text: string) {
	for (const ch of text) {
		const { from, to } = e.state.selection;
		const handled = e.view.someProp('handleTextInput', (f) =>
			f(e.view, from, to, ch, () => e.state.tr.insertText(ch, from, to)),
		);
		if (!handled) e.view.dispatch(e.state.tr.insertText(ch, from, to));
	}
}

function press(e: Editor, key: string) {
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	e.view.someProp('handleKeyDown', (f) => f(e.view, event));
	return event;
}

afterEach(() => {
	editor?.destroy();
	editor = null;
});

describe('filterSlashItems', () => {
	it('returns everything for an empty query', () => {
		expect(filterSlashItems(items, '')).toHaveLength(3);
	});
	it('matches labels and keywords, ignoring case', () => {
		expect(filterSlashItems(items, 'HEAD').map((i) => i.id)).toEqual(['h2', 'h3']);
		expect(filterSlashItems(items, 'points').map((i) => i.id)).toEqual(['bullets']);
	});
	it('returns nothing when no word matches', () => {
		expect(filterSlashItems(items, 'zzz')).toEqual([]);
	});
});

describe('slash command menu', () => {
	it('opens with every item when "/" starts a line', async () => {
		const { e, last } = setup();
		typeText(e, '/');
		await vi.waitFor(() => expect(last()?.items).toHaveLength(3));
		expect(last()?.index).toBe(0);
	});

	it('does not open for a "/" in the middle of a line', async () => {
		const { e, states } = setup();
		typeText(e, 'and/or');
		await new Promise((r) => setTimeout(r, 50));
		expect(states.filter(Boolean)).toHaveLength(0);
	});

	it('narrows as the writer types and closes when nothing matches', async () => {
		const { e, last } = setup();
		typeText(e, '/head');
		await vi.waitFor(() => expect(last()?.items.map((i) => i.id)).toEqual(['h2', 'h3']));
		typeText(e, 'zzz');
		await vi.waitFor(() => expect(last()).toBeNull());
	});

	it('moves the highlight with the arrow keys, wrapping at both ends', async () => {
		const { e, last } = setup();
		typeText(e, '/');
		await vi.waitFor(() => expect(last()?.items).toHaveLength(3));
		press(e, 'ArrowDown');
		expect(last()?.index).toBe(1);
		press(e, 'ArrowUp');
		press(e, 'ArrowUp');
		expect(last()?.index).toBe(2);
		press(e, 'ArrowDown');
		expect(last()?.index).toBe(0);
	});

	it('Enter removes the typed "/query" and applies the highlighted item', async () => {
		const { e, last } = setup();
		typeText(e, '/head');
		await vi.waitFor(() => expect(last()?.items).toHaveLength(2));
		press(e, 'ArrowDown');
		press(e, 'Enter');
		expect(e.isActive('heading', { level: 3 })).toBe(true);
		expect(e.state.doc.textContent).toBe('');
	});

	it('choose(i) applies that row, as a mouse click does', async () => {
		const { e, last } = setup();
		typeText(e, '/');
		await vi.waitFor(() => expect(last()?.items).toHaveLength(3));
		last()!.choose(2);
		expect(e.isActive('bulletList')).toBe(true);
		expect(e.state.doc.textContent).toBe('');
	});

	it('Escape closes the menu, keeps the typed text and does not reach the dialog', async () => {
		const { e, last } = setup();
		typeText(e, '/hea');
		await vi.waitFor(() => expect(last()?.items).toHaveLength(2));
		const stop = vi.fn();
		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		event.stopPropagation = stop;
		e.view.someProp('handleKeyDown', (f) => f(e.view, event));
		expect(stop).toHaveBeenCalled();
		await vi.waitFor(() => expect(last()).toBeNull());
		expect(e.state.doc.textContent).toBe('/hea');
	});

	it('Escape is kept from the dialog even while no item matches', async () => {
		const { e, last } = setup();
		typeText(e, '/zzz');
		await vi.waitFor(() => expect(last()).toBeNull());
		const stop = vi.fn();
		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		event.stopPropagation = stop;
		e.view.someProp('handleKeyDown', (f) => f(e.view, event));
		expect(stop).toHaveBeenCalled();
	});

	// The list keymap claims Enter (splitListItem) unless the menu's handler is ahead of it.
	it('Enter picks the highlighted item inside a list item instead of splitting the list', async () => {
		const { e, last } = setup();
		e.commands.setContent('<ul><li><p>one</p></li><li><p></p></li></ul>');
		let pos = 0;
		e.state.doc.descendants((node, p) => {
			if (node.type.name === 'paragraph' && node.content.size === 0 && p > 3) pos = p + 1;
		});
		e.commands.setTextSelection(pos);
		typeText(e, '/head');
		await vi.waitFor(() => expect(last()?.items.map((i) => i.id)).toEqual(['h2', 'h3']));
		press(e, 'Enter');
		expect(e.state.doc.textContent).toBe('one');
		expect(e.isActive('heading', { level: 2 })).toBe(true);
	});
});
