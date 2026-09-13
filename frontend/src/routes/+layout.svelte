<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { ClerkProvider, ClerkLoaded, ClerkLoading, Show } from 'svelte-clerk';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { Toaster } from 'svelte-sonner';
	import favicon from '$lib/assets/favicon.svg';
	import AuthUserSync from '$lib/components/AuthUserSync.svelte';
	import Header from '$lib/components/Header.svelte';
	import InboxStreamMount from '$lib/components/messaging/InboxStreamMount.svelte';
	import GuestLanding from '$lib/components/onboarding/GuestLanding.svelte';
	import OnboardingShell from '$lib/components/onboarding/OnboardingShell.svelte';
	import { reportWebVitals } from '$lib/vitals';
	import { pwaInfo } from 'virtual:pwa-info';
	import '../app.css';

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser,
				staleTime: 60 * 1000,
				retry: 1,
			},
		},
	});

	let { children } = $props();

	const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

	let webManifestLink = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '');

	onMount(() => {
		reportWebVitals();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	{@html webManifestLink}
</svelte:head>

<ClerkProvider {publishableKey}>
	<QueryClientProvider client={queryClient}>
		<Toaster position="top-right" duration={2000} richColors />

		<ClerkLoading>
			<div class="flex h-screen items-center justify-center">
				<p class="text-muted-foreground">Loading...</p>
			</div>
		</ClerkLoading>

		<ClerkLoaded>
			<AuthUserSync />
			<div class="min-h-screen bg-background text-foreground">
				<Header />
				<Show when="signed-out">
					<GuestLanding />
				</Show>
				<Show when="signed-in">
					<InboxStreamMount />
					<OnboardingShell />
					{@render children()}
				</Show>
			</div>
		</ClerkLoaded>
	</QueryClientProvider>
</ClerkProvider>
