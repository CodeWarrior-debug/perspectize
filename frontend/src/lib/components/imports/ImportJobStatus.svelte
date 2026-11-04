<script lang="ts">
	import type { ImportJobSummary } from '$lib/queries/imports';

	/** Where an import stands: requested (by whom), declined (and why), or closed. Nothing for an open, approved import. */
	let { job }: { job: ImportJobSummary } = $props();

	function day(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC',
		});
	}
	const by = $derived(job.requestedBy?.username ?? 'someone');
</script>

{#if job.requestStatus === 'REQUESTED'}
	<p class="text-sm" data-testid="import-job-status">
		<span class="bg-accent rounded px-1.5 py-0.5 text-xs font-medium">Requested</span>
		<span class="text-muted-foreground">by {by} on {day(job.createdAt)} · waiting for an admin to approve it</span>
	</p>
{:else if job.requestStatus === 'DECLINED'}
	<p class="text-sm" data-testid="import-job-status">
		<span class="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-medium">Declined</span>
		<span class="text-muted-foreground">{by}'s request, on {day(job.reviewedAt)}: {job.reviewNote}</span>
	</p>
{:else if job.closedAt}
	<p class="text-sm" data-testid="import-job-status">
		<span class="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">Closed</span>
		<span class="text-muted-foreground">on {day(job.closedAt)} · read-only, visible to admins only</span>
	</p>
{/if}
