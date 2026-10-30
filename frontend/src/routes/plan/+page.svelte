<script lang="ts">
	import PageWrapper from '$lib/components/PageWrapper.svelte';
	import PlanBoard from '$lib/components/plan/PlanBoard.svelte';
	import SignInTrigger from '$lib/components/auth/SignInTrigger.svelte';
	import { Button } from '$lib/components/shadcn';
	import { useAuthState } from '$lib/auth/useAuthState';
	import { useMe } from '$lib/queries/users/useMe.svelte';

	// Signed-out visitors get a sign-in prompt; the plan itself loads only once the user id is known.
	const auth = useAuthState();
	const meCtx = useMe();
	const userId = $derived(meCtx.me ? parseInt(meCtx.me.id, 10) : null);
</script>

<PageWrapper>
	{#if !auth.isLoaded}
		<p class="text-muted-foreground py-12 text-center">Loading…</p>
	{:else if auth.userId === null}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<h1 class="text-2xl font-semibold tracking-tight">Plan</h1>
			<p class="text-muted-foreground max-w-md">
				Sign in to keep a plan of what you want to do with the content you care about.
			</p>
			<SignInTrigger>
				<Button type="button">Sign in</Button>
			</SignInTrigger>
		</div>
	{:else if userId !== null}
		<PlanBoard {userId} />
	{:else}
		<p class="text-muted-foreground py-12 text-center">Loading your plan…</p>
	{/if}
</PageWrapper>
