<script lang="ts">
	/**
	 * FakePerspectiveEditor — test double for PerspectiveEditor.svelte.
	 * Avoids driving real Tiptap/ProseMirror from jsdom (not practical to
	 * simulate typing into a contenteditable reliably) while still letting
	 * tests exercise a caller's onChange wiring via a plain textarea.
	 */
	let {
		value = '',
		onChange,
		isMobile = false,
	}: {
		value?: string;
		onChange: (html: string) => void;
		minHeight?: number;
		placeholder?: string;
		showPopout?: boolean;
		onPopout?: () => void;
		isMobile?: boolean;
	} = $props();
</script>

<textarea
	aria-label="Comment"
	data-mobile={isMobile}
	{value}
	oninput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
></textarea>
