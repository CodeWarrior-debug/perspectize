<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Show } from 'svelte-clerk';
	import { DEMO_MODE, demoSession } from '$lib/auth';

	/**
	 * Drop-in for svelte-clerk's `<Show when="signed-in|signed-out">` that also
	 * works in demo mode, where there is no ClerkProvider in the tree.
	 */
	let { when, children }: { when: 'signed-in' | 'signed-out'; children: Snippet } = $props();
</script>

{#if DEMO_MODE}
	{#if demoSession.signedIn === (when === 'signed-in')}
		{@render children()}
	{/if}
{:else}
	<Show {when}>
		{@render children()}
	</Show>
{/if}
