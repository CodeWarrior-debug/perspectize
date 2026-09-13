<script lang="ts">
	import { page } from '$app/state';
	import ThreadView from '$lib/components/messaging/ThreadView.svelte';
	import { useEditMessage } from '$lib/queries/messaging/useEditMessage';
	import { useDeleteMessage } from '$lib/queries/messaging/useDeleteMessage';

	const editMutation = useEditMessage();
	const deleteMutation = useDeleteMessage();

	function handleEdit(messageId: string, threadId: string, newBody: string, previousBody: string) {
		editMutation.mutate({ messageId, threadId, body: newBody, previousBody });
	}

	function handleDelete(messageId: string, threadId: string) {
		deleteMutation.mutate({ messageId, threadId });
	}
</script>

{#key page.params.threadId}
	<ThreadView threadId={page.params.threadId ?? ''} onEditMessage={handleEdit} onDeleteMessage={handleDelete} />
{/key}
