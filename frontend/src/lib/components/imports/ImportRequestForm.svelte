<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/shadcn';
	import { DEMO_MODE } from '$lib/auth/demo.svelte';
	import type { ImportPersonRole, ImportSourceType } from '$lib/queries/imports';
	import { useCreateImportJob } from '$lib/queries/imports/useImportJobMutations';
	import { importErrorMessage } from '$lib/utils/import-sheet';

	/**
	 * Request an import: a name and one or more sources (a YouTube channel, or
	 * a person's films on TMDB). An admin's import starts listing at once;
	 * anyone else's waits for an admin to approve it.
	 */
	let { isAdmin, onCreated }: { isAdmin: boolean; onCreated?: () => void } = $props();

	const MAX_SOURCES = 10;

	interface SourceRow {
		key: number;
		sourceType: ImportSourceType;
		ref: string;
		role: ImportPersonRole | 'BOTH';
	}

	let nextKey = 1;
	const blank = (): SourceRow => ({ key: nextKey++, sourceType: 'YOUTUBE_CHANNEL', ref: '', role: 'DIRECTOR' });
	let name = $state('');
	let sources = $state<SourceRow[]>([blank()]);
	let error = $state('');
	const create = useCreateImportJob();

	const canSubmit = $derived(name.trim() !== '' && sources.every((s) => s.ref.trim() !== '') && !create.isPending);

	const PLACEHOLDER: Record<ImportSourceType, string> = {
		YOUTUBE_CHANNEL: '@JordanBPeterson, or a channel URL',
		TMDB_PERSON: 'Christopher Nolan, 525, or a TMDB person URL',
	};

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		try {
			const res = await create.mutateAsync({
				name: name.trim(),
				sources: sources.map((s) => ({
					sourceType: s.sourceType,
					ref: s.ref.trim(),
					role: s.sourceType === 'TMDB_PERSON' && s.role !== 'BOTH' ? s.role : null,
				})),
			});
			const job = res.createImportJob;
			toast.success(
				job.requestStatus === 'APPROVED'
					? `"${job.name}" is listing now. Open it from Imports when it's ready.`
					: `Request sent. "${job.name}" waits for an admin to approve it.`,
			);
			name = '';
			sources = [blank()];
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

	<fieldset class="flex flex-col gap-3">
		<legend class="mb-1.5 text-sm font-medium">Sources</legend>
		{#each sources as src, i (src.key)}
			<div class="flex flex-wrap items-center gap-2" data-testid="import-request-source">
				<select
					bind:value={src.sourceType}
					aria-label={`Source ${i + 1} type`}
					class="border-border bg-background text-foreground rounded-md border px-2 py-2 text-sm"
				>
					<option value="YOUTUBE_CHANNEL">YouTube channel</option>
					<option value="TMDB_PERSON">Person's films (TMDB)</option>
				</select>
				<input
					type="text"
					bind:value={src.ref}
					maxlength={200}
					placeholder={PLACEHOLDER[src.sourceType]}
					aria-label={`Source ${i + 1}`}
					class="border-border bg-background text-foreground min-w-72 flex-1 rounded-md border px-3 py-2 text-sm"
				/>
				{#if src.sourceType === 'TMDB_PERSON'}
					<select
						bind:value={src.role}
						aria-label={`Source ${i + 1} credits`}
						class="border-border bg-background text-foreground rounded-md border px-2 py-2 text-sm"
					>
						<option value="DIRECTOR">Directed</option>
						<option value="CAST">Acted in</option>
						<option value="BOTH">Both</option>
					</select>
				{/if}
				{#if sources.length > 1}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-label={`Remove source ${i + 1}`}
						onclick={() => (sources = sources.filter((s) => s.key !== src.key))}
					>
						<XIcon />
					</Button>
				{/if}
			</div>
		{/each}
		{#if sources.length < MAX_SOURCES}
			<Button
				type="button"
				variant="outline"
				size="sm"
				class="self-start"
				onclick={() => (sources = [...sources, blank()])}
			>
				<PlusIcon /> Add a source
			</Button>
		{/if}
		{#if DEMO_MODE}
			<p class="text-muted-foreground text-xs">
				Demo mode has sample data for @JordanBPeterson, @DrJordanBPetersonClips, @PetersonAcademy, @gracetoyou and
				Christopher Nolan (or 525).
			</p>
		{/if}
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
