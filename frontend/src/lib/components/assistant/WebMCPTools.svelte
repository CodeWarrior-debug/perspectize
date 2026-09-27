<script lang="ts">
	import { registerWebMCP } from '$lib/assistant/webmcp';

	/**
	 * WebMCPTools registers the assistant's read-only tools with the browser's
	 * own agent while mounted (i.e. while signed in), and unregisters them on
	 * unmount (sign-out) by aborting the registration signal. Renders nothing.
	 */
	$effect(() => {
		const controller = new AbortController();
		registerWebMCP(controller.signal).catch((err) => {
			console.warn('[WebMCP] tool registration failed', err);
		});
		return () => controller.abort();
	});
</script>
