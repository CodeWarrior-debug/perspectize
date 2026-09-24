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

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	data-testid="comment-fullscreen"
	class="fixed inset-0 bg-black/55 flex items-center justify-center p-4 z-[100]"
	onclick={handleBackdropClick}
>
	<div class="bg-white rounded-xl w-full max-w-[560px] max-h-[90%] flex flex-col overflow-hidden shadow-2xl">
		<!-- Header -->
		<div class="px-4 py-3 border-b border-border flex items-center justify-between">
			<span class="font-sans font-semibold text-[15px]">Comment</span>
			<button
				type="button"
				onclick={onClose}
				class="border-none bg-transparent cursor-pointer p-1.5 text-muted-foreground rounded-md hover:opacity-70"
				aria-label="Close"
			>
				<XIcon class="size-4" />
			</button>
		</div>
		<!-- Editor -->
		<div class="p-3.5 flex-1 overflow-auto flex">
			<div class="flex-1 min-w-0">
				<PerspectiveEditor {value} {onChange} minHeight={300} {isMobile} />
			</div>
		</div>
	</div>
</div>
