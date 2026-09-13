<script lang="ts">
	import { typingLabel } from '$lib/messaging/format';

	let { usernames }: { usernames: string[] } = $props();
</script>

{#if usernames.length}
	<p data-testid="typing" class="text-xs italic text-muted-foreground">{typingLabel(usernames)}</p>
{/if}
