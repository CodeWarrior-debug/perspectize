<script lang="ts">
	import AuthShow from '#lib/components/auth/AuthShow.svelte';
	import SignInTrigger from '#lib/components/auth/SignInTrigger.svelte';
	import UserMenu from '#lib/components/auth/UserMenu.svelte';
	import AddContentPopover from '#lib/components/AddContentPopover.svelte';
	import SettingsDialog from '#lib/components/SettingsDialog.svelte';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import { page } from '$app/state';
	import { createThemeStore } from '#lib/theme/store.svelte.js';
	import { createFontStore } from '#lib/fonts/store.svelte.js';
	import { LIBRARY_PATH } from '#lib/utils/contentLinks.js';
	import { scrollEdges, scrollFadeMask } from '#lib/utils/scrollFade.js';

	const themeStore = createThemeStore();
	const fontStore = createFontStore();
	let settingsOpen = $state(false);

	// The header sits on --color-primary, so the ring uses --color-primary-foreground (always
	// contrasts with it) rather than --color-ring, which is near-invisible on the dark presets.
	const focusRing =
		'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/80 focus-visible:ring-offset-2 focus-visible:ring-offset-primary';

	const navLinks = [
		{ href: LIBRARY_PATH, label: 'Library' },
		{ href: '/discover', label: 'Discover' },
		{ href: '/compare', label: 'Compare' },
		{ href: '/plan', label: 'Plan' },
		{ href: '/declare', label: 'Declare' },
		{ href: '/import', label: 'Import' },
	];

	function isActive(href: string): boolean {
		return page.url.pathname.startsWith(href);
	}

	let nav = $state<HTMLElement | null>(null);
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);

	function measure() {
		if (!nav) return;
		const edges = scrollEdges(nav);
		canScrollLeft = edges.canScrollLeft;
		canScrollRight = edges.canScrollRight;
	}

	// At phone width the links scroll inside the nav. Bring the current page's link into view on every
	// route change, or a page like Import sits off-screen with nothing in the nav marked as current.
	$effect(() => {
		if (!nav) return;
		void page.url.pathname;
		nav.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
		measure();
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(measure);
		observer.observe(nav);
		return () => observer.disconnect();
	});

	// Fade a clipped end so a cut-off link reads as "scroll for more", not as a broken label. No mask at
	// all while every link fits (desktop).
	const fadeMask = $derived(
		canScrollLeft || canScrollRight ? scrollFadeMask(canScrollLeft, canScrollRight, '1.5rem') : undefined,
	);
</script>

<header class="h-16 border-b border-border bg-primary text-primary-foreground sticky top-0 z-50">
	<div class="h-full px-4 md:px-6 lg:px-8 max-w-screen-xl mx-auto flex items-center justify-between gap-2 md:gap-4">
		<div class="flex items-center gap-4 md:gap-6 min-w-0">
			<a
				href="/"
				class="font-bold text-base sm:text-lg md:text-xl text-primary-foreground hover:text-primary-foreground/80 active:opacity-75 transition-colors min-w-0 truncate rounded-sm {focusRing}"
			>
				Perspectize
			</a>
			<!-- min-w-0 + overflow-x-auto: at phone width the links scroll inside the nav instead of running under the right-hand buttons. py/px padding keeps the focus ring from being clipped. -->
			<nav
				bind:this={nav}
				class="flex items-center gap-0.5 sm:gap-2 min-w-0 overflow-x-auto py-1 -my-1 px-1 -mx-1"
				style:mask-image={fadeMask}
				style:-webkit-mask-image={fadeMask}
				onscroll={measure}
			>
				{#each navLinks as link (link.href)}
					<a
						href={link.href}
						aria-current={isActive(link.href) ? 'page' : undefined}
						class="px-1.5 sm:px-2 py-1 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors {focusRing} {isActive(
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
			<AuthShow when="signed-in">
				<AddContentPopover triggerVariant="outline" />
				<button
					type="button"
					aria-label="Settings"
					class="inline-flex items-center justify-center rounded-md size-9 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors {focusRing}"
					onclick={() => (settingsOpen = true)}
				>
					<SettingsIcon class="size-4" />
				</button>
				<UserMenu />
			</AuthShow>

			<SettingsDialog bind:open={settingsOpen} store={themeStore} {fontStore} />

			<AuthShow when="signed-out">
				<SignInTrigger>
					<button
						class="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
					>
						Sign In
					</button>
				</SignInTrigger>
			</AuthShow>
		</div>
	</div>
</header>
