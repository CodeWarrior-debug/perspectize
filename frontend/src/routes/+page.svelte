<script lang="ts">
	import ActivityTable from '$lib/components/ActivityTable.svelte';
	import { Input, Popover, PopoverContent, PopoverTrigger, buttonVariants } from '$lib/components/shadcn';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		parseGridParams,
		serializeGridParams,
		ALL_SEARCH_SCOPES,
		type SearchScopeKey,
	} from '$lib/utils/gridUrlState';

	// Derive current grid params from URL
	const gridParams = $derived(parseGridParams(page.url.searchParams));

	// Local search input state (tracks what user has typed)
	// Initialized from URL on mount; user typing updates this independently of URL
	let searchInput = $state(page.url.searchParams.get('q') ?? '');

	const SCOPE_LABELS: Record<SearchScopeKey, string> = {
		title: 'Title',
		desc: 'Description',
		channel: 'Channel',
		tags: 'Tags',
	};

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

	function toggleScope(scope: SearchScopeKey) {
		const current = gridParams.qFields;
		const isSelected = current.includes(scope);
		// Always leave at least one scope selected — unchecking the last one is a no-op.
		if (isSelected && current.length === 1) return;
		const nextFields = isSelected ? current.filter((s) => s !== scope) : [...current, scope];
		const updated = { ...gridParams, qFields: nextFields, page: 1 };
		const search = serializeGridParams(updated);
		goto(search ? `?${search}` : '/', { replaceState: true, keepFocus: true, noScroll: true });
	}

	const scopeSummary = $derived(
		gridParams.qFields.length === ALL_SEARCH_SCOPES.length
			? 'All fields'
			: gridParams.qFields.map((s) => SCOPE_LABELS[s]).join(', '),
	);
</script>

<div class="flex flex-col h-[calc(100vh-4rem)]">
	<!-- Page Header: Title + Search -->
	<div class="px-4 md:px-6 lg:px-8 py-4 md:py-6">
		<div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
			<div>
				<h1 class="text-2xl md:text-3xl font-semibold text-foreground">Activity</h1>
				<p class="text-sm text-muted-foreground mt-1">Recently updated content</p>
			</div>
			<div class="flex items-center gap-2 w-full sm:w-auto">
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
				<Popover>
					<PopoverTrigger
						class={buttonVariants({ variant: 'outline', size: 'icon' })}
						aria-label="Choose which fields to search ({scopeSummary})"
						title="Search fields: {scopeSummary}"
					>
						<SlidersHorizontalIcon class="size-4" />
					</PopoverTrigger>
					<PopoverContent align="end" class="w-56 p-2">
						<p class="text-xs font-medium text-muted-foreground px-2 pb-1">Search in</p>
						{#each ALL_SEARCH_SCOPES as scope (scope)}
							<label
								class="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent"
							>
								<input
									type="checkbox"
									checked={gridParams.qFields.includes(scope)}
									onchange={() => toggleScope(scope)}
									class="size-4 accent-primary"
								/>
								{SCOPE_LABELS[scope]}
							</label>
						{/each}
					</PopoverContent>
				</Popover>
			</div>
		</div>
	</div>

	<!-- Table Card -->
	<div class="flex-1 min-h-0 px-4 md:px-6 lg:px-8 pb-4">
		<div class="border rounded-lg shadow-sm overflow-hidden h-full flex flex-col">
			<ActivityTable />
		</div>
	</div>
</div>
