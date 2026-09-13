<script lang="ts">
	import { page } from '$app/state';
	import { useMe } from '$lib/queries/hooks/useMe.svelte';
	import { useMessageThreads } from '$lib/queries/hooks/useMessageThreads';
	import ThreadList from '$lib/components/messaging/ThreadList.svelte';
	import NewThreadDialog from '$lib/components/messaging/NewThreadDialog.svelte';

	let { children } = $props();

	const meState = useMe();
	const myUserId = $derived(meState.me?.id ?? '');
	const threadsQuery = useMessageThreads();

	let dialogOpen = $state(false);

	const activeThreadId = $derived(page.params.threadId ?? null);
	const mobileThreadOpen = $derived(!!page.params.threadId);
</script>

<div class="flex h-[calc(100vh-4rem)]">
	<div class="w-full border-r border-border md:block md:w-80 {mobileThreadOpen ? 'hidden' : ''}">
		<ThreadList
			threads={threadsQuery.data?.messageThreads ?? []}
			{myUserId}
			{activeThreadId}
			loading={threadsQuery.isLoading}
			onNewThread={() => (dialogOpen = true)}
		/>
	</div>
	<div class="min-w-0 flex-1">
		{@render children()}
	</div>
</div>

<NewThreadDialog open={dialogOpen} onOpenChange={(v) => (dialogOpen = v)} {myUserId} />
