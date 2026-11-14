<script module lang="ts">
	// Same head start as the Library route's own module script (#636): begin downloading the table
	// while Clerk loads, so the hop from `/` to /content-library doesn't add a serial chunk fetch.
	import('$lib/components/ActivityTable.svelte').catch(() => {});
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LIBRARY_PATH } from '$lib/utils/contentLinks';

	// The root layout renders this page only for signed-in visitors (guests see GuestLanding at `/`),
	// so this sends just them on to the Library. Query and hash carry over, so old Activity links
	// such as `/?open=<id>` or a filtered `/?f.type=movie` still land on the same view.
	onMount(() => {
		void goto(`${LIBRARY_PATH}${page.url.search}${page.url.hash}`, { replaceState: true });
	});
</script>
