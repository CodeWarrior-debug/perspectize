<script lang="ts">
	import { useImportListingProgress } from '$lib/queries/imports/useImportListingProgress.svelte';

	/**
	 * Mounts useImportListingProgress so a test can run its $effect (which the
	 * hook needs a component for) and read what it exposes. Test-only.
	 */
	let { jobId, enabled }: { jobId: string | null; enabled: boolean } = $props();

	const live = useImportListingProgress(
		() => jobId,
		() => enabled,
	);
</script>

<output data-testid="probe-progress">{live.progress ? 'live' : 'idle'}</output>
<output data-testid="probe-status">{live.status}</output>
