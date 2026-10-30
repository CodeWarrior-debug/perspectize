<script lang="ts">
	import { page } from '$app/state';
	import SignInTrigger from '$lib/components/auth/SignInTrigger.svelte';
	import ImportJobActions from '$lib/components/imports/ImportJobActions.svelte';
	import ImportJobStatus from '$lib/components/imports/ImportJobStatus.svelte';
	import ImportSheet from '$lib/components/imports/ImportSheet.svelte';
	import ImportSourceList from '$lib/components/imports/ImportSourceList.svelte';
	import { Button } from '$lib/components/shadcn';
	import { useAuthState } from '$lib/auth/useAuthState';
	import { useImportJob } from '$lib/queries/imports/useImportJob';
	import { useMe } from '$lib/queries/users/useMe.svelte';

	const auth = useAuthState();
	const me = useMe();
	const id = $derived(page.params.id ?? '');
	const query = useImportJob(
		() => id,
		() => auth.isLoaded && auth.userId !== null,
	);
	const job = $derived(query.data?.importJob ?? null);
</script>

<!-- A wider page than PageWrapper: the sheet is a desktop spreadsheet with a detail panel beside it. -->
<main class="mx-auto max-w-[1800px] px-4 pt-6 pb-24 md:px-6 md:pt-8 lg:px-8">
	{#if !auth.isLoaded}
		<p class="text-muted-foreground py-12 text-center">Loading…</p>
	{:else if auth.userId === null}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<p class="text-muted-foreground max-w-md">Sign in to see this import.</p>
			<SignInTrigger>
				<Button type="button">Sign in</Button>
			</SignInTrigger>
		</div>
	{:else if query.isPending}
		<p class="text-muted-foreground py-12 text-center">Loading the sheet…</p>
	{:else if query.isError}
		<p class="text-destructive py-12 text-center">Couldn't load this import. Refresh to try again.</p>
	{:else if !job}
		<p class="text-muted-foreground py-12 text-center">
			No import with this id, or it has been closed. <a class="underline" href="/import">See every import</a>.
		</p>
	{:else}
		<header class="mb-4 flex flex-col gap-2">
			<a class="text-muted-foreground text-sm hover:underline" href="/import">← Imports</a>
			<h1 class="text-2xl font-semibold tracking-tight">{job.name}</h1>
			<ImportJobStatus {job} />
			<ImportSourceList sources={job.sources} />
			<ImportJobActions {job} isAdmin={me.isAdmin} />
		</header>
		{#if job.requestStatus === 'APPROVED'}
			{#key job.id}
				<ImportSheet {job} isAdmin={me.isAdmin} />
			{/key}
		{/if}
	{/if}
</main>
