import { Extension, type Editor } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';

export type SlashItem = {
	id: string;
	label: string;
	/** Short reminder of the Markdown shortcut or what the item does. */
	hint: string;
	/** Words a writer might type after the slash, besides the label. */
	keywords?: string[];
	run: (editor: Editor) => void;
};

/** What the menu needs to draw itself; `null` means closed. */
export type SlashMenuState = {
	items: SlashItem[];
	index: number;
	choose: (index: number) => void;
};

export function filterSlashItems(items: SlashItem[], query: string): SlashItem[] {
	const q = query.trim().toLowerCase();
	if (q === '') return items;
	return items.filter((item) => [item.label, ...(item.keywords ?? [])].some((w) => w.toLowerCase().includes(q)));
}

/**
 * `/` at the start of a line opens an insert menu (Notion, Ghost, Linear, Substack). Anchored to
 * the line start so "and/or", dates and URLs never open it.
 */
export function createSlashCommand(options: {
	items: SlashItem[];
	/** The menu element Svelte renders; the plugin mounts it next to the caret. */
	getMenuElement: () => HTMLElement | undefined;
	/** Where the menu may extend beyond the editor's own box. */
	getContainer: () => HTMLElement | undefined;
	onState: (state: SlashMenuState | null) => void;
}) {
	return Extension.create({
		name: 'slashCommand',

		// Ahead of the list and table keymaps, which would otherwise take Enter and Tab before the open menu sees them.
		priority: 1000,

		addProseMirrorPlugins() {
			return [
				Suggestion<SlashItem, SlashItem>({
					editor: this.editor,
					char: '/',
					startOfLine: true,
					allowSpaces: false,
					items: ({ query }) => filterSlashItems(options.items, query),
					command: ({ editor, range, props }) => {
						editor.chain().focus().deleteRange(range).run();
						props.run(editor);
					},
					render: () => {
						let index = 0;
						let unmount: (() => void) | undefined;
						let latest: { items: SlashItem[]; command: (item: SlashItem) => void } | null = null;

						const emit = () => {
							if (!latest || latest.items.length === 0) {
								options.onState(null);
								return;
							}
							const { items, command } = latest;
							options.onState({ items, index, choose: (i) => command(items[i]) });
						};

						return {
							onStart: (props) => {
								index = 0;
								latest = props;
								const el = options.getMenuElement();
								if (el) unmount = props.mount(el);
								emit();
							},
							onUpdate: (props) => {
								latest = props;
								index = Math.min(index, Math.max(props.items.length - 1, 0));
								emit();
							},
							onKeyDown: ({ event }) => {
								// The first Escape only dismisses the menu; letting it through would also close the dialog.
								if (event.key === 'Escape') {
									event.stopPropagation();
									return true;
								}
								if (!latest || latest.items.length === 0) return false;
								const count = latest.items.length;
								if (event.key === 'ArrowDown') {
									index = (index + 1) % count;
									emit();
									return true;
								}
								if (event.key === 'ArrowUp') {
									index = (index - 1 + count) % count;
									emit();
									return true;
								}
								if (event.key === 'Enter' || event.key === 'Tab') {
									latest.command(latest.items[index]);
									return true;
								}
								return false;
							},
							onExit: () => {
								latest = null;
								unmount?.();
								unmount = undefined;
								options.onState(null);
							},
						};
					},
					container: options.getContainer(),
				}),
			];
		},
	});
}
