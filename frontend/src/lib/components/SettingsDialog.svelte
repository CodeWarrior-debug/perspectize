<script lang="ts">
	import { Dialog, DialogContent, DialogHeader, DialogTitle } from '$lib/components/shadcn';
	import ThemeCustomizePanel from '$lib/components/theme/ThemeCustomizePanel.svelte';
	import type { ThemeStore } from '$lib/theme/store.svelte';

	let { open = $bindable(false), store }: { open?: boolean; store: ThemeStore } = $props();

	type SectionId = 'theme';

	const sections: { id: SectionId; label: string }[] = [{ id: 'theme', label: 'Customize Theme' }];

	let activeSection = $state<SectionId>('theme');
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-2xl">
		<DialogHeader>
			<DialogTitle>Settings</DialogTitle>
		</DialogHeader>

		<div class="flex gap-6 min-h-[320px]">
			<nav class="w-40 shrink-0 flex flex-col gap-1" aria-label="Settings sections">
				{#each sections as section (section.id)}
					<button
						type="button"
						class="text-left text-sm px-2 py-1.5 rounded-md {activeSection === section.id
							? 'bg-muted font-medium'
							: 'text-muted-foreground hover:bg-muted/50'}"
						onclick={() => (activeSection = section.id)}
					>
						{section.label}
					</button>
				{/each}
			</nav>

			<div class="flex-1 min-w-0">
				{#if activeSection === 'theme'}
					<ThemeCustomizePanel {store} />
				{/if}
			</div>
		</div>
	</DialogContent>
</Dialog>
