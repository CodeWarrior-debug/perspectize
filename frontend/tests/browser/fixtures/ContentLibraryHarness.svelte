<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import ContentLibrary from '#lib/components/library/ContentLibrary.svelte';

	// ContentLibrary in a fixed-size box (AG Grid needs a sized parent), under one
	// QueryClient. 1212px matches the grid width the column minimums are tuned for.
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
</script>

<QueryClientProvider client={queryClient}>
	<div style="width: 1212px; height: 640px;">
		<ContentLibrary />
	</div>
</QueryClientProvider>
