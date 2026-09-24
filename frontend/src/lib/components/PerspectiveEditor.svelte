<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Underline from '@tiptap/extension-underline';
	import Placeholder from '@tiptap/extension-placeholder';
	import Link from '@tiptap/extension-link';
	import Image from '@tiptap/extension-image';
	import { Table } from '@tiptap/extension-table';
	import { TableRow } from '@tiptap/extension-table-row';
	import { TableCell } from '@tiptap/extension-table-cell';
	import { TableHeader } from '@tiptap/extension-table-header';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
	import Minimize2Icon from '@lucide/svelte/icons/minimize-2';
	import BoldIcon from '@lucide/svelte/icons/bold';
	import ItalicIcon from '@lucide/svelte/icons/italic';
	import UnderlineIcon from '@lucide/svelte/icons/underline';
	import ListIcon from '@lucide/svelte/icons/list';
	import ListOrderedIcon from '@lucide/svelte/icons/list-ordered';
	import LinkIcon from '@lucide/svelte/icons/link';
	import ImageIcon from '@lucide/svelte/icons/image';
	import TableIcon from '@lucide/svelte/icons/table';
	import RowIcon from '@lucide/svelte/icons/rows-2';
	import ColumnIcon from '@lucide/svelte/icons/columns-2';
	import TrashIcon from '@lucide/svelte/icons/trash-2';

	/**
	 * PerspectiveEditor — Tiptap editor for writing a perspective's review.
	 * Extends CommentEditor's bold/italic/underline/list toolbar with headings
	 * (H2/H3), links, image-by-URL, and tables (structural editing desktop-only).
	 * `CommentEditor.svelte` stays unmodified for non-perspective comment UIs.
	 */
	let {
		value = '',
		onChange,
		minHeight = 80,
		placeholder = 'Anything to write about your take?',
		showPopout = false,
		onPopout,
		expanded = false,
		isMobile = false,
	}: {
		value?: string;
		onChange: (html: string) => void;
		minHeight?: number;
		placeholder?: string;
		showPopout?: boolean;
		onPopout?: () => void;
		/** Grows the writing area in place; the popout button toggles it via `onPopout`. */
		expanded?: boolean;
		isMobile?: boolean;
	} = $props();

	let editorElement: HTMLDivElement;
	let editor: Editor | null = $state(null);
	// Bumped on every editor transaction so `items`/toolbar active-state
	// recomputes; Tiptap's Editor instance isn't itself reactive to Svelte.
	let updateTick = $state(0);

	onMount(() => {
		editor = new Editor({
			element: editorElement,
			extensions: [
				StarterKit.configure({
					codeBlock: false,
					blockquote: false,
					horizontalRule: false,
					heading: { levels: [2, 3] },
					// StarterKit v3 bundles Link and Underline; we register our own
					// configured copies below, so disable the bundled ones to avoid
					// duplicate extensions (which silently kept openOnClick/autolink on).
					link: false,
					underline: false,
					// Neither sanitizer allows <s>/<code>, so formatting made with their
					// shortcuts would be silently lost on save.
					strike: false,
					code: false,
				}),
				Underline,
				Placeholder.configure({ placeholder }),
				Link.configure({ openOnClick: false, autolink: false }),
				Image,
				Table.configure({ resizable: false }),
				TableRow,
				TableHeader,
				TableCell,
			],
			content: value,
			onUpdate: ({ editor: e }) => {
				onChange(e.getHTML());
				updateTick++;
			},
			onSelectionUpdate: () => {
				updateTick++;
			},
			editorProps: {
				attributes: {
					class: 'tiptap-content',
					style: `min-height: var(--pe-min-height, ${minHeight}px); padding: 8px 10px; outline: none; font-family: var(--font-serif); font-size: 13.5px; line-height: 1.5; color: var(--color-foreground); overflow-wrap: anywhere; word-break: break-word; white-space: pre-wrap;`,
				},
			},
		});
	});

	// Sync external value changes (e.g., a draft restored by the parent)
	$effect(() => {
		if (editor && value !== editor.getHTML()) {
			editor.commands.setContent(value, { emitUpdate: false });
		}
	});

	onDestroy(() => {
		editor?.destroy();
	});

	// Buttons run on `click` so keyboard activation (Enter/Space) works; the
	// `mousedown` preventDefault below keeps the editor selection from blurring.
	function toolAction(command: () => void) {
		return () => {
			command();
			editor?.commands.focus();
		};
	}

	function promptForLink() {
		if (!editor) return;
		const previousUrl = editor.getAttributes('link').href as string | undefined;
		const url = window.prompt('Link URL', previousUrl ?? 'https://');
		if (url === null) return; // cancelled
		if (url === '') {
			editor.chain().focus().extendMarkRange('link').unsetLink().run();
			return;
		}
		editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
	}

	function promptForImage() {
		if (!editor) return;
		const url = window.prompt('Image URL');
		if (!url) return;
		editor.chain().focus().setImage({ src: url }).run();
	}

	type ToolbarItem = {
		id: string;
		label: string;
		icon: typeof BoldIcon;
		isActive: () => boolean;
		run: () => void;
		desktopOnly?: boolean;
		/** Toggle buttons expose their on/off state via aria-pressed. */
		toggle?: boolean;
	};

	// `updateTick` is read here (unused otherwise) purely to force this $derived
	// to recompute on every editor transaction, since Tiptap's Editor instance
	// isn't itself reactive to Svelte.
	const items: ToolbarItem[] = $derived(
		editor && updateTick >= 0
			? [
					{
						id: 'bold',
						toggle: true,
						label: 'Bold',
						icon: BoldIcon,
						isActive: () => editor!.isActive('bold'),
						run: () => editor!.chain().focus().toggleBold().run(),
					},
					{
						id: 'italic',
						toggle: true,
						label: 'Italic',
						icon: ItalicIcon,
						isActive: () => editor!.isActive('italic'),
						run: () => editor!.chain().focus().toggleItalic().run(),
					},
					{
						id: 'underline',
						toggle: true,
						label: 'Underline',
						icon: UnderlineIcon,
						isActive: () => editor!.isActive('underline'),
						run: () => editor!.chain().focus().toggleUnderline().run(),
					},
					{
						id: 'bulletList',
						toggle: true,
						label: 'Bullet list',
						icon: ListIcon,
						isActive: () => editor!.isActive('bulletList'),
						run: () => editor!.chain().focus().toggleBulletList().run(),
					},
					{
						id: 'orderedList',
						toggle: true,
						label: 'Numbered list',
						icon: ListOrderedIcon,
						isActive: () => editor!.isActive('orderedList'),
						run: () => editor!.chain().focus().toggleOrderedList().run(),
					},
					{
						id: 'link',
						toggle: true,
						label: 'Link',
						icon: LinkIcon,
						isActive: () => editor!.isActive('link'),
						run: () => promptForLink(),
					},
					{
						id: 'image',
						label: 'Image',
						icon: ImageIcon,
						isActive: () => false,
						run: () => promptForImage(),
					},
					{
						id: 'insertTable',
						label: 'Insert table',
						icon: TableIcon,
						isActive: () => false,
						run: () => editor!.chain().focus().insertTable({ rows: 2, cols: 2 }).run(),
						desktopOnly: true,
					},
					{
						id: 'addRow',
						label: 'Add row',
						icon: RowIcon,
						isActive: () => false,
						run: () => editor!.chain().focus().addRowAfter().run(),
						desktopOnly: true,
					},
					{
						id: 'addColumn',
						label: 'Add column',
						icon: ColumnIcon,
						isActive: () => false,
						run: () => editor!.chain().focus().addColumnAfter().run(),
						desktopOnly: true,
					},
					{
						id: 'deleteTable',
						label: 'Delete table',
						icon: TrashIcon,
						isActive: () => false,
						run: () => editor!.chain().focus().deleteTable().run(),
						desktopOnly: true,
					},
				]
			: [],
	);

	const visibleItems = $derived(items.filter((i) => !i.desktopOnly || !isMobile));

	const headingLevels = [
		{ value: '0', label: 'Paragraph' },
		{ value: '2', label: 'Heading 2' },
		{ value: '3', label: 'Heading 3' },
	];

	// Reads `updateTick` so the dropdown re-evaluates on every selection/content
	// change (Tiptap's Editor isn't reactive to Svelte on its own).
	const headingValue = $derived.by(() => {
		void updateTick;
		if (!editor) return '0';
		if (editor.isActive('heading', { level: 2 })) return '2';
		if (editor.isActive('heading', { level: 3 })) return '3';
		return '0';
	});

	function onHeadingChange(e: Event) {
		if (!editor) return;
		const val = (e.target as HTMLSelectElement).value;
		if (val === '0') {
			editor.chain().focus().setParagraph().run();
		} else {
			editor
				.chain()
				.focus()
				.setHeading({ level: Number(val) as 2 | 3 })
				.run();
		}
	}
</script>

<div
	class="comment-editor-wrapper border border-input rounded-lg bg-card overflow-hidden flex flex-col w-full min-w-0"
	style:--pe-min-height={expanded ? 'min(60vh, 560px)' : `${minHeight}px`}
	data-expanded={expanded}
>
	<!-- Toolbar -->
	<div class="flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-accent relative flex-wrap">
		<select class="heading-select" value={headingValue} onchange={onHeadingChange} aria-label="Text style">
			{#each headingLevels as level (level.value)}
				<option value={level.value}>{level.label}</option>
			{/each}
		</select>

		<div class="w-px h-3.5 bg-border mx-1"></div>

		{#each visibleItems as item (item.id)}
			<button
				type="button"
				class="tool-btn"
				class:active={item.isActive()}
				onmousedown={(e) => e.preventDefault()}
				onclick={toolAction(item.run)}
				aria-label={item.label}
				aria-pressed={item.toggle ? item.isActive() : undefined}
			>
				<item.icon size={14} />
			</button>
		{/each}

		{#if showPopout && onPopout}
			<button
				type="button"
				class="absolute top-1.5 right-1.5 p-1 border-none bg-transparent text-muted-foreground cursor-pointer rounded hover:opacity-70"
				onclick={onPopout}
				aria-label={expanded ? 'Collapse comment' : 'Expand comment'}
				aria-pressed={expanded}
			>
				{#if expanded}
					<Minimize2Icon class="size-3.5" />
				{:else}
					<Maximize2Icon class="size-3.5" />
				{/if}
			</button>
		{/if}
	</div>

	<!-- Editor content -->
	<div bind:this={editorElement}></div>
</div>

<style>
	.tool-btn {
		width: 26px;
		height: 22px;
		border: none;
		background: transparent;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
		color: var(--color-muted-foreground);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.tool-btn:hover {
		background: var(--color-muted);
	}
	.tool-btn.active {
		background: var(--color-muted);
		color: var(--color-foreground);
	}

	.heading-select {
		height: 22px;
		font-size: 11px;
		border: none;
		background: transparent;
		color: var(--color-muted-foreground);
		border-radius: 4px;
		cursor: pointer;
	}
	.heading-select:hover {
		background: var(--color-muted);
	}

	/* Tiptap content styles */
	:global(.tiptap-content ul),
	:global(.tiptap-content ol) {
		padding-left: 22px;
		margin: 4px 0;
	}
	/* Tailwind's preflight resets list-style to none, so restore markers. */
	:global(.tiptap-content ul) {
		list-style: disc;
	}
	:global(.tiptap-content ol) {
		list-style: decimal;
	}
	:global(.tiptap-content a) {
		color: var(--color-primary);
		text-decoration: underline;
	}
	:global(.tiptap-content li) {
		margin: 2px 0;
	}
	:global(.tiptap-content h2) {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0.75rem 0 0.25rem;
	}
	:global(.tiptap-content h3) {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0.5rem 0 0.25rem;
	}
	:global(.tiptap-content img) {
		max-width: 100%;
		height: auto;
		border-radius: 4px;
	}
	:global(.tiptap-content table) {
		border-collapse: collapse;
		width: 100%;
		margin: 4px 0;
	}
	:global(.tiptap-content th),
	:global(.tiptap-content td) {
		border: 1px solid var(--color-border);
		padding: 4px 8px;
		text-align: left;
	}
	:global(.tiptap-content p.is-editor-empty:first-child::before) {
		content: attr(data-placeholder);
		color: var(--color-muted-foreground);
		opacity: 0.7;
		float: left;
		height: 0;
		pointer-events: none;
	}
</style>
