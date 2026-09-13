<script lang="ts">
	import type { MessageThread } from '$lib/queries/messaging';
	import { Button } from '$lib/components/shadcn';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ThreadListItem from './ThreadListItem.svelte';

	let {
		threads,
		myUserId,
		activeThreadId,
		loading,
		onNewThread,
		onSelect,
	}: {
		threads: MessageThread[];
		myUserId: string;
		activeThreadId: string | null;
		loading: boolean;
		onNewThread: () => void;
		onSelect?: (threadId: string) => void;
	} = $props();
</script>

<div class="flex h-full flex-col">
	<div class="flex items-center justify-between border-b border-border p-3">
		<h2 class="text-sm font-semibold">Messages</h2>
		<Button data-testid="new-thread" variant="outline" size="sm" onclick={onNewThread}>
			<PlusIcon class="size-4" />
		</Button>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto p-2">
		{#if loading && !threads.length}
			<p class="p-3 text-sm text-muted-foreground">Loading…</p>
		{:else if !threads.length}
			<p data-testid="threads-empty" class="p-3 text-sm text-muted-foreground">No conversations yet</p>
		{:else}
			{#each threads as thread (thread.id)}
				<ThreadListItem {thread} {myUserId} active={thread.id === activeThreadId} {onSelect} />
			{/each}
		{/if}
	</div>
</div>
