<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import { graphqlRequest } from '$lib/queries/client';
	import { LIST_USERS, type UsersResponse } from '$lib/queries/users';
	import { queryKeys } from '$lib/queries/keys';
	import { useCreateMessageThread } from '$lib/queries/messaging/useCreateMessageThread';
	import type { CreateMessageThreadResponse } from '$lib/queries/messaging';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter,
		Button,
		Input,
	} from '$lib/components/shadcn';

	let {
		open,
		onOpenChange,
		myUserId,
		onCreated,
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		myUserId: string;
		/** Called with the new thread's id instead of navigating to /messages/[id] — used by the floating messaging widget, which selects the thread in place. */
		onCreated?: (threadId: string) => void;
	} = $props();

	let filter = $state('');
	let selected = $state(new Set<string>());

	const usersQuery = createQuery(() => ({
		queryKey: queryKeys.users.list(),
		queryFn: () => graphqlRequest<UsersResponse>(LIST_USERS),
		staleTime: 5 * 60_000,
	}));

	const createThread = useCreateMessageThread();

	const candidates = $derived(
		(usersQuery.data?.users ?? [])
			.filter((u) => u.id !== myUserId)
			.filter((u) => u.username.toLowerCase().includes(filter.trim().toLowerCase())),
	);

	$effect(() => {
		if (!open) {
			filter = '';
			selected = new Set();
		}
	});

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	function start() {
		if (!selected.size) return;
		createThread.mutate(
			{ participantUserIds: [...selected] },
			{
				onSuccess: (data: CreateMessageThreadResponse) => {
					const threadId = data.createMessageThread.id;
					if (onCreated) onCreated(threadId);
					else goto('/messages/' + threadId);
				},
			},
		);
		onOpenChange(false);
	}
</script>

<Dialog {open} onOpenChange={(v) => onOpenChange(v)}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>New conversation</DialogTitle>
		</DialogHeader>

		<Input data-testid="user-filter" bind:value={filter} placeholder="Filter people…" />

		<div class="max-h-64 overflow-y-auto">
			{#each candidates as u (u.id)}
				<button
					type="button"
					data-testid="user-option"
					onclick={() => toggle(u.id)}
					class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60 {selected.has(
						u.id,
					)
						? 'bg-muted'
						: ''}"
				>
					<span>{u.username}</span>
				</button>
			{/each}
		</div>

		<DialogFooter>
			<Button data-testid="start-thread" disabled={!selected.size || createThread.isPending} onclick={start}>
				Start
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
