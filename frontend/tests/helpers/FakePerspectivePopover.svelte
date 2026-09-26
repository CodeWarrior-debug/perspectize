<script lang="ts">
	/**
	 * FakePerspectivePopover — test double for PerspectivePopover.svelte.
	 * Avoids needing a real QueryClientProvider/Clerk context (the real
	 * component's useCreatePerspective/useUpdatePerspective mutations require
	 * one) just to prove a caller (VideoCard) opened it with the right props.
	 */
	let {
		contentId,
		contentName,
		userId,
	}: {
		contentId: number;
		contentName: string;
		userId: number;
		open?: boolean;
		onClose?: () => void;
		onSuccess?: () => void;
	} = $props();
</script>

<div data-testid="fake-perspective-popover" data-content-id={contentId} data-user-id={userId}>
	Perspective popover for {contentName}
</div>
