<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import { LIST_USERS, type UsersResponse } from '$lib/queries/users';
	import { queryKeys } from '$lib/queries/keys';
	import { useCreateMessageThread } from '$lib/queries/hooks/useCreateMessageThread';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter,
		Button,
		Input,
	} from '$lib/components/shadcn';

	let { open, onOpenChange, myUserId }: { open: boolean; onOpenChange: (open: boolean) => void; myUserId: string } =
		$props();

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
		createThread.mutate({ participantUserIds: [...selected] });
		onOpenChange(false);
	}
</script>

<Dialog bind:open onOpenChange={(v) => onOpenChange(v)}>
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
