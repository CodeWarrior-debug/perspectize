<script lang="ts">
	import type { Snippet } from 'svelte';
	import { SignInButton } from 'svelte-clerk';
	import { DEMO_MODE, demoSession } from '$lib/auth';

	/**
	 * Wraps a sign-in button: Clerk's modal normally, the demo persona picker in
	 * demo mode. The child button keeps its own styling in both.
	 */
	let { children }: { children: Snippet } = $props();
</script>

{#if DEMO_MODE}
	<!-- Click bubbles from the child <button>, which carries the semantics. -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<span class="contents" onclick={() => (demoSession.pickerOpen = true)}>
		{@render children()}
	</span>
{:else}
	<SignInButton mode="modal">
		{@render children()}
	</SignInButton>
{/if}
