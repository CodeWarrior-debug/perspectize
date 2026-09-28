<script lang="ts">
	import { browser } from '$app/environment';
	import { beforeNavigate } from '$app/navigation';
	import { updated } from '$app/state';
	import { onMount } from 'svelte';
	import { ClerkProvider, ClerkLoaded, ClerkLoading } from 'svelte-clerk';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { Toaster } from 'svelte-sonner';
	import favicon from '$lib/assets/favicon.svg';
	import { DEMO_MODE } from '$lib/auth';
	import AuthShow from '$lib/components/auth/AuthShow.svelte';
	import DemoBanner from '$lib/components/auth/DemoBanner.svelte';
	import DemoPersonaDialog from '$lib/components/auth/DemoPersonaDialog.svelte';
	import AuthUserSync from '$lib/components/AuthUserSync.svelte';
	import Header from '$lib/components/Header.svelte';
	import InboxStreamMount from '$lib/components/messaging/InboxStreamMount.svelte';
	import MessagingWidget from '$lib/components/messaging/MessagingWidget.svelte';
	import GuestLanding from '$lib/components/onboarding/GuestLanding.svelte';
	import OnboardingShell from '$lib/components/onboarding/OnboardingShell.svelte';
	import { reportWebVitals } from '$lib/vitals';
	import { watchForNewVersion } from '$lib/utils/versionWatch';
	import { attachVersionHotkey } from '$lib/utils/versionHotkey';
	import { printVersionInfo } from '$lib/utils/versionInfo';
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

	// Once a newer deploy is detected (version.json polling or a resume check),
	// turn the next client-side navigation into a full page load — the old
	// build's route chunks may already be gone from the server.
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) {
			location.href = to.url.href;
		}
	});

	onMount(() => {
		reportWebVitals();
		const stopVersionWatch = watchForNewVersion({
			check: () => updated.check(),
			reload: () => location.reload(),
		});
		// Hidden zzzv console hotkey — see lib/utils/versionHotkey.ts.
		const detachVersionHotkey = attachVersionHotkey({
			onMatch: () => {
				const graphqlUrl = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8080/graphql';
				void printVersionInfo({ graphqlUrl });
			},
		});
		return () => {
			stopVersionWatch();
			detachVersionHotkey();
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	{@html webManifestLink}
</svelte:head>

{#snippet app()}
	<AuthUserSync />
	<div class="min-h-screen bg-background text-foreground">
		{#if DEMO_MODE}
			<DemoBanner />
			<DemoPersonaDialog />
		{/if}
		<Header />
		<AuthShow when="signed-out">
			<GuestLanding />
		</AuthShow>
		<AuthShow when="signed-in">
			<InboxStreamMount />
			<MessagingWidget />
			<OnboardingShell />
			{@render children()}
		</AuthShow>
	</div>
{/snippet}

{#if DEMO_MODE}
	<!-- Demo mode: no Clerk at all — seeded personas sign in via DemoPersonaDialog. -->
	<QueryClientProvider client={queryClient}>
		<Toaster position="top-right" duration={2000} richColors />
		{@render app()}
	</QueryClientProvider>
{:else}
	<ClerkProvider {publishableKey}>
		<QueryClientProvider client={queryClient}>
			<Toaster position="top-right" duration={2000} richColors />

			<ClerkLoading>
				<div class="flex h-screen items-center justify-center">
					<p class="text-muted-foreground">Loading...</p>
				</div>
			</ClerkLoading>

			<ClerkLoaded>
				{@render app()}
			</ClerkLoaded>
		</QueryClientProvider>
	</ClerkProvider>
{/if}
