<script module lang="ts">
	// Start fetching the table (and AG Grid, ~244KB gzipped) the moment this route module
	// evaluates, in parallel with Clerk's script. The root layout renders nothing until
	// `ClerkLoaded`, so awaiting the import from the template would start the AG Grid
	// download only after Clerk finished: two serial network steps on the LCP path.
	// The page still handles failure below via `{:catch}`.
	const contentLibraryImport = import('#lib/components/library/ContentLibrary.svelte');
	contentLibraryImport.catch(() => {}); // avoid an unhandled-rejection reload before the template awaits it
</script>

<script lang="ts">
	import { Input, Popover, PopoverContent, PopoverTrigger, buttonVariants } from '#lib/components/shadcn/index.js';
	import LazyLoadError from '#lib/components/LazyLoadError.svelte';
	import TypePills from '#lib/components/TypePills.svelte';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		parseGridParams,
		serializeGridParams,
		searchScopesFor,
		type SearchScopeKey,
	} from '#lib/utils/gridUrlState.js';
	import { useMe } from '#lib/queries/users/useMe.svelte.js';
	import { LIBRARY_PATH } from '#lib/utils/contentLinks.js';

	// Derive current grid params from URL
	const gridParams = $derived(parseGridParams(new URLSearchParams(page.url.search)));

	// "Mine" is just a shortcut for the User column's text filter (`f.user=<my username>`) —
	// the same filter the column menu sets, so it shows as a chip and survives a reload.
	const meCtx = useMe();
	const myUsername = $derived(meCtx.me?.username ?? null);
	const mineActive = $derived(
		myUsername !== null && gridParams.filters.user?.toLowerCase() === myUsername.toLowerCase(),
	);

	function toggleMine() {
		if (myUsername === null) return;
		const { user: _previous, ...rest } = gridParams.filters;
		const filters = mineActive ? rest : { ...rest, user: myUsername };
		const search = serializeGridParams({ ...gridParams, filters, page: 1 });
		goto(search ? `?${search}` : LIBRARY_PATH, { replace: true, reset: false });
	}

	// Switching to one type replaces the Type filter only; other filters stay as they are.
	function selectType(value: string) {
		const filters = { ...gridParams.filters, type: value };
		const search = serializeGridParams({ ...gridParams, filters, page: 1 });
		goto(search ? `?${search}` : LIBRARY_PATH, { replace: true, reset: false });
	}

	// Local search input state (tracks what user has typed)
	// Initialized from URL on mount; user typing updates this independently of URL
	let searchInput = $state(page.url.searchParams.get('q') ?? '');

	const SCOPE_LABELS: Record<SearchScopeKey, string> = {
		title: 'Title',
		desc: 'Description',
		channel: 'Channel',
		tags: 'Tags',
		cast: 'Cast',
		director: 'Director',
	};

	// Cast and Director are offered (and on by default) only while the type filter includes Movie.
	const availableScopes = $derived(searchScopesFor(gridParams.filters));

	// Debounced search → URL update
	let searchTimer: ReturnType<typeof setTimeout>;
	function handleSearchInput(value: string) {
		searchInput = value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const updated = { ...gridParams, q: value, page: 1 };
			const search = serializeGridParams(updated);
			goto(search ? `?${search}` : LIBRARY_PATH, { replace: true, reset: false });
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
		goto(search ? `?${search}` : LIBRARY_PATH, { replace: true, reset: false });
	}

	const scopeSummary = $derived(
		gridParams.qFields.length === availableScopes.length
			? 'All fields'
			: gridParams.qFields.map((s) => SCOPE_LABELS[s]).join(', '),
	);
</script>

<div class="flex flex-col h-[calc(100vh-4rem)]">
	<!-- Page Header: Title + Search -->
	<div class="w-full max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8 py-4">
		<div class="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
			<div>
				<h1 class="text-2xl font-semibold text-foreground">Library</h1>
				<p class="text-sm text-muted-foreground mt-1">Everything Perspectize members have added.</p>
			</div>
			<!-- Other-type pills sit above the active filter chips. FilterChips (inside the grid card) moves
			     itself into the slot on desktop to save a row of height. Wide screens have room for this
			     in the header's middle; below that it takes its own full-width row, after the search. -->
			<div class="order-last sm:basis-full flex flex-col gap-2 min-w-0 xl:order-none xl:basis-0 xl:flex-1 xl:items-end">
				<TypePills filters={gridParams.filters} onSelect={selectType} />
				<div id="activity-chips-slot" class="hidden md:flex min-w-0 max-w-full items-center"></div>
			</div>
			<div class="flex items-center gap-2">
				{#if myUsername}
					<button
						type="button"
						aria-pressed={mineActive}
						title={mineActive ? 'Showing only items you added — click to show everyone' : 'Show only items you added'}
						class="px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors {mineActive
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-input bg-background text-muted-foreground hover:text-foreground'}"
						onclick={toggleMine}
					>
						Mine
					</button>
				{/if}
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
						{#each availableScopes as scope (scope)}
							<label class="flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm cursor-pointer hover:bg-accent">
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

	<!-- ColumnRelevanceCallout (rendered by ContentLibrary) moves itself here: above the card's top-right
	     corner, outside the table frame. Collapses to nothing when empty. -->
	<div
		id="activity-callout-slot"
		class="w-full max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8 flex justify-end empty:hidden"
	></div>

	<!-- Content Card -->
	<!-- pb-4 (not pb-20: that reserved an ~80px dead strip that cost a grid row). The fixed Messages
	     button is cleared by the pagination bar's own right padding instead (ContentLibrary).
	     ContentLibrary is dynamically imported (kicked off in the module script above): this route's own
	     module is what SvelteKit's client router loads up front to resolve this route,
	     before the root layout's ClerkLoading/ClerkLoaded gate even decides whether
	     to render this page at all — so a static import here forces every visitor
	     (including signed-out ones, who never see this content) to pay for AG Grid
	     (~800KB) before anything paints. -->
	<div class="flex-1 min-h-0 w-full max-w-screen-xl mx-auto px-4 md:px-6 lg:px-8 pb-4">
		<div class="border border-border rounded-lg shadow-sm overflow-hidden h-full flex flex-col">
			{#await contentLibraryImport then { default: ContentLibrary }}
				<ContentLibrary />
			{:catch}
				<LazyLoadError what="the library table" />
			{/await}
		</div>
	</div>
</div>
