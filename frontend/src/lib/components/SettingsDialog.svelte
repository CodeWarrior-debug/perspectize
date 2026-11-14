<script lang="ts">
	import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '$lib/components/shadcn';
	import ThemeCustomizePanel from '$lib/components/theme/ThemeCustomizePanel.svelte';
	import FontSettingsPanel from '$lib/components/fonts/FontSettingsPanel.svelte';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import FeedbackDialog from '$lib/components/FeedbackDialog.svelte';
	import type { ThemeStore } from '$lib/theme/store.svelte';
	import { createFontStore, type FontStore } from '$lib/fonts/store.svelte';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import { replayCoach } from '$lib/onboarding/coachGate.svelte';

	let {
		open = $bindable(false),
		store,
		// Header passes the app-wide store; the fallback keeps standalone mounts (tests) working.
		fontStore = createFontStore(),
	}: { open?: boolean; store: ThemeStore; fontStore?: FontStore } = $props();

	type SectionId = 'general' | 'theme' | 'fonts' | 'feedback';

	const sections: { id: SectionId; label: string }[] = [
		{ id: 'general', label: 'General' },
		{ id: 'theme', label: 'Customize Theme' },
		{ id: 'fonts', label: 'Fonts' },
		{ id: 'feedback', label: 'Send Feedback' },
	];

	// "Peek" hides the dialog so font picks can be judged against the whole page, then a
	// floating button brings Settings back on the same section.
	let peeking = $state(false);

	function startPeek() {
		peeking = true;
		open = false;
	}

	function endPeek() {
		peeking = false;
		open = true;
	}

	$effect(() => {
		// Any other way of reopening Settings ends the peek too.
		if (open) peeking = false;
	});

	let activeSection = $state<SectionId>('general');

	const meCtx = useMe();

	// Close first: the modal would otherwise sit over the coach panel it just opened.
	function restartOnboarding() {
		open = false;
		replayCoach();
	}
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-2xl">
		<DialogHeader>
			<DialogTitle>Settings</DialogTitle>
		</DialogHeader>

		<div class="flex flex-col gap-4 sm:flex-row sm:gap-6 min-h-[320px] max-h-[75vh]">
			<nav
				class="flex gap-1 overflow-x-auto sm:w-40 sm:shrink-0 sm:flex-col sm:overflow-visible"
				aria-label="Settings sections"
			>
				{#each sections as section (section.id)}
					<button
						type="button"
						class="shrink-0 whitespace-nowrap text-left text-sm px-2 py-1.5 rounded-md {activeSection === section.id
							? 'bg-muted font-medium'
							: 'text-muted-foreground hover:bg-muted/50'}"
						onclick={() => (activeSection = section.id)}
					>
						{section.label}
					</button>
				{/each}
			</nav>

			<!-- Only this pane scrolls, so the section nav and each panel's sticky header stay put. -->
			<div class="flex-1 min-h-0 min-w-0 overflow-y-auto">
				{#if activeSection === 'general'}
					<div class="flex flex-col gap-4">
						<div class="flex items-center justify-between gap-4 rounded-md border border-border p-3">
							<div class="flex flex-col gap-0.5">
								<span class="text-sm font-medium">Getting started</span>
								<span class="text-xs text-muted-foreground">Replay the intro walkthrough, starting right now.</span>
							</div>
							<Button type="button" variant="outline" onclick={restartOnboarding} disabled={!meCtx.me}>
								Restart onboarding
							</Button>
						</div>
					</div>
				{:else if activeSection === 'theme'}
					<ThemeCustomizePanel {store} />
				{:else if activeSection === 'fonts'}
					<FontSettingsPanel store={fontStore} onPeek={startPeek} />
				{:else if activeSection === 'feedback'}
					<FeedbackDialog
						onClose={() => {
							open = false;
						}}
					/>
				{/if}
			</div>
		</div>
	</DialogContent>
</Dialog>

{#if peeking}
	<button
		type="button"
		onclick={endPeek}
		class="fixed bottom-24 left-1/2 z-50 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
	>
		<SettingsIcon class="size-4" />
		Back to Settings
	</button>
{/if}
