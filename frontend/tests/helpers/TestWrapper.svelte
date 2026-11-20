<script lang="ts">
	import { QueryClientProvider, type QueryClient } from '@tanstack/svelte-query';
	import type { Component } from 'svelte';

	let {
		queryClient,
		component,
		props = {},
	}: {
		queryClient: QueryClient;
		component: Component<any>;
		props?: any;
	} = $props();

	// Svelte 5 only treats dotted-member tags (not bare lowercase identifiers) as dynamic
	// components, so route through a wrapper object rather than `<component {...props} />`.
	const wrapped = $derived({ Comp: component });
</script>

<QueryClientProvider client={queryClient}>
	<wrapped.Comp {...props} />
</QueryClientProvider>
