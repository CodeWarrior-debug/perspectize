<script lang="ts">
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import type { ImportSource } from '$lib/queries/imports';
	import { useImportListingProgress } from '$lib/queries/imports/useImportListingProgress.svelte';
	import { useMe } from '$lib/queries/users/useMe.svelte';

	/**
	 * Admin only: while an import's sources are listed, how many rows each has
	 * staged so far and in how many batches, and the total. After the run it
	 * says what was built, until dismissed. Hidden when the live connection is
	 * down (the sheet then refreshes by polling) rather than showing a number
	 * that stops moving.
	 */
	let { jobId, sources }: { jobId: string; sources: ImportSource[] } = $props();

	let armed = $state(false);
	let dismissedAt = $state<string | null>(null);

	// A panel belongs to one import: nothing latched or dismissed for one job carries to another.
	// Declared before the hook so these run first in the same flush.
	$effect(() => {
		void jobId;
		armed = false;
		dismissedAt = null;
	});
	// Latch: once any source is listing, stay armed. The end-of-run refetch flips the sources to
	// READY, which must not drop the subscription or unmount the "Built N rows" panel.
	$effect(() => {
		void jobId;
		if (sources.some((s) => s.status === 'LISTING')) armed = true;
	});

	// Admins only, and only for an import that has listed: an idle import opens no subscription.
	const me = useMe();
	const live = useImportListingProgress(
		() => jobId,
		() => me.isAdmin && armed,
	);

	const p = $derived(live.progress);
	const visible = $derived(
		me.isAdmin && live.status === 'connected' && !!p && (p.listing || p.updatedAt !== dismissedAt),
	);
	const total = $derived(p ? p.sources.reduce((n, s) => n + s.staged, 0) : 0);
	const rows = $derived(
		sources.map((s) => {
			const snap = p?.sources.find((x) => x.sourceId === s.id);
			return {
				id: s.id,
				title: s.title ?? s.sourceRef,
				status: snap?.status ?? s.status,
				staged: snap?.staged ?? 0,
				batches: snap?.batches ?? 0,
				reason: s.statusDetail,
			};
		}),
	);

	function plural(n: number, one: string, many: string): string {
		return `${n} ${n === 1 ? one : many}`;
	}
</script>

{#if visible && p}
	<div
		class="border-border bg-card flex flex-col gap-2 rounded-lg border p-3 text-sm"
		role="status"
		aria-live="polite"
		data-testid="import-listing-progress"
	>
		<div class="flex items-center justify-between gap-3">
			<span class="font-medium" data-testid="import-listing-label">
				{#if p.listing}
					Building: {plural(total, 'row', 'rows')} from {plural(p.sources.length, 'source', 'sources')}
				{:else}
					Built {plural(total, 'row', 'rows')}
				{/if}
			</span>
			{#if !p.listing}
				<button
					type="button"
					class="text-muted-foreground text-sm underline"
					onclick={() => (dismissedAt = p.updatedAt)}
				>
					Dismiss
				</button>
			{/if}
		</div>
		<ul class="flex flex-col gap-1">
			{#each rows as r (r.id)}
				<li
					class="flex flex-wrap items-center gap-x-2 gap-y-0.5"
					data-testid={`listing-source-${r.id}`}
					data-status={r.status}
				>
					<span>{r.title}</span>
					{#if r.status === 'LISTING'}
						<span class="inline-flex" data-testid="listing-spinner">
							<LoaderCircleIcon class="size-3.5 animate-spin" />
						</span>
						<span class="text-muted-foreground">{r.staged} staged · {plural(r.batches, 'batch', 'batches')}</span>
					{:else if r.status === 'READY'}
						<span class="text-muted-foreground">Ready · {plural(r.staged, 'row', 'rows')}</span>
					{:else if r.status === 'FAILED'}
						<span class="text-destructive">Failed</span>
						{#if r.reason}
							<span class="text-destructive text-xs">{r.reason}</span>
						{/if}
					{:else if r.status === 'WAITING'}
						<span class="text-muted-foreground">Waiting for approval</span>
					{:else}
						<span class="text-muted-foreground">{r.status}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
