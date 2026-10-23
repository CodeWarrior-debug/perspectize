<script lang="ts">
	import PageWrapper from '$lib/components/PageWrapper.svelte';
	import SignInTrigger from '$lib/components/auth/SignInTrigger.svelte';
	import ClaimDeleteDialog from '$lib/components/declare/ClaimDeleteDialog.svelte';
	import ClaimForm from '$lib/components/declare/ClaimForm.svelte';
	import { Button } from '$lib/components/shadcn';
	import { useAuthState } from '$lib/auth/useAuthState';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import { useMyClaims } from '$lib/queries/content/useMyClaims';

	// Signed-out visitors get a sign-in prompt; claims load only once the user is signed in.
	const auth = useAuthState();
	const meCtx = useMe();
	const claims = useMyClaims(() => auth.userId !== null);

	// Claims are private, so the server only returns the viewer's own. Filter to `me` anyway.
	const myClaims = $derived.by(() => {
		const me = meCtx.me;
		if (!me || !claims.data) return [];
		return claims.data.filter((row) => row.addedByUserID === me.id);
	});

	let editingId = $state<string | null>(null);
	// One delete dialog for the page, aimed at whichever row was clicked.
	let deletingId = $state<string | null>(null);
	let deleteOpen = $state(false);
</script>

<PageWrapper>
	{#if !auth.isLoaded}
		<p class="text-muted-foreground py-12 text-center">Loading…</p>
	{:else if auth.userId === null}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<h1 class="text-2xl font-semibold tracking-tight">Declare</h1>
			<p class="text-muted-foreground max-w-md">Claims are private. Sign in to see yours.</p>
			<SignInTrigger>
				<Button type="button">Sign in</Button>
			</SignInTrigger>
		</div>
	{:else}
		<div class="mx-auto max-w-2xl space-y-8">
			<h1 class="text-2xl font-semibold tracking-tight">Declare</h1>

			<ClaimForm />

			{#if claims.isError}
				<p class="text-muted-foreground py-6 text-center">Couldn't load your claims.</p>
			{:else if claims.isPending || !meCtx.me}
				<p class="text-muted-foreground py-6 text-center">Loading your claims…</p>
			{:else if myClaims.length === 0}
				<p class="text-muted-foreground py-6 text-center">No claims yet.</p>
			{:else}
				<ul class="divide-border divide-y rounded-md border border-border">
					{#each myClaims as row (row.id)}
						<li class="p-4">
							{#if editingId === row.id}
								<ClaimForm claim={row} onDone={() => (editingId = null)} />
							{:else}
								<div class="flex items-start justify-between gap-4">
									<div class="min-w-0 space-y-1">
										<p class="break-words">{row.name}</p>
										<p class="text-muted-foreground flex flex-wrap gap-x-4 text-sm">
											{#if row.customFields?.effectiveDate}
												<span>Effective {row.customFields.effectiveDate}</span>
											{/if}
											{#if row.customFields?.evaluateBy}
												<span>Evaluate by {row.customFields.evaluateBy}</span>
											{/if}
											<span>Private</span>
										</p>
									</div>
									<div class="flex shrink-0 gap-2">
										<Button type="button" variant="outline" size="sm" onclick={() => (editingId = row.id)}>Edit</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onclick={() => {
												deletingId = row.id;
												deleteOpen = true;
											}}>Delete</Button
										>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if deletingId}
				<ClaimDeleteDialog claimId={deletingId} bind:open={deleteOpen} onDone={() => (deletingId = null)} />
			{/if}
		</div>
	{/if}
</PageWrapper>
