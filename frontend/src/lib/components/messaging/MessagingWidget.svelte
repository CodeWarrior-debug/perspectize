<script lang="ts">
	import { useMe } from '$lib/queries/hooks/useMe.svelte';
	import { useMessageThreads } from '$lib/queries/hooks/useMessageThreads';
	import { useEditMessage } from '$lib/queries/hooks/useEditMessage';
	import { useDeleteMessage } from '$lib/queries/hooks/useDeleteMessage';
	import { totalUnread } from '$lib/messaging/inboxCache';
	import ThreadList from './ThreadList.svelte';
	import ThreadView from './ThreadView.svelte';
	import NewThreadDialog from './NewThreadDialog.svelte';
	import MessageCircleIcon from '@lucide/svelte/icons/message-circle';
	import XIcon from '@lucide/svelte/icons/x';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';

	/**
	 * MessagingWidget — a floating action button (bottom-right) that opens an
	 * in-place messaging panel: a thread list, and a selected thread's
	 * ThreadView, without ever navigating away from the current page.
	 *
	 * The /messages and /messages/[threadId] routes still exist as plain,
	 * linkable full-page fallbacks (e.g. a direct URL); this widget is the
	 * primary entry point and does not use them.
	 */

	let open = $state(false);
	let selectedThreadId = $state<string | null>(null);
	let dialogOpen = $state(false);

	const meState = useMe();
	const myUserId = $derived(meState.me?.id ?? '');
	const signedIn = $derived(!!meState.me);

	const threadsQuery = useMessageThreads(() => signedIn);
	const unread = $derived(totalUnread(threadsQuery.data?.messageThreads ?? []));

	const editMutation = useEditMessage();
	const deleteMutation = useDeleteMessage();

	function handleEdit(messageId: string, threadId: string, newBody: string, previousBody: string) {
		editMutation.mutate({ messageId, threadId, body: newBody, previousBody });
	}

	function handleDelete(messageId: string, threadId: string) {
		deleteMutation.mutate({ messageId, threadId });
	}

	function togglePanel() {
		open = !open;
	}

	function closePanel() {
		open = false;
	}
</script>

{#if signedIn}
	<button
		type="button"
		onclick={togglePanel}
		aria-label={open ? 'Close messages' : 'Open messages'}
		data-testid="messaging-fab"
		class="fixed bottom-5 right-5 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
	>
		{#if open}
			<XIcon class="size-6" />
		{:else}
			<MessageCircleIcon class="size-6" />
			{#if unread > 0}
				<span
					data-testid="fab-unread"
					class="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-destructive-foreground"
				>
					{unread}
				</span>
			{/if}
		{/if}
	</button>

	{#if open}
		<div
			data-testid="messaging-panel"
			class="fixed bottom-24 right-5 z-40 flex h-[min(600px,calc(100vh-8rem))] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
		>
			{#if selectedThreadId}
				<div class="flex items-center gap-2 border-b border-border p-2">
					<button
						type="button"
						onclick={() => (selectedThreadId = null)}
						aria-label="Back to conversations"
						class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<ChevronLeftIcon class="size-4" />
					</button>
					<button
						type="button"
						onclick={closePanel}
						aria-label="Close messages"
						class="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<XIcon class="size-4" />
					</button>
				</div>
				<div class="min-h-0 flex-1">
					{#key selectedThreadId}
						<ThreadView threadId={selectedThreadId} onEditMessage={handleEdit} onDeleteMessage={handleDelete} />
					{/key}
				</div>
			{:else}
				<ThreadList
					threads={threadsQuery.data?.messageThreads ?? []}
					{myUserId}
					activeThreadId={null}
					loading={threadsQuery.isLoading}
					onNewThread={() => (dialogOpen = true)}
					onSelect={(id) => (selectedThreadId = id)}
				/>
			{/if}
		</div>
	{/if}

	<NewThreadDialog
		open={dialogOpen}
		onOpenChange={(v) => (dialogOpen = v)}
		{myUserId}
		onCreated={(id) => {
			selectedThreadId = id;
			open = true;
		}}
	/>
{/if}
