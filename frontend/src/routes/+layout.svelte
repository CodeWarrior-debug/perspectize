<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { page, updated } from '$app/state';
	import { onMount } from 'svelte';
	import { ClerkProvider, ClerkLoaded, ClerkLoading } from 'svelte-clerk';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { queryClient } from '#lib/queries/client.js';
	import { Toaster } from 'svelte-sonner';
	import { TOASTER_PROPS } from '#lib/utils/toast.js';
	import favicon from '#lib/assets/favicon.svg';
	import { DEMO_MODE } from '#lib/auth/index.js';
	import AuthShow from '#lib/components/auth/AuthShow.svelte';
	import DemoBanner from '#lib/components/auth/DemoBanner.svelte';
	import DemoPersonaDialog from '#lib/components/auth/DemoPersonaDialog.svelte';
	import AuthUserSync from '#lib/components/AuthUserSync.svelte';
	import Header from '#lib/components/Header.svelte';
	import InboxStreamMount from '#lib/components/messaging/InboxStreamMount.svelte';
	import MessagingWidget from '#lib/components/messaging/MessagingWidget.svelte';
	import GuestLanding from '#lib/components/onboarding/GuestLanding.svelte';
	import OnboardingShell from '#lib/components/onboarding/OnboardingShell.svelte';
	import { initTelemetry } from '#lib/telemetry.js';
	import { watchForNewVersion } from '#lib/utils/versionWatch.js';
	import { attachVersionHotkey } from '#lib/utils/versionHotkey.js';
	import { printVersionInfo } from '#lib/utils/versionInfo.js';
	import '../app.css';

	let { children } = $props();

	// Routes that render their own signed-out state instead of the guest landing page.
	// /add keeps a shared link on screen while the visitor signs in.
	const SIGNED_OUT_ROUTES = new Set(['/add']);
	const openToGuests = $derived(SIGNED_OUT_ROUTES.has(page.route.id ?? ''));

	const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

	// Once a newer deploy is detected (version.json polling or a resume check),
	// turn the next client-side navigation into a full page load — the old
	// build's route chunks may already be gone from the server.
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) {
			location.href = to.url.href;
		}
	});

	onMount(() => {
		void initTelemetry();
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
</svelte:head>

{#snippet app()}
	<AuthUserSync />
	<div class="min-h-screen bg-background text-foreground">
		{#if DEMO_MODE}
			<DemoBanner />
			<DemoPersonaDialog />
		{/if}
		<Header />
		{#if !openToGuests}
			<AuthShow when="signed-out">
				<GuestLanding />
			</AuthShow>
		{/if}
		<AuthShow when="signed-in">
			<InboxStreamMount />
			<MessagingWidget />
			<OnboardingShell />
			{#if !openToGuests}
				{@render children()}
			{/if}
		</AuthShow>
		<!-- Outside the auth wrappers so signing in does not remount the page and drop its input. -->
		{#if openToGuests}
			{@render children()}
		{/if}
	</div>
{/snippet}

{#if DEMO_MODE}
	<!-- Demo mode: no Clerk at all — seeded personas sign in via DemoPersonaDialog. -->
	<QueryClientProvider client={queryClient}>
		<Toaster {...TOASTER_PROPS} />
		{@render app()}
	</QueryClientProvider>
{:else}
	<ClerkProvider {publishableKey}>
		<QueryClientProvider client={queryClient}>
			<Toaster {...TOASTER_PROPS} />

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
