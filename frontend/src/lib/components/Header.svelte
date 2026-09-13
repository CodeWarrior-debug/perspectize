<script lang="ts">
	import { Show, SignInButton, UserButton } from 'svelte-clerk';
	import AddVideoPopover from '$lib/components/AddVideoPopover.svelte';
	import SettingsDialog from '$lib/components/SettingsDialog.svelte';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import { page } from '$app/state';
	import { createThemeStore } from '$lib/theme/store.svelte';

	const themeStore = createThemeStore();
	let settingsOpen = $state(false);

	const navLinks = [
		{ href: '/', label: 'Activity' },
		{ href: '/discover', label: 'Discover' },
	];

	function isActive(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<header class="h-16 border-b border-border bg-primary text-primary-foreground sticky top-0 z-50">
	<div class="h-full px-4 md:px-6 lg:px-8 max-w-screen-xl mx-auto flex items-center justify-between gap-2 md:gap-4">
		<div class="flex items-center gap-4 md:gap-6 min-w-0">
			<a
				href="/"
				class="font-bold text-base sm:text-lg md:text-xl text-primary-foreground hover:text-primary-foreground/80 active:opacity-75 transition-colors min-w-0 truncate"
			>
				Perspectize
			</a>
			<nav class="flex items-center gap-0.5 sm:gap-2 shrink-0">
				{#each navLinks as link (link.href)}
					<a
						href={link.href}
						aria-current={isActive(link.href) ? 'page' : undefined}
						class="px-1.5 sm:px-2 py-1 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors {isActive(
							link.href,
						)
							? 'text-primary-foreground bg-primary-foreground/15'
							: 'text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10'}"
					>
						{link.label}
					</a>
				{/each}
			</nav>
		</div>
		<div class="flex items-center gap-2 md:gap-4 shrink-0">
			<Show when="signed-in">
				<AddVideoPopover triggerVariant="outline" />
				<button
					type="button"
					aria-label="Settings"
					class="inline-flex items-center justify-center rounded-md size-9 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
					onclick={() => (settingsOpen = true)}
				>
					<SettingsIcon class="size-4" />
				</button>
				<UserButton
					appearance={{
						elements: {
							avatarBox: 'w-8 h-8',
						},
					}}
				/>
			</Show>

			<SettingsDialog bind:open={settingsOpen} store={themeStore} />

			<Show when="signed-out">
				<SignInButton mode="modal">
					<button
						class="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
					>
						Sign In
					</button>
				</SignInButton>
			</Show>
		</div>
	</div>
</header>
