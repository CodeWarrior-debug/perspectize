<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import { GET_MESSAGE_THREAD, type GetMessageThreadResponse, type MessagingUser } from '$lib/queries/messaging';
	import { queryKeys } from '$lib/queries/keys';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import { useThreadMessages } from '$lib/queries/messaging/useThreadMessages.svelte';
	import { useSendMessage } from '$lib/queries/messaging/useSendMessage';
	import { useSetTyping } from '$lib/queries/messaging/useSetTyping';
	import { useMarkThreadRead } from '$lib/queries/messaging/useMarkThreadRead';
	import { createThreadStream } from '$lib/messaging/useThreadStream.svelte';
	import { otherParticipants } from '$lib/messaging/format';
	import { showSenderForIndex, lastKnownSeq, typingUsernames, shouldMarkRead } from './threadView.helpers';
	import MessageBubble from './MessageBubble.svelte';
	import MessageComposer from './MessageComposer.svelte';
	import TypingIndicator from './TypingIndicator.svelte';
	import ReadReceiptAvatars from './ReadReceiptAvatars.svelte';
	import PresenceDot from './PresenceDot.svelte';

	let {
		threadId,
		onEditMessage,
		onDeleteMessage,
	}: {
		threadId: string;
		onEditMessage: (messageId: string, threadId: string, newBody: string, previousBody: string) => void;
		onDeleteMessage: (messageId: string, threadId: string) => void;
	} = $props();

	const queryClient = useQueryClient();
	const meState = useMe();
	const myUserId = $derived(meState.me?.id ?? '');
	const meUser = $derived<MessagingUser>({
		id: meState.me?.id ?? '',
		username: meState.me?.username ?? '',
	});

	const threadQuery = createQuery(() => ({
		queryKey: queryKeys.messaging.threads.detail(threadId),
		queryFn: async () => {
			const res = await graphqlRequest<GetMessageThreadResponse>(GET_MESSAGE_THREAD, {
				id: threadId,
			});
			return res.messageThread;
		},
		staleTime: 30_000,
	}));

	const messages = useThreadMessages(() => threadId);
	const send = useSendMessage();
	const setTyping = useSetTyping();
	const markRead = useMarkThreadRead();

	const items = $derived(messages.query.data?.items ?? []);
	const thread = $derived(threadQuery.data ?? null);
	const others = $derived(thread ? otherParticipants(thread, myUserId) : []);
	const currentSeq = $derived(lastKnownSeq(items));

	let stream = $state<ReturnType<typeof createThreadStream> | null>(null);
	let scrollEl: HTMLDivElement | null = $state(null);
	let lastItemCount = 0;
	// Not $state: read and written by the same effect below (unlike `stream`,
	// which is written-only there and exists purely to drive the template).
	let currentStream: ReturnType<typeof createThreadStream> | null = null;

	$effect(() => {
		const id = threadId;
		if (!myUserId) return;
		currentStream?.stop();
		const nextStream = createThreadStream({ queryClient, getThreadId: () => id, myUserId });
		nextStream.start();
		currentStream = nextStream;
		stream = nextStream;
		return () => nextStream.stop();
	});

	$effect(() => {
		const seq = currentSeq;
		if (thread && shouldMarkRead(thread) && seq > thread.myLastReadSeq) {
			markRead.mutate({ threadId, seq });
		}
	});

	$effect(() => {
		const count = items.length;
		if (!scrollEl) {
			lastItemCount = count;
			return;
		}
		if (count > lastItemCount) {
			const scrolledUp = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight > 200;
			if (!scrolledUp) scrollEl.scrollTop = scrollEl.scrollHeight;
		}
		lastItemCount = count;
	});

	function onScroll() {
		if (scrollEl && scrollEl.scrollTop < 80) messages.fetchOlder();
	}

	function handleSend(body: string) {
		send.mutate({ threadId, body, sender: meUser, afterSeq: currentSeq });
	}
</script>

<div class="flex h-full flex-col">
	<div class="flex items-center gap-2 border-b border-border p-3">
		<span class="font-semibold">
			{others.map((u) => u.username).join(', ') || 'Just you'}
		</span>
		{#each others as u (u.id)}
			<PresenceDot state={stream?.presence[u.id]} />
		{/each}
	</div>

	<div
		bind:this={scrollEl}
		data-testid="thread-scroll"
		onscroll={onScroll}
		class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
	>
		{#if messages.isFetchingOlder}
			<p class="text-center text-xs text-muted-foreground">Loading earlier messages…</p>
		{/if}
		{#each items as message, i (message.id)}
			<MessageBubble
				{message}
				mine={message.sender.id === myUserId}
				showSender={showSenderForIndex(items, i)}
				currentUser={meUser}
				onEdit={onEditMessage}
				onDelete={onDeleteMessage}
			/>
		{/each}
		{#if thread && items.length}
			<div class="flex justify-end">
				<ReadReceiptAvatars participants={thread.participants} seq={currentSeq} {myUserId} />
			</div>
		{/if}
	</div>

	<TypingIndicator usernames={typingUsernames(thread, stream?.typingUserIds ?? [])} />

	<MessageComposer onSend={handleSend} onTypingChange={(typing) => setTyping.mutate({ threadId, typing })} />
</div>
