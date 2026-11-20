<script lang="ts">
	import {
		Button,
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle,
	} from '$lib/components/shadcn';
	import { claimHasOthersError } from '$lib/queries/content/claims';
	import { useDeleteClaim } from '$lib/queries/content/useDeleteClaim';

	let { claimId, open = $bindable(false), onDone }: { claimId: string; open?: boolean; onDone?: () => void } = $props();

	// 'confirm' asks before deleting. 'blocked' appears when other users have engaged
	// with the claim, and offers to keep it as anonymous instead.
	let step = $state<'confirm' | 'blocked'>('confirm');

	// Each time the dialog opens, start again at the confirm step.
	$effect(() => {
		if (open) step = 'confirm';
	});

	const deleteClaim = useDeleteClaim();

	async function remove(keepAnonymous: boolean) {
		try {
			await deleteClaim.mutateAsync({ id: claimId, keepAnonymous });
			open = false;
			onDone?.();
		} catch (err) {
			if (!keepAnonymous && claimHasOthersError(err)) step = 'blocked';
		}
	}
</script>

<Dialog bind:open>
	<DialogContent>
		<DialogHeader>
			{#if step === 'confirm'}
				<DialogTitle>Delete this claim?</DialogTitle>
				<DialogDescription>This removes the claim for good.</DialogDescription>
			{:else}
				<DialogTitle>Other people have engaged with this claim</DialogTitle>
				<DialogDescription>
					It can't be deleted while others have perspectives or plan items on it. You can keep it as anonymous instead:
					it stays, attributed to an anonymous user, so those perspectives are kept. You won't be able to edit it
					afterwards.
				</DialogDescription>
			{/if}
		</DialogHeader>
		<DialogFooter>
			<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
			{#if step === 'confirm'}
				<Button type="button" variant="destructive" disabled={deleteClaim.isPending} onclick={() => remove(false)}>
					Delete
				</Button>
			{:else}
				<Button type="button" disabled={deleteClaim.isPending} onclick={() => remove(true)}>Keep as anonymous</Button>
			{/if}
		</DialogFooter>
	</DialogContent>
</Dialog>
