<script lang="ts">
	import ImportListingProgress from '$lib/components/imports/ImportListingProgress.svelte';
	import { listingProps } from './listingProgressMock.svelte';

	/**
	 * Mounts ImportListingProgress with props read from reactive state, so a test
	 * can change jobId or sources on the same instance (the page's real update
	 * path) instead of remounting it. Test-only.
	 */
</script>

<ImportListingProgress jobId={listingProps.jobId} sources={listingProps.sources} />
