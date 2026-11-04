<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/shadcn';
	import type { ImportJobSummary } from '$lib/queries/imports';
	import { useCloseImportJob, useReviewImportJob } from '$lib/queries/imports/useImportJobMutations';
	import { importErrorMessage } from '$lib/utils/import-sheet';

	/**
	 * Admin controls for one import: approve or decline a request (a decline
	 * needs a reason, which the requester reads), and close or reopen an
	 * approved import. Renders nothing for anyone else.
	 */
	let { job, isAdmin }: { job: ImportJobSummary; isAdmin: boolean } = $props();

	const review = useReviewImportJob();
	const close = useCloseImportJob();
	let declining = $state(false);
	let confirmingClose = $state(false);
	let reason = $state('');

	async function approve() {
		try {
			await review.mutateAsync({ jobId: job.id, approve: true });
			toast.success(`Approved "${job.name}". Listing has started.`);
		} catch (err) {
			toast.error(importErrorMessage(err));
		}
	}

	async function decline() {
		try {
			await review.mutateAsync({ jobId: job.id, approve: false, note: reason });
			toast.success(`Declined "${job.name}".`);
			declining = false;
			reason = '';
		} catch (err) {
			toast.error(importErrorMessage(err));
		}
	}

	async function setClosed(closed: boolean) {
		try {
			await close.mutateAsync({ jobId: job.id, closed });
			toast.success(closed ? `Closed "${job.name}".` : `Reopened "${job.name}".`);
			confirmingClose = false;
		} catch (err) {
			toast.error(importErrorMessage(err));
		}
	}
</script>

{#if isAdmin}
	<div class="flex flex-wrap items-center gap-2" data-testid="import-job-actions">
		{#if job.requestStatus === 'REQUESTED'}
			{#if declining}
				<input
					type="text"
					bind:value={reason}
					maxlength={500}
					placeholder="Why? The requester reads this"
					aria-label="Reason for declining"
					class="border-border bg-background text-foreground min-w-64 rounded-md border px-2 py-1.5 text-sm"
				/>
				<Button
					type="button"
					size="sm"
					variant="destructive"
					disabled={!reason.trim() || review.isPending}
					onclick={decline}
				>
					Decline request
				</Button>
				<Button type="button" size="sm" variant="outline" onclick={() => (declining = false)}>Cancel</Button>
			{:else}
				<Button type="button" size="sm" disabled={review.isPending} onclick={approve}>Approve</Button>
				<Button type="button" size="sm" variant="outline" onclick={() => (declining = true)}>Decline…</Button>
			{/if}
		{:else if job.requestStatus === 'APPROVED'}
			{#if job.closedAt}
				<Button type="button" size="sm" variant="outline" disabled={close.isPending} onclick={() => setClosed(false)}>
					Reopen
				</Button>
			{:else if confirmingClose}
				<span class="text-muted-foreground text-sm">Hide it from everyone but admins, and stop all changes?</span>
				<Button type="button" size="sm" disabled={close.isPending} onclick={() => setClosed(true)}>Close import</Button>
				<Button type="button" size="sm" variant="outline" onclick={() => (confirmingClose = false)}>Cancel</Button>
			{:else}
				<Button type="button" size="sm" variant="outline" onclick={() => (confirmingClose = true)}>Close import…</Button
				>
			{/if}
		{/if}
	</div>
{/if}
