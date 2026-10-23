<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import ActivityTable from '$lib/components/ActivityTable.svelte';

	// ActivityTable in a fixed-size box (AG Grid needs a sized parent), under one
	// QueryClient. 1212px matches the grid width the column minimums are tuned for.
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
</script>

<QueryClientProvider client={queryClient}>
	<div style="width: 1212px; height: 640px;">
		<ActivityTable />
	</div>
</QueryClientProvider>
