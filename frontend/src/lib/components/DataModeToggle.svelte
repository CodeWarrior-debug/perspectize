<script lang="ts">
	import type { DataMode } from '$lib/utils/gridUrlState';

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
		class="px-2.5 py-1 text-xs font-medium rounded transition-colors {mode === 'all'
			? 'bg-primary text-primary-foreground'
			: 'text-muted-foreground hover:text-foreground'}"
		onclick={() => onToggle('all')}
	>
		All Items
	</button>
	<button
		class="px-2.5 py-1 text-xs font-medium rounded transition-colors {mode === 'loaded'
			? 'bg-primary text-primary-foreground'
			: 'text-muted-foreground hover:text-foreground'}"
		title="Sort, filter, and search within the currently loaded page only"
		onclick={() => onToggle('loaded')}
	>
		Loaded {loadedCount} Items
	</button>
</div>
