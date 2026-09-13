<script lang="ts">
	import type { MessageThread } from '$lib/queries/messaging';
	import { threadTitle } from '$lib/messaging/format';
	import { formatDateCompact } from '$lib/utils/formatting';
	import Avatar from './Avatar.svelte';

	let {
		thread,
		myUserId,
		active,
	}: { thread: MessageThread; myUserId: string; active: boolean } = $props();

	const title = $derived(threadTitle(thread, myUserId));
</script>

<a
	data-testid="thread-item"
	href={'/messages/' + thread.id}
	aria-current={active ? 'page' : undefined}
	class="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60 {active ? 'bg-muted' : ''}"
>
	<Avatar username={title} />
	<span class="min-w-0 flex-1">
		<span class="block truncate font-medium">{title}</span>
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
</a>
