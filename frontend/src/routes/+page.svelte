<script lang="ts">
	import ActivityTable from '$lib/components/ActivityTable.svelte';
	import UserActivityView from '$lib/components/UserActivityView.svelte';
	import { Input } from '$lib/components/shadcn';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { parseGridParams, serializeGridParams } from '$lib/utils/gridUrlState';

	// Derive current grid params from URL
	const gridParams = $derived(parseGridParams(page.url.searchParams));

	// "All Content" (existing grid) vs "By User" (new grouped activity view).
	// Session-only, not persisted to the URL — mirrors the column picker's scope.
	let view = $state<'content' | 'byUser'>('content');

	// Local search input state (tracks what user has typed)
	// Initialized from URL on mount; user typing updates this independently of URL
	let searchInput = $state(page.url.searchParams.get('q') ?? '');

	// Debounced search → URL update
	let searchTimer: ReturnType<typeof setTimeout>;
	function handleSearchInput(value: string) {
		searchInput = value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const updated = { ...gridParams, q: value, page: 1 };
			const search = serializeGridParams(updated);
			goto(search ? `?${search}` : '/', { replaceState: true, keepFocus: true, noScroll: true });
		}, 300);
	}
</script>

<div class="flex flex-col h-[calc(100vh-4rem)]">
	<!-- Page Header: Title + Search -->
	<div class="px-4 md:px-6 lg:px-8 py-4 md:py-6">
		<div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
			<div>
				<h1 class="text-2xl md:text-3xl font-semibold text-foreground">Activity</h1>
				<p class="text-sm text-muted-foreground mt-1">Recently updated content</p>
			</div>
			<div class="flex items-center gap-2">
				<div class="flex items-center gap-1 rounded-md border border-input bg-background p-0.5">
					<button
						type="button"
						class="px-2.5 py-1 text-xs font-medium rounded transition-colors {view === 'content'
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (view = 'content')}
					>
						All Content
					</button>
					<button
						type="button"
						class="px-2.5 py-1 text-xs font-medium rounded transition-colors {view === 'byUser'
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (view = 'byUser')}
					>
						By User
					</button>
				</div>
				{#if view === 'content'}
					<div class="relative w-full sm:w-64 md:w-80">
						<SearchIcon
							class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
						/>
						<Input
							type="text"
							placeholder="Search content..."
							value={searchInput}
							oninput={(e) => handleSearchInput(e.currentTarget.value)}
							class="pl-9"
						/>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Content Card -->
	<div class="flex-1 min-h-0 px-4 md:px-6 lg:px-8 pb-4">
		{#if view === 'content'}
			<div class="border rounded-lg shadow-sm overflow-hidden h-full flex flex-col">
				<ActivityTable />
			</div>
		{:else}
			<div class="border rounded-lg shadow-sm overflow-y-auto h-full">
				<UserActivityView />
			</div>
		{/if}
	</div>
</div>
