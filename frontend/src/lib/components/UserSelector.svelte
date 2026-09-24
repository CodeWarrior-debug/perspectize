<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import { LIST_USERS, type User, type UsersResponse } from '$lib/queries/users';
	import { queryKeys } from '$lib/queries/keys';
	import { setSelectedUserId, getSelectedUserId } from '$lib/stores/userSelection.svelte';
	import CreateUserPopover from '$lib/components/CreateUserPopover.svelte';
	import { Select, SelectTrigger, SelectContent, SelectItem } from '$lib/components/shadcn';

	const usersQuery = createQuery(() => ({
		queryKey: queryKeys.users.list(),
		queryFn: () => graphqlRequest<UsersResponse>(LIST_USERS),
		staleTime: 5 * 60 * 1000, // 5 minutes
	}));

	function handleUserCreated(userId: string) {
		setSelectedUserId(parseInt(userId, 10));
	}

	const currentUserId = $derived(getSelectedUserId());

	// bits-ui Select uses string value
	let selectedValue = $state<string | undefined>(undefined);

	// Sync selectedValue with currentUserId
	$effect(() => {
		selectedValue = currentUserId ? String(currentUserId) : undefined;
	});

	// Handle selection change
	function handleValueChange(value: string | undefined) {
		setSelectedUserId(value ? parseInt(value, 10) : null);
	}

	// Get username for display
	const selectedUsername = $derived(() => {
		if (!selectedValue || !usersQuery.data) return 'Select user...';
		const user = usersQuery.data.users.find((u) => u.id === selectedValue);
		return user ? user.username : 'Select user...';
	});
</script>

<div class="flex items-center gap-2">
	{#if usersQuery.isLoading}
		<div
			class="h-9 rounded-md border border-header-foreground/30 bg-header-foreground/10 px-3 text-sm text-header-foreground flex items-center opacity-50"
		>
			Loading users...
		</div>
	{:else if usersQuery.error}
		<div
			class="h-9 rounded-md border border-header-foreground/30 bg-header-foreground/10 px-3 text-sm text-destructive flex items-center"
		>
			Error loading users
		</div>
	{:else if usersQuery.data}
		<Select bind:value={selectedValue} onValueChange={handleValueChange} type="single">
			<SelectTrigger
				class="w-28 sm:w-36 md:w-48 bg-header-foreground/10 text-header-foreground border-header-foreground/30"
			>
				{selectedUsername()}
			</SelectTrigger>
			<SelectContent>
				{#each usersQuery.data.users as user}
					<SelectItem value={user.id}>
						{user.username}
					</SelectItem>
				{/each}
			</SelectContent>
		</Select>
	{/if}
	<CreateUserPopover onUserCreated={handleUserCreated} />
</div>
