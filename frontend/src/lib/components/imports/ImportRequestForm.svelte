<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/shadcn';
	import CommentsEditor from '$lib/components/CommentsEditor.svelte';
	import ImportSourceRows from '$lib/components/imports/ImportSourceRows.svelte';
	import { useCreateImportJob } from '$lib/queries/imports/useImportJobMutations';
	import {
		hasDescriptionText,
		importErrorMessage,
		isSourceFilled,
		newSourceRow,
		toSourceInputs,
		type SourceRow,
	} from '$lib/utils/import-sheet';

	/**
	 * Request an import: a name, and a description and/or one or more sources (a
	 * YouTube channel, or a person's films on TMDB). The description is the
	 * nuance the names don't carry. An admin's import starts listing at once;
	 * anyone else's waits for an admin to approve it.
	 */
	let { isAdmin, onCreated }: { isAdmin: boolean; onCreated?: () => void } = $props();

	let name = $state('');
	/** Sanitized HTML from the editor; "<p></p>" and other empty markup count as no description. */
	let description = $state('');
	let sources = $state<SourceRow[]>([newSourceRow()]);
	let error = $state('');
	const create = useCreateImportJob();

	const hasDescription = $derived(hasDescriptionText(description));
	const canSubmit = $derived(
		name.trim() !== '' && (hasDescription || sources.some((s) => isSourceFilled(s.ref))) && !create.isPending,
	);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		try {
			const res = await create.mutateAsync({
				name: name.trim(),
				description: hasDescription ? description : null,
				sources: toSourceInputs(sources),
			});
			const job = res.createImportJob;
			toast.success(
				job.requestStatus === 'APPROVED'
					? `"${job.name}" is listing now. Open it from Imports when it's ready.`
					: `Request sent. "${job.name}" waits for an admin to approve it.`,
			);
			name = '';
			description = '';
			sources = [newSourceRow()];
			onCreated?.();
		} catch (err) {
			error = importErrorMessage(err);
		}
	}
</script>

<form class="flex max-w-3xl flex-col gap-5" onsubmit={submit} data-testid="import-request-form">
	<p class="text-muted-foreground text-sm">
		{#if isAdmin}
			As an admin, your import starts listing as soon as you send it.
		{:else}
			An admin reviews each request before anything is listed. You can have up to 3 requests waiting at once.
		{/if}
	</p>

	<label class="flex flex-col gap-1.5 text-sm font-medium">
		Name
		<input
			type="text"
			bind:value={name}
			maxlength={120}
			required
			placeholder="e.g. Gaither Vocal Band, Jordan Peterson channels"
			class="border-border bg-background text-foreground rounded-md border px-3 py-2 font-normal"
		/>
	</label>

	<div class="flex flex-col gap-1.5">
		<span class="text-sm font-medium">
			Description <span class="text-muted-foreground font-normal">(optional)</span>
		</span>
		<CommentsEditor
			value={description}
			onChange={(html) => (description = html)}
			toolbar="basic"
			minHeight={120}
			placeholder="Who or what is this about? Say what the source names don't."
		/>
	</div>

	<fieldset class="flex flex-col gap-3">
		<legend class="mb-1.5 text-sm font-medium">
			Sources <span class="text-muted-foreground font-normal">(optional with a description)</span>
		</legend>
		<ImportSourceRows bind:sources />
	</fieldset>

	{#if error}
		<p class="text-destructive text-sm" role="alert" data-testid="import-request-error">{error}</p>
	{/if}

	<div>
		<Button type="submit" disabled={!canSubmit}>
			{create.isPending ? 'Sending…' : isAdmin ? 'Start import' : 'Send request'}
		</Button>
	</div>
</form>
