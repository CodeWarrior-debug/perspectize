<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '#lib/components/shadcn/index.js';
	import { useStageImportFromFile } from '#lib/queries/imports/useStageImportFromFile.js';
	import { ImportFileError, parseImportFile } from '#lib/utils/importFile.js';
	import { importErrorMessage } from '#lib/utils/import-sheet.js';

	let { isAdmin }: { isAdmin: boolean } = $props();

	const stage = useStageImportFromFile();
	let fileInput = $state<HTMLInputElement | null>(null);
	let error = $state<string | null>(null);

	/** The picked file is read and checked here; a bad file never reaches the server. */
	async function onFileChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		error = null;
		let staged;
		try {
			const text = await file.text();
			staged = parseImportFile(text, file.name.replace(/\.json$/i, ''));
		} catch (err) {
			error = err instanceof ImportFileError ? err.message : "Couldn't read that file.";
			return;
		}
		stage.mutate(staged, {
			onSuccess: (data) => goto(`/import/${data.stageImportFromFile.id}`),
			onError: (err) => (error = importErrorMessage(err)),
		});
	}
</script>

{#if isAdmin}
	<div class="mb-3 flex flex-col gap-2">
		<div>
			<Button type="button" variant="outline" disabled={stage.isPending} onclick={() => fileInput?.click()}>
				{stage.isPending ? 'Importing…' : 'Import from file'}
			</Button>
			<input
				bind:this={fileInput}
				type="file"
				accept=".json,application/json"
				class="sr-only"
				aria-label="Choose a candidates file"
				onchange={onFileChosen}
			/>
		</div>
		{#if error}
			<p role="alert" class="text-destructive text-sm">{error}</p>
		{/if}
	</div>
{/if}
