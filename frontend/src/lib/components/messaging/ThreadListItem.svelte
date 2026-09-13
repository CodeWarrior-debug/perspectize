<script lang="ts">
	import type { MessageThread } from '$lib/queries/messaging';
	import { threadTitle } from '$lib/messaging/format';
	import { formatDateCompact } from '$lib/utils/formatting';
	import Avatar from './Avatar.svelte';
	import BellIcon from '@lucide/svelte/icons/bell';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';
	import { useMuteThread } from '$lib/queries/hooks/useMuteThread';

	let {
		thread,
		myUserId,
		active,
	}: { thread: MessageThread; myUserId: string; active: boolean } = $props();

	const title = $derived(threadTitle(thread, myUserId));
	const muteMutation = useMuteThread();

	function toggleMute(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		muteMutation.mutate({ threadId: thread.id, muted: !thread.muted });
	}
</script>

<a
	data-testid="thread-item"
	href={'/messages/' + thread.id}
	aria-current={active ? 'page' : undefined}
	class="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60 {active ? 'bg-muted' : ''}"
>
	<Avatar username={title} />
	<span class="min-w-0 flex-1">
		<span class="flex min-w-0 items-center gap-1">
			<span class="block truncate font-medium">{title}</span>
			{#if thread.muted}
				<BellOffIcon size={12} class="shrink-0 text-muted-foreground" aria-label="Muted" />
			{/if}
		</span>
		<span class="block text-xs text-muted-foreground">{formatDateCompact(thread.lastMessageAt)}</span>
	</span>
	{#if thread.unreadCount > 0}
		<span
			data-testid="unread"
			class="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
		>
			{thread.unreadCount}
		</span>
	{/if}
	<button
		onclick={toggleMute}
		class="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
		aria-label={thread.muted ? 'Unmute thread' : 'Mute thread'}
		title={thread.muted ? 'Unmute' : 'Mute notifications'}
	>
		{#if thread.muted}
			<BellIcon size={14} />
		{:else}
			<BellOffIcon size={14} />
		{/if}
	</button>
</a>
