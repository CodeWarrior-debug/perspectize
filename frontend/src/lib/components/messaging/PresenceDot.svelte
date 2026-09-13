<script lang="ts">
	let { state }: { state: 'ONLINE' | 'OFFLINE' | undefined } = $props();
</script>

<span
	class="inline-block size-2 rounded-full {state === 'ONLINE' ? 'bg-green-500' : 'bg-muted-foreground/40'}"
	aria-label={state === 'ONLINE' ? 'Online' : 'Offline'}
></span>
