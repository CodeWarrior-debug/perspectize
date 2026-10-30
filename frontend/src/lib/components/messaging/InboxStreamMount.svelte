<script lang="ts">
	import { useQueryClient } from '@tanstack/svelte-query';
	import { createInboxStream } from '$lib/messaging/useInboxStream.svelte';
	import { streamIdle, watchStreamIdle } from '$lib/messaging/streamIdle.svelte';

	const queryClient = useQueryClient();
	const stream = createInboxStream(queryClient);

	// The single idle timer for all realtime streams (inbox + thread).
	$effect(() => watchStreamIdle(queryClient));

	$effect(() => {
		if (streamIdle.paused) return;
		stream.start();
		return () => stream.stop();
	});
</script>
