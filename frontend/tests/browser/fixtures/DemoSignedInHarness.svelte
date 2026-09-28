<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import AuthUserSync from '$lib/components/AuthUserSync.svelte';
	import AuthShow from '$lib/components/auth/AuthShow.svelte';
	import MessagingWidget from '$lib/components/messaging/MessagingWidget.svelte';

	// The slice of +layout.svelte that matters for demo-mode sign-in: auth sync
	// mounted next to the signed-in tree, all under one QueryClient. No Clerk
	// provider — in demo mode there isn't one.
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
</script>

<QueryClientProvider client={queryClient}>
	<AuthUserSync />
	<AuthShow when="signed-in">
		<MessagingWidget />
	</AuthShow>
</QueryClientProvider>
