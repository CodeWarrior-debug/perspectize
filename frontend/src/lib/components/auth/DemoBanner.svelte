<script lang="ts">
	import { demoSession } from '$lib/auth';
</script>

<div
	role="status"
	data-testid="demo-banner"
	class="flex items-center justify-center gap-2 bg-accent px-4 py-1 text-center text-xs text-accent-foreground"
>
	<span class="font-semibold">Demo mode</span>
	<span aria-hidden="true">·</span>
	<span>Sample data{demoSession.current ? ` · signed in as ${demoSession.current.name}` : ''}</span>
</div>
