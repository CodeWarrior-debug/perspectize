<script lang="ts">
	import { Button } from '$lib/components/shadcn';

	// Reload rather than retry: after a deploy the old chunk no longer exists, so
	// re-importing fails the same way; a reload fetches the new index.html.
	let { what, floating = false }: { what: string; floating?: boolean } = $props();
</script>

<div
	role="alert"
	class={floating
		? 'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-3 text-card-foreground shadow-lg'
		: 'flex h-full items-center justify-center p-6'}
>
	<div class="flex flex-wrap items-center justify-center gap-3 text-sm">
		<span>Couldn't load {what}. A new version may have been released.</span>
		<Button size="sm" variant="outline" onclick={() => location.reload()}>Reload</Button>
	</div>
</div>
