<script lang="ts">
	import { initials } from '$lib/messaging/format';

	let { username, size = 'md' }: { username: string; size?: 'sm' | 'md' } = $props();

	const sizeClass = $derived(size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs');
</script>

<span
	data-testid="avatar"
	title={username}
	class="inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground {sizeClass}"
>
	{initials(username)}
</span>
