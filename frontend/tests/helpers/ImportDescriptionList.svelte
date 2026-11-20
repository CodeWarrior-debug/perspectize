<script lang="ts">
	import ImportDescription from '$lib/components/imports/ImportDescription.svelte';
	import { useImportJobs } from '$lib/queries/imports/useImportJobs';

	/**
	 * The Imports list's description rows, read through the real list hook, so a
	 * save's cache eviction is what brings the new text back. Test-only.
	 */
	const jobs = useImportJobs(() => true);
</script>

{#each jobs.data?.importJobs ?? [] as job (job.id)}
	<ImportDescription {job} />
{/each}
