<script lang="ts">
	import type { Message } from '$lib/queries/messaging';
	import { isOptimistic } from '$lib/messaging/optimistic';
	import { messageClockTime } from '$lib/messaging/format';
	import Avatar from './Avatar.svelte';

	let { message, mine, showSender }: { message: Message; mine: boolean; showSender: boolean } =
		$props();
</script>

<div data-testid="message" class="flex gap-2 {mine ? 'justify-end' : 'justify-start'}">
	{#if !mine && showSender}
		<Avatar size="sm" username={message.sender.username} />
	{/if}
	<div
		class="max-w-[75%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap {mine
			? 'bg-primary text-primary-foreground'
			: 'bg-muted text-foreground'}"
	>
		{#if !mine && showSender}
			<span class="block text-xs font-medium opacity-70">{message.sender.username}</span>
		{/if}
		{message.body}
		<span class="block text-[10px] opacity-60">
			{messageClockTime(message.createdAt)}{isOptimistic(message) ? ' · sending…' : ''}
		</span>
	</div>
</div>
