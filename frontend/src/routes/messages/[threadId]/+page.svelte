<script lang="ts">
	import { page } from '$app/state';
	import ThreadView from '$lib/components/messaging/ThreadView.svelte';
</script>

{#key page.params.threadId}
	<ThreadView threadId={page.params.threadId ?? ''} />
{/key}
