<script lang="ts">
	import { UserButton } from 'svelte-clerk';
	import { DEMO_MODE, demoSession } from '$lib/auth';

	/** Signed-in account control: Clerk's UserButton, or the demo persona chip. */
	const initial = $derived(demoSession.current?.name.charAt(0).toUpperCase() ?? '?');
</script>

{#if DEMO_MODE}
	<button
		type="button"
		data-testid="demo-user-menu"
		aria-label="Demo account: {demoSession.current?.name ?? 'none'} (switch persona)"
		title="Switch demo persona"
		class="inline-flex size-8 items-center justify-center rounded-full bg-primary-foreground text-sm font-semibold text-primary"
		onclick={() => (demoSession.pickerOpen = true)}
	>
		{initial}
	</button>
{:else}
	<UserButton
		appearance={{
			elements: {
				avatarBox: 'w-8 h-8',
			},
		}}
	/>
{/if}
