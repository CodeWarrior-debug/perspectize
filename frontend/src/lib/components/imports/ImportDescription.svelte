<script lang="ts">
	import { toast } from 'svelte-sonner';
	import CommentsEditor from '$lib/components/CommentsEditor.svelte';
	import SafeHtml from '$lib/components/SafeHtml.svelte';
	import { Button } from '$lib/components/shadcn';
	import type { ImportJobSummary } from '$lib/queries/imports';
	import { useUpdateImportJobDescription } from '$lib/queries/imports/useImportJobMutations';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import {
		canEditImportDescription,
		descriptionText,
		hasDescriptionText,
		importErrorMessage,
	} from '$lib/utils/import-sheet';

	/**
	 * The requester's description of an import: the nuance the source names don't
	 * carry. Everyone who can see the import reads it (sanitized, collapsed when
	 * long). Only the requester can edit it, and not once the import is closed.
	 * Renders nothing for anyone else when there is no description.
	 */
	let { job }: { job: ImportJobSummary } = $props();

	/** Long text collapses to this many visible characters (the detail panel's convention). */
	const COLLAPSE_AFTER = 600;

	const me = useMe();
	const update = useUpdateImportJobDescription();

	const hasText = $derived(hasDescriptionText(job.description));
	const canEdit = $derived(canEditImportDescription(job, me.me?.id));
	const isLong = $derived(descriptionText(job.description).length > COLLAPSE_AFTER);

	let editing = $state(false);
	let expanded = $state(false);
	let draft = $state('');
	let error = $state('');

	function startEditing() {
		draft = job.description ?? '';
		error = '';
		editing = true;
	}

	function stopEditing() {
		editing = false;
		error = '';
	}

	async function save() {
		error = '';
		try {
			await update.mutateAsync({ jobId: job.id, description: draft });
			toast.success('Description saved.');
			editing = false;
		} catch (err) {
			error = importErrorMessage(err);
		}
	}
</script>

{#if editing}
	<section class="flex flex-col gap-2" data-testid="import-description-editor">
		<CommentsEditor
			value={draft}
			onChange={(html) => (draft = html)}
			toolbar="basic"
			minHeight={120}
			placeholder="Who or what is this about? Say what the source names don't."
		/>
		{#if error}
			<p class="text-destructive text-sm" role="alert">{error}</p>
		{/if}
		<div class="flex flex-wrap gap-2">
			<Button type="button" size="sm" disabled={!hasDescriptionText(draft) || update.isPending} onclick={save}>
				{update.isPending ? 'Saving…' : 'Save description'}
			</Button>
			<Button type="button" size="sm" variant="outline" onclick={stopEditing}>Cancel</Button>
		</div>
	</section>
{:else if hasText}
	<section class="flex flex-col gap-1.5" data-testid="import-description">
		<div
			class="text-sm"
			class:max-h-56={isLong && !expanded}
			class:overflow-hidden={isLong && !expanded}
			data-testid="import-description-text"
		>
			<SafeHtml html={job.description ?? ''} />
		</div>
		<div class="flex flex-wrap items-center gap-3">
			{#if isLong}
				<button type="button" class="text-primary text-sm underline" onclick={() => (expanded = !expanded)}>
					{expanded ? 'Show less' : 'Show all'}
				</button>
			{/if}
			{#if canEdit}
				<Button type="button" variant="ghost" size="sm" onclick={startEditing}>Edit description</Button>
			{/if}
		</div>
	</section>
{:else if canEdit}
	<section class="flex flex-col gap-1.5" data-testid="import-description">
		<Button type="button" variant="outline" size="sm" class="self-start" onclick={startEditing}>
			Add a description
		</Button>
	</section>
{/if}
