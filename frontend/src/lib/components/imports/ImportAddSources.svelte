<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/shadcn';
	import ImportSourceRows from '$lib/components/imports/ImportSourceRows.svelte';
	import type { ImportJobSummary } from '$lib/queries/imports';
	import { useAddImportJobSources } from '$lib/queries/imports/useImportJobMutations';
	import {
		canAddImportSources,
		importErrorMessage,
		isSourceFilled,
		MAX_IMPORT_SOURCES,
		newSourceRow,
		toSourceInputs,
		type SourceRow,
	} from '$lib/utils/import-sheet';

	/**
	 * Add sources to an import that already exists: how a request made with only a
	 * description gets something to list. The requester may while the request waits
	 * for review (the sources wait with it); once approved only an admin may, and
	 * listing starts at once. Renders nothing for anyone else.
	 */
	let { job, meId, isAdmin }: { job: ImportJobSummary; meId: string | null | undefined; isAdmin: boolean } = $props();

	const add = useAddImportJobSources();
	let open = $state(false);
	let sources = $state<SourceRow[]>([newSourceRow()]);
	let error = $state('');

	const allowed = $derived(canAddImportSources(job, { id: meId, isAdmin }));
	const room = $derived(MAX_IMPORT_SOURCES - job.sources.length);
	const canSubmit = $derived(sources.some((s) => isSourceFilled(s.ref)) && !add.isPending);
	const startsListing = $derived(job.requestStatus === 'APPROVED');

	function close() {
		open = false;
		error = '';
		sources = [newSourceRow()];
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		try {
			await add.mutateAsync({ jobId: job.id, sources: toSourceInputs(sources) });
			toast.success(
				startsListing ? 'Added. Listing has started.' : 'Added. They are listed once an admin approves the request.',
			);
			close();
		} catch (err) {
			error = importErrorMessage(err);
		}
	}
</script>

{#if allowed}
	{#if !open}
		<Button type="button" variant="outline" size="sm" class="self-start" onclick={() => (open = true)}>
			Add sources
		</Button>
	{:else}
		<form class="flex max-w-3xl flex-col gap-3" onsubmit={submit} data-testid="import-add-sources">
			<p class="text-muted-foreground text-sm">
				{#if startsListing}
					These start listing as soon as you add them. This import has room for {room} more.
				{:else}
					These wait with the request until an admin approves it. This import has room for {room} more.
				{/if}
			</p>
			<ImportSourceRows bind:sources max={room} />
			{#if error}
				<p class="text-destructive text-sm" role="alert" data-testid="import-add-sources-error">{error}</p>
			{/if}
			<div class="flex gap-2">
				<Button type="submit" disabled={!canSubmit}>{add.isPending ? 'Adding…' : 'Add sources'}</Button>
				<Button type="button" variant="ghost" onclick={close}>Cancel</Button>
			</div>
		</form>
	{/if}
{/if}
