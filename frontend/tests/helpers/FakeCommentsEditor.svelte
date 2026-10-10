<script lang="ts">
	/**
	 * FakeCommentsEditor — test double for CommentsEditor.svelte.
	 * Avoids driving real Tiptap/ProseMirror from jsdom (not practical to
	 * simulate typing into a contenteditable reliably) while still letting
	 * tests exercise a caller's onChange wiring via a plain textarea.
	 */
	let {
		value = '',
		onChange,
		showPopout = false,
		onPopout,
		expanded = false,
		isMobile = false,
		toolbar = 'full',
	}: {
		value?: string;
		onChange: (html: string) => void;
		minHeight?: number;
		placeholder?: string;
		showPopout?: boolean;
		onPopout?: () => void;
		expanded?: boolean;
		isMobile?: boolean;
		toolbar?: 'full' | 'basic';
	} = $props();
</script>

<textarea
	aria-label="Comment"
	data-mobile={isMobile}
	data-toolbar={toolbar}
	data-expanded={expanded}
	{value}
	oninput={(e) => onChange((e.target as HTMLTextAreaElement).value)}></textarea>
{#if showPopout}
	<button type="button" aria-label={expanded ? 'Collapse comment' : 'Expand comment'} onclick={() => onPopout?.()}
	></button>
{/if}
