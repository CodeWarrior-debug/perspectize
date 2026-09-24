<script lang="ts">
	import type { DataMode } from '$lib/utils/gridUrlState';
	import { segmentClass } from '$lib/utils/segmented';

	let {
		mode,
		loadedCount,
		onToggle,
	}: {
		mode: DataMode;
		loadedCount: number;
		onToggle: (mode: DataMode) => void;
	} = $props();
</script>

<div class="flex items-center gap-1 rounded-md border border-input bg-background p-0.5">
	<button
		class="px-2.5 py-1 text-xs font-medium rounded transition-colors {segmentClass(mode === 'all')}"
		aria-pressed={mode === 'all'}
		onclick={() => onToggle('all')}
	>
		All Items
	</button>
	<button
		class="px-2.5 py-1 text-xs font-medium rounded transition-colors {segmentClass(mode === 'loaded')}"
		aria-pressed={mode === 'loaded'}
		title="Sort, filter, and search within the currently loaded page only"
		onclick={() => onToggle('loaded')}
	>
		Loaded {loadedCount} Items
	</button>
</div>
