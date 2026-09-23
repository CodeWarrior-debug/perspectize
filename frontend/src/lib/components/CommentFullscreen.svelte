<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import PerspectiveEditor from './PerspectiveEditor.svelte';

	/**
	 * CommentFullscreen — overlay for expanded comment editing.
	 * Shares value/onChange with the inline PerspectiveEditor.
	 */
	let {
		value = '',
		onChange,
		onClose,
		isMobile = false,
	}: {
		value?: string;
		onChange: (html: string) => void;
		onClose: () => void;
		isMobile?: boolean;
	} = $props();

	// Guard against losing in-progress edits made only inside this fullscreen
	// overlay (e.g. reached via the mobile "Add a comment" tap) — track what
	// the review HTML was when the overlay opened and confirm before discard.
	const initialValue = value;
	let currentValue = $state(value);

	function handleChange(html: string) {
		currentValue = html;
		onChange(html);
	}

	function requestClose() {
		if (currentValue !== initialValue) {
			const confirmed = window.confirm('Close without saving your changes to this comment?');
			if (!confirmed) return;
		}
		onClose();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) requestClose();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 bg-black/55 flex items-center justify-center p-4 z-[100]" onclick={handleBackdropClick}>
	<div class="bg-white rounded-xl w-full max-w-[560px] max-h-[90%] flex flex-col overflow-hidden shadow-2xl">
		<!-- Header -->
		<div class="px-4 py-3 border-b border-border flex items-center justify-between">
			<span class="font-sans font-semibold text-[15px]">Comment</span>
			<button
				type="button"
				onclick={requestClose}
				class="border-none bg-transparent cursor-pointer p-1.5 text-muted-foreground rounded-md hover:opacity-70"
				aria-label="Close"
			>
				<XIcon class="size-4" />
			</button>
		</div>
		<!-- Editor -->
		<div class="p-3.5 flex-1 overflow-auto flex">
			<div class="flex-1 min-w-0">
				<PerspectiveEditor value={currentValue} onChange={handleChange} minHeight={300} {isMobile} />
			</div>
		</div>
	</div>
</div>
