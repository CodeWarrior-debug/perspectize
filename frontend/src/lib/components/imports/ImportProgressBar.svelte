<script lang="ts">
	import { useImportProgress } from '$lib/queries/imports/useImportProgress.svelte';
	import { progressLabel } from '$lib/utils/import-sheet';

	/**
	 * Live progress of this import's running batch, for everyone watching the
	 * sheet (not just whoever started it). The server pushes at most twice a
	 * second; the bar eases between updates. After a run it stays, showing the
	 * outcome, until dismissed.
	 */
	let { jobId }: { jobId: string } = $props();

	const progress = useImportProgress(() => jobId);
	let dismissedAt = $state<string | null>(null);

	const p = $derived(progress.current);
	const visible = $derived(!!p && p.total > 0 && (p.running || p.updatedAt !== dismissedAt));
	const pct = $derived(p && p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0);
</script>

{#if visible && p}
	<div
		class="border-border bg-card flex flex-col gap-2 rounded-lg border p-3"
		role="status"
		aria-live="polite"
		data-testid="import-progress"
	>
		<div class="flex items-center justify-between gap-3 text-sm">
			<span data-testid="import-progress-label">{progressLabel(p)}</span>
			{#if p.running}
				<span class="text-muted-foreground tabular-nums">{pct}%</span>
			{:else}
				<button
					type="button"
					class="text-muted-foreground text-sm underline"
					onclick={() => (dismissedAt = p.updatedAt)}
				>
					Dismiss
				</button>
			{/if}
		</div>
		<div
			class="bg-muted h-2 w-full overflow-hidden rounded-full"
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={p.total}
			aria-valuenow={p.done}
			aria-label="Import progress"
		>
			<div
				class="h-full rounded-full transition-[width] duration-500 ease-out"
				class:bg-primary={p.running || p.failed < p.done}
				class:bg-destructive={!p.running && p.done > 0 && p.failed === p.done}
				style:width={`${pct}%`}
			></div>
		</div>
	</div>
{/if}
