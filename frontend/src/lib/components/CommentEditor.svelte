<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Underline from '@tiptap/extension-underline';
	import Placeholder from '@tiptap/extension-placeholder';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

	/**
	 * CommentEditor — lightweight rich text editor using Tiptap.
	 * Toolbar: B/I/U + bullet list + numbered list.
	 * Optional popout button for fullscreen editing.
	 */
	let {
		value = '',
		onChange,
		minHeight = 80,
		placeholder = 'Anything to write about your take?',
		showPopout = false,
		onPopout,
	}: {
		value?: string;
		onChange: (html: string) => void;
		minHeight?: number;
		placeholder?: string;
		showPopout?: boolean;
		onPopout?: () => void;
	} = $props();

	let editorElement: HTMLDivElement;
	let editor: Editor | null = $state(null);

	onMount(() => {
		editor = new Editor({
			element: editorElement,
			extensions: [
				StarterKit.configure({
					heading: false,
					codeBlock: false,
					blockquote: false,
					horizontalRule: false,
				}),
				Underline,
				Placeholder.configure({ placeholder }),
			],
			content: value,
			onUpdate: ({ editor: e }) => {
				onChange(e.getHTML());
			},
			editorProps: {
				attributes: {
					class: 'tiptap-content',
					style: `min-height: ${minHeight}px; padding: 8px 10px; outline: none; font-family: var(--font-serif); font-size: 13.5px; line-height: 1.5; color: var(--color-foreground); overflow-wrap: anywhere; word-break: break-word; white-space: pre-wrap;`,
				},
			},
		});
	});

	// Sync external value changes (e.g., from fullscreen editor)
	$effect(() => {
		if (editor && value !== editor.getHTML()) {
			editor.commands.setContent(value, { emitUpdate: false });
		}
	});

	onDestroy(() => {
		editor?.destroy();
	});

	function toolAction(command: () => void) {
		return (e: MouseEvent) => {
			e.preventDefault();
			command();
			editor?.commands.focus();
		};
	}
</script>

<div
	class="comment-editor-wrapper border border-input rounded-lg bg-card overflow-hidden flex flex-col w-full min-w-0"
>
	<!-- Toolbar -->
	<div class="flex items-center gap-0.5 px-1.5 py-1 border-b border-border bg-accent relative">
		<button
			type="button"
			class="tool-btn font-bold"
			class:active={editor?.isActive('bold')}
			onmousedown={toolAction(() => editor?.chain().focus().toggleBold().run())}
			aria-label="Bold">B</button
		>
		<button
			type="button"
			class="tool-btn italic font-serif"
			class:active={editor?.isActive('italic')}
			onmousedown={toolAction(() => editor?.chain().focus().toggleItalic().run())}
			aria-label="Italic">I</button
		>
		<button
			type="button"
			class="tool-btn underline"
			class:active={editor?.isActive('underline')}
			onmousedown={toolAction(() => editor?.chain().focus().toggleUnderline().run())}
			aria-label="Underline">U</button
		>

		<div class="w-px h-3.5 bg-border mx-1"></div>

		<button
			type="button"
			class="tool-btn"
			class:active={editor?.isActive('bulletList')}
			onmousedown={toolAction(() => editor?.chain().focus().toggleBulletList().run())}
			aria-label="Bullet list"
		>
			<svg
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
			>
				<line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line
					x1="8"
					y1="18"
					x2="21"
					y2="18"
				/>
				<circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle
					cx="4"
					cy="12"
					r="1.2"
					fill="currentColor"
					stroke="none"
				/><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />
			</svg>
		</button>
		<button
			type="button"
			class="tool-btn font-mono text-[11px] font-semibold"
			class:active={editor?.isActive('orderedList')}
			onmousedown={toolAction(() => editor?.chain().focus().toggleOrderedList().run())}
			aria-label="Numbered list">1.</button
		>

		{#if showPopout && onPopout}
			<button
				type="button"
				class="absolute top-1.5 right-1.5 p-1 border-none bg-transparent text-muted-foreground cursor-pointer rounded hover:opacity-70"
				onclick={onPopout}
				aria-label="Expand comment"
			>
				<ExternalLinkIcon class="size-3.5" />
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

	/* Tiptap content styles */
	:global(.tiptap-content ul),
	:global(.tiptap-content ol) {
		padding-left: 22px;
		margin: 4px 0;
	}
	:global(.tiptap-content li) {
		margin: 2px 0;
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
