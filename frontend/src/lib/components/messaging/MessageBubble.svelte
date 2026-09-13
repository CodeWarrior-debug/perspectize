<script lang="ts">
	import type { Message, MessagingUser } from '$lib/queries/messaging';
	import { isOptimistic } from '$lib/messaging/optimistic';
	import { messageClockTime } from '$lib/messaging/format';
	import Avatar from './Avatar.svelte';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';

	let {
		message,
		mine,
		showSender,
		currentUser,
		onEdit,
		onDelete,
	}: {
		message: Message;
		mine: boolean;
		showSender: boolean;
		currentUser: MessagingUser;
		onEdit: (messageId: string, threadId: string, newBody: string, previousBody: string) => void;
		onDelete: (messageId: string, threadId: string) => void;
	} = $props();

	const isOwn = $derived(mine);
	const isDeleted = $derived(message.deletedAt != null || message.body === '');

	let editing = $state(false);
	let editBody = $state('');

	function startEdit() {
		editBody = message.body;
		editing = true;
	}

	function cancelEdit() {
		editing = false;
	}

	function confirmEdit() {
		const trimmed = editBody.trim();
		if (trimmed && trimmed !== message.body) {
			onEdit(message.id, message.threadId, trimmed, message.body);
		}
		editing = false;
	}

	function handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			confirmEdit();
		}
		if (e.key === 'Escape') {
			cancelEdit();
		}
	}

	function handleDelete() {
		onDelete(message.id, message.threadId);
	}
</script>

<div data-testid="message" class="group relative flex gap-2 {mine ? 'justify-end' : 'justify-start'}">
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
		{#if isDeleted}
			<p class="text-sm italic text-muted-foreground">message deleted</p>
		{:else if editing}
			<div class="flex flex-col gap-1">
				<textarea
					class="w-full resize-none rounded border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none"
					rows={2}
					bind:value={editBody}
					onkeydown={handleEditKeydown}
					aria-label="Edit message body"
				></textarea>
				<div class="flex gap-1">
					<button onclick={confirmEdit} aria-label="Confirm edit" class="text-primary hover:opacity-80">
						<CheckIcon size={14} />
					</button>
					<button onclick={cancelEdit} aria-label="Cancel edit" class="text-muted-foreground hover:opacity-80">
						<XIcon size={14} />
					</button>
				</div>
			</div>
		{:else}
			{message.body}
			{#if message.editedAt}
				<span class="text-xs opacity-70">(edited)</span>
			{/if}
		{/if}
		<span class="block text-[10px] opacity-60">
			{messageClockTime(message.createdAt)}{isOptimistic(message) ? ' · sending…' : ''}
		</span>
	</div>

	{#if isOwn && !editing && !isDeleted}
		<div
			class="absolute -top-6 right-0 hidden items-center gap-1 rounded border border-border bg-background px-1 py-0.5 shadow-sm group-hover:flex"
		>
			<button onclick={startEdit} aria-label="Edit message" class="text-muted-foreground hover:text-foreground">
				<PencilIcon size={14} />
			</button>
			<button onclick={handleDelete} aria-label="Delete message" class="text-muted-foreground hover:text-destructive">
				<Trash2Icon size={14} />
			</button>
		</div>
	{/if}
</div>
