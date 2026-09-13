<script lang="ts">
	import { Input, Label } from '$lib/components/shadcn';
	import FormPopover from '$lib/components/FormPopover.svelte';
	import { useCreateUser } from '$lib/queries/users/useCreateUser';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';

	let { onUserCreated }: { onUserCreated: (userId: string) => void } = $props();

	let open = $state(false);
	let username = $state('');

	// Reset form when popover opens
	$effect(() => {
		if (open) {
			username = '';
		}
	});

	const mutation = useCreateUser();

	// Close popover and notify parent on success
	$effect(() => {
		if (mutation.isSuccess && mutation.data) {
			open = false;
			onUserCreated(mutation.data.createUser.id);
		}
	});

	function handleSubmit() {
		mutation.mutate({ username: username.trim() });
	}
</script>

<FormPopover
	bind:open
	triggerLabel="New User"
	triggerVariant="outline"
	title="New User"
	description="Create a new user account."
	submitLabel="Create User"
	pendingLabel="Creating..."
	isPending={mutation.isPending}
	isSubmitDisabled={!username.trim()}
	onSubmit={handleSubmit}
>
	{#snippet triggerIcon()}
		<UserPlusIcon class="size-4" />
	{/snippet}
	{#snippet formFields()}
		<div class="space-y-2">
			<Label for="username">Username</Label>
			<Input
				id="username"
				type="text"
				placeholder="Enter username"
				bind:value={username}
				disabled={mutation.isPending}
				autocomplete="off"
			/>
		</div>
	{/snippet}
</FormPopover>
