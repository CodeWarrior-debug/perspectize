<script lang="ts">
	import type { ThreadParticipant } from '$lib/queries/messaging';
	import Avatar from './Avatar.svelte';

	let {
		participants,
		seq,
		myUserId,
	}: { participants: ThreadParticipant[]; seq: number; myUserId: string } = $props();

	const readers = $derived(
		participants.filter((p) => p.user.id !== myUserId && p.lastReadSeq >= seq),
	);
	const shown = $derived(readers.slice(0, 3));
	const extra = $derived(readers.length - shown.length);
</script>

{#if readers.length}
	<div data-testid="receipts" class="flex -space-x-1">
		{#each shown as r (r.user.id)}
			<Avatar size="sm" username={r.user.username} />
		{/each}
		{#if extra > 0}
			<span class="text-[10px] text-muted-foreground">+{extra}</span>
		{/if}
	</div>
{/if}
