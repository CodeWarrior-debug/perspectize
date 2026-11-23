<script lang="ts">
	import { useLibraryList } from '#lib/queries/content/useLibraryList.svelte.js';
	import { parseGridParams } from '#lib/utils/gridUrlState.js';

	/**
	 * Mounts useLibraryList so a test can run its query and cursor $effect (which the hook needs a
	 * component for). `qs` is the URL query string the Library would parse; `onList` hands the
	 * hook back so the test can call resetCursors() and read rows. Test-only.
	 */
	let { qs, onList }: { qs: string; onList?: (list: ReturnType<typeof useLibraryList>) => void } = $props();

	const params = $derived(parseGridParams(new URLSearchParams(qs)));
	const list = useLibraryList(() => params);
	// svelte-ignore state_referenced_locally
	onList?.(list);
</script>

<output data-testid="probe-rows">{list.rows.length}</output>
<output data-testid="probe-first">{list.rows[0]?.id ?? ''}</output>
<output data-testid="probe-total">{list.totalCount}</output>
<output data-testid="probe-loading">{list.loading ? 'loading' : 'idle'}</output>
