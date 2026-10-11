<script lang="ts">
	import { playbackSettings } from '$lib/stores/playbackSettings.svelte';
</script>

<label class="flex items-start justify-between gap-3" data-testid="playback-overlap-setting">
	<span>
		<span class="block text-sm font-medium">Allow more than one player at a time</span>
		<span class="block text-xs text-muted-foreground"
			>Off: starting a song pauses any other song playing in Perspectize, in any tab.</span
		>
	</span>
	<input
		type="checkbox"
		role="switch"
		aria-label="Allow more than one player at a time"
		class="mt-1 h-4 w-4"
		checked={playbackSettings.allowOverlappingPlayback}
		onchange={(e) => playbackSettings.set(e.currentTarget.checked)}
	/>
</label>
