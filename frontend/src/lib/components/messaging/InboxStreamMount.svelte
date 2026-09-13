<script lang="ts">
	import { useQueryClient } from '@tanstack/svelte-query';
	import { createInboxStream } from '$lib/messaging/useInboxStream.svelte';

	const queryClient = useQueryClient();
	const stream = createInboxStream(queryClient);

	$effect(() => {
		stream.start();
		return () => stream.stop();
	});
</script>
