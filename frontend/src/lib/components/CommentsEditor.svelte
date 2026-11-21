<script lang="ts">
	import { normalizeLinkUrl } from '#lib/utils/linkUrl.js';
	import { createWritingShortcuts, typographyOptions } from '#lib/utils/writingShortcuts.js';
	import { createSlashCommand, type SlashItem, type SlashMenuState } from '#lib/utils/slashCommand.js';
	import { onMount, onDestroy, tick } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Underline from '@tiptap/extension-underline';
	import Placeholder from '@tiptap/extension-placeholder';
	import { CharacterCount } from '@tiptap/extensions';
	import Typography from '@tiptap/extension-typography';
	import BubbleMenu from '@tiptap/extension-bubble-menu';
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
	import UnlinkIcon from '@lucide/svelte/icons/unlink';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import ImageIcon from '@lucide/svelte/icons/image';
	import TableIcon from '@lucide/svelte/icons/table';
	import RowIcon from '@lucide/svelte/icons/rows-2';
	import ColumnIcon from '@lucide/svelte/icons/columns-2';
	import TrashIcon from '@lucide/svelte/icons/trash-2';

	/**
	 * CommentsEditor — Tiptap editor for rich-text comments (a perspective's
	 * `review`, a todo's `comments`). bold/italic/underline/list toolbar, plus
	 * headings (H2/H3), links, image-by-URL, and tables (structural editing
	 * desktop-only). `toolbar="basic"` drops image and table controls; the
	 * extensions stay registered so existing images/tables still render and save.
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
		toolbar = 'full',
		autofocus = false,
		status = '',
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
		/** `basic` hides the image and table buttons (short notes); `full` is the perspective editor. */
		toolbar?: 'full' | 'basic';
		/** Put the caret in the writing area on mount (desktop dialogs; a phone would raise its keyboard unasked). */
		autofocus?: boolean;
		/** Quiet note beside the word count (e.g. where the draft is kept). */
		status?: string;
	} = $props();

	let editorElement: HTMLDivElement;
	let wrapperElement: HTMLDivElement;
	let bubbleElement: HTMLDivElement | undefined = $state();
	let slashElement: HTMLDivElement;
	let slash: SlashMenuState | null = $state(null);
	// Inline link editor: lives in the selection toolbar instead of the browser's prompt().
	let linkEditing = $state(false);
	let linkText = $state('');
	let linkInput: HTMLInputElement | undefined = $state();
	let editor: Editor | null = $state(null);
	// Bumped on every editor transaction so `items`/toolbar active-state
	// recomputes; Tiptap's Editor instance isn't itself reactive to Svelte.
	let updateTick = $state(0);

	// `/` at the start of a line: insert things without leaving the keyboard. The table needs room, so it is desktop-only.
	const buildSlashItems = (): SlashItem[] => [
		{
			id: 'h2',
			label: 'Heading 2',
			hint: '##',
			keywords: ['title', 'heading', 'h2'],
			run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
		},
		{
			id: 'h3',
			label: 'Heading 3',
			hint: '###',
			keywords: ['subtitle', 'heading', 'h3'],
			run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
		},
		{
			id: 'bullets',
			label: 'Bullet list',
			hint: '-',
			keywords: ['unordered', 'points'],
			run: (e) => e.chain().focus().toggleBulletList().run(),
		},
		{
			id: 'numbers',
			label: 'Numbered list',
			hint: '1.',
			keywords: ['ordered', 'steps'],
			run: (e) => e.chain().focus().toggleOrderedList().run(),
		},
		{
			id: 'link',
			label: 'Link',
			hint: isMobile ? 'by URL' : /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K',
			keywords: ['url', 'source'],
			run: () => openLinkEditor(),
		},
		{ id: 'image', label: 'Image', hint: 'by URL', keywords: ['picture', 'photo'], run: () => promptForImage() },
		...(isMobile
			? []
			: [
					{
						id: 'table',
						label: 'Table',
						hint: '2 × 2',
						keywords: ['grid', 'compare'],
						run: (e: Editor) => e.chain().focus().insertTable({ rows: 2, cols: 2 }).run(),
					},
				]),
	];

	onMount(() => {
		editor = new Editor({
			element: editorElement,
			extensions: [
				createWritingShortcuts({ onLink: openLinkEditor }),
				createSlashCommand({
					items: buildSlashItems(),
					getMenuElement: () => slashElement,
					getContainer: () => wrapperElement,
					onState: (state) => (slash = state),
				}),
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
				CharacterCount,
				// Floating selection toolbar (Medium / Notion / Substack): format the words you just selected without
				// travelling to the top toolbar. Desktop only: a phone's own selection menu occupies the same spot.
				...(isMobile
					? []
					: [
							BubbleMenu.configure({
								element: bubbleElement,
								appendTo: () => wrapperElement,
								options: { strategy: 'absolute', placement: 'top', offset: 8, flip: true, shift: { padding: 8 } },
								shouldShow: ({ editor: e, from, to }) =>
									linkEditing || (e.isFocused && !e.isActive('image') && (from !== to || e.isActive('link'))),
							}),
						]),
				Typography.configure(typographyOptions),
				Link.configure({ openOnClick: false, autolink: false }),
				Image,
				Table.configure({ resizable: false }),
				TableRow,
				TableHeader,
				TableCell,
			],
			content: value,
			autofocus: autofocus ? 'end' : false,
			onUpdate: ({ editor: e }) => {
				onChange(e.getHTML());
				updateTick++;
			},
			onSelectionUpdate: () => {
				updateTick++;
			},
			editorProps: {
				attributes: {
					role: 'textbox',
					'aria-multiline': 'true',
					'aria-label': 'Comment',
					class: 'tiptap-content',
					style: `min-height: var(--pe-min-height, ${minHeight}px); padding: 8px 10px; outline: none; font-family: var(--font-slot-longform, var(--font-serif)); font-size: 13.5px; line-height: 1.5; color: var(--color-foreground); overflow-wrap: anywhere; word-break: break-word; white-space: pre-wrap;`,
				},
			},
		});
	});

	// The caret stays in the text while the menu is open, so the menu's current row is announced via activedescendant.
	$effect(() => {
		const dom = editor?.view.dom;
		if (!dom) return;
		if (slash) dom.setAttribute('aria-activedescendant', `slash-${slash.items[slash.index].id}`);
		else dom.removeAttribute('aria-activedescendant');
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

	// Words selected (or the caret inside a link) open the inline editor next to the text; with nothing selected, or on
	// a phone where the selection toolbar is absent, fall back to the browser prompt.
	function openLinkEditor() {
		if (!editor) return;
		if (editor.isActive('link')) editor.chain().focus().extendMarkRange('link').run();
		if (isMobile || editor.state.selection.empty) {
			promptForLink();
			return;
		}
		linkText = (editor.getAttributes('link').href as string | undefined) ?? 'https://';
		linkEditing = true;
		void tick().then(() => {
			linkInput?.focus();
			linkInput?.select();
		});
	}

	function closeLinkEditor() {
		linkEditing = false;
		editor?.commands.focus();
	}

	function applyLinkText() {
		if (!editor) return;
		const href = normalizeLinkUrl(linkText);
		linkEditing = false;
		if (href === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
		else editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
	}

	function removeLink() {
		if (!editor) return;
		linkEditing = false;
		editor.chain().focus().extendMarkRange('link').unsetLink().run();
	}

	function onLinkInputKeydown(e: KeyboardEvent) {
		if (e.isComposing) return;
		// Keep Enter and Escape from reaching the perspective form and the dialog: Enter would save the
		// perspective, Escape would close it.
		if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			applyLinkText();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			closeLinkEditor();
		}
	}

	function onLinkInputBlur(e: FocusEvent) {
		// Clicking Apply or Remove keeps focus in the input (mousedown is prevented), so a blur is a real exit.
		if (!bubbleElement?.contains(e.relatedTarget as Node | null)) linkEditing = false;
	}

	function promptForLink() {
		if (!editor) return;
		const previousUrl = editor.getAttributes('link').href as string | undefined;
		const url = window.prompt('Link URL', previousUrl ?? 'https://');
		if (url === null) return; // cancelled
		const href = normalizeLinkUrl(url);
		if (href === '') {
			editor.chain().focus().extendMarkRange('link').unsetLink().run();
			return;
		}
		if (editor.state.selection.empty && !editor.isActive('link')) {
			// Nothing selected: a link needs text, so the address itself becomes the link text.
			editor
				.chain()
				.focus()
				.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
				.run();
			return;
		}
		editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
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
						run: () => openLinkEditor(),
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

	// What the floating toolbar shows: link editor, link card (caret inside a link), or the format buttons.
	const bubbleMode = $derived.by<'edit' | 'card' | 'format'>(() => {
		void updateTick;
		if (linkEditing) return 'edit';
		if (editor && editor.state.selection.empty && editor.isActive('link')) return 'card';
		return 'format';
	});
	const linkHref = $derived.by(() => {
		void updateTick;
		return (editor?.getAttributes('link').href as string | undefined) ?? '';
	});
	const linkOpenable = $derived(/^(https?:|mailto:)/i.test(linkHref));

	// The toolbar changes width with its mode; ask Tiptap to re-centre it once Svelte has rendered the new content.
	$effect(() => {
		void bubbleMode;
		void tick().then(() => {
			if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('bubbleMenu', 'updatePosition'));
		});
	});

	const BUBBLE_IDS = ['bold', 'italic', 'underline', 'link'];
	const bubbleItems = $derived(items.filter((i) => BUBBLE_IDS.includes(i.id)));

	const BASIC_TOOLBAR_IDS = new Set(['bold', 'italic', 'underline', 'bulletList', 'orderedList', 'link']);

	const visibleItems = $derived(
		items.filter((i) => (!i.desktopOnly || !isMobile) && (toolbar === 'full' || BASIC_TOOLBAR_IDS.has(i.id))),
	);

	// Words as the writer counts them (Ghost / iA Writer footer). Reads `updateTick` so it follows every edit.
	const wordCount = $derived.by(() => {
		void updateTick;
		return editor ? (editor.storage.characterCount.words() as number) : 0;
	});

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
	bind:this={wrapperElement}
	class="comment-editor-wrapper relative border border-input rounded-lg bg-card flex flex-col w-full min-w-0"
	class:overflow-clip={!slash}
	style:--pe-min-height={expanded ? 'min(60dvh, 560px)' : `${minHeight}px`}
	style:--pe-max-height={expanded ? 'min(60dvh, 560px)' : `max(${minHeight}px, min(40dvh, 320px))`}
	data-expanded={expanded}
>
	<!-- Toolbar -->
	<!-- Sticky: typing scrolls the phone sheet to keep the caret visible, which would otherwise carry the toolbar under the header. -->
	<div class="sticky top-0 z-10 flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-muted flex-wrap">
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
				onmousedown={(e) => e.preventDefault()}
				onclick={() => {
					onPopout?.();
					// Expanding is part of writing: the caret stays in the text so typing carries on.
					editor?.commands.focus();
				}}
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
	<!-- Scrolls past --pe-max-height so a long review never pushes the dialog's submit button off-screen -->
	<div
		bind:this={editorElement}
		class="comment-editor-scroll"
		style="max-height: var(--pe-max-height); overflow-y: auto;"
	></div>

	<!-- Insert menu: the plugin moves this node next to the caret while a line starts with "/". -->
	<div
		bind:this={slashElement}
		class="slash-menu"
		role="listbox"
		aria-label="Insert"
		style:display={slash ? 'flex' : 'none'}
	>
		{#each slash?.items ?? [] as item, i (item.id)}
			<button
				type="button"
				role="option"
				tabindex="-1"
				id={`slash-${item.id}`}
				class="slash-item"
				class:active={i === slash?.index}
				aria-selected={i === slash?.index}
				onmousedown={(e) => e.preventDefault()}
				onclick={() => slash?.choose(i)}
			>
				<span>{item.label}</span>
				<span class="slash-hint">{item.hint}</span>
			</button>
		{/each}
	</div>

	{#if !isMobile}
		<!-- Floating selection toolbar; Tiptap moves this node next to the selection and hides it otherwise. -->
		<div
			bind:this={bubbleElement}
			class="bubble-toolbar"
			role="toolbar"
			aria-label="Format selection"
			style="visibility: hidden"
		>
			{#if bubbleMode === 'edit'}
				<input
					bind:this={linkInput}
					bind:value={linkText}
					class="bubble-input"
					type="text"
					inputmode="url"
					autocomplete="off"
					spellcheck="false"
					aria-label="Link URL"
					placeholder="Paste or type a link"
					onkeydown={onLinkInputKeydown}
					onblur={onLinkInputBlur}
				/>
				<button
					type="button"
					class="tool-btn"
					aria-label="Apply link"
					onmousedown={(e) => e.preventDefault()}
					onclick={applyLinkText}
				>
					<CheckIcon size={14} />
				</button>
				{#if linkHref}
					<button
						type="button"
						class="tool-btn"
						aria-label="Remove link"
						onmousedown={(e) => e.preventDefault()}
						onclick={removeLink}
					>
						<UnlinkIcon size={14} />
					</button>
				{/if}
			{:else if bubbleMode === 'card'}
				<span class="bubble-url" title={linkHref}>{linkHref}</span>
				{#if linkOpenable}
					<a
						class="tool-btn"
						href={linkHref}
						target="_blank"
						rel="noopener noreferrer"
						aria-label="Open link in a new tab"
						onmousedown={(e) => e.preventDefault()}
					>
						<ExternalLinkIcon size={14} />
					</a>
				{/if}
				<button
					type="button"
					class="tool-btn"
					aria-label="Edit link"
					onmousedown={(e) => e.preventDefault()}
					onclick={openLinkEditor}
				>
					<PencilIcon size={14} />
				</button>
				<button
					type="button"
					class="tool-btn"
					aria-label="Remove link"
					onmousedown={(e) => e.preventDefault()}
					onclick={removeLink}
				>
					<UnlinkIcon size={14} />
				</button>
			{:else}
				{#each bubbleItems as item (item.id)}
					<button
						type="button"
						class="tool-btn"
						class:active={item.isActive()}
						onmousedown={(e) => e.preventDefault()}
						onclick={toolAction(item.run)}
						aria-label={`${item.label} (selection)`}
						aria-pressed={item.toggle ? item.isActive() : undefined}
					>
						<item.icon size={14} />
					</button>
				{/each}
			{/if}
		</div>
	{/if}

	<!-- Quiet footer: appears with the first word (or a status) so an empty editor stays clean. -->
	{#if wordCount > 0 || status}
		<div class="editor-footer">
			<span class="editor-status" role="status">{status}</span>
			{#if wordCount > 0}
				<span data-testid="word-count">{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
			{/if}
		</div>
	{/if}
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
	/* The toolbar sits on --color-muted, so hover/active are a foreground wash: the accent is a
	   bold brand colour in many themes and made the icons unreadable. */
	.tool-btn:hover {
		background: color-mix(in srgb, var(--color-foreground) 10%, transparent);
	}
	.tool-btn.active {
		background: color-mix(in srgb, var(--color-foreground) 16%, transparent);
		color: var(--color-foreground);
	}

	.bubble-input {
		width: 15rem;
		height: 22px;
		padding: 0 6px;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-background);
		color: var(--color-foreground);
		font-size: 12px;
	}
	.bubble-url {
		align-self: center;
		max-width: 14rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 0 6px;
		font-size: 12px;
		color: var(--color-muted-foreground);
	}

	.slash-menu {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 40;
		flex-direction: column;
		min-width: 11rem;
		padding: 4px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-popover, var(--color-card));
		box-shadow: 0 6px 20px color-mix(in srgb, var(--color-foreground) 20%, transparent);
	}
	.slash-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1.5rem;
		padding: 5px 8px;
		border: none;
		border-radius: 5px;
		background: transparent;
		font-size: 13px;
		color: var(--color-foreground);
		cursor: pointer;
		text-align: left;
	}
	.slash-item.active,
	.slash-item:hover {
		background: color-mix(in srgb, var(--color-foreground) 10%, transparent);
	}
	.slash-hint {
		font-size: 11px;
		color: var(--color-muted-foreground);
	}

	/* Absolute and shrink-wrapped from the start: Floating UI measures the node before it first positions it. */
	.bubble-toolbar {
		position: absolute;
		top: 0;
		left: 0;
		width: max-content;
		display: flex;
		gap: 2px;
		padding: 3px;
		z-index: 30;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-popover, var(--color-card));
		box-shadow: 0 4px 14px color-mix(in srgb, var(--color-foreground) 18%, transparent);
	}

	.editor-footer {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 2px 10px 3px;
		font-size: 11px;
		color: var(--color-muted-foreground);
		border-top: 1px solid var(--color-border);
		font-variant-numeric: tabular-nums;
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
		background: color-mix(in srgb, var(--color-foreground) 10%, transparent);
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
