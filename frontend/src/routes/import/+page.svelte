<script lang="ts">
	import PageWrapper from '$lib/components/PageWrapper.svelte';
	import SignInTrigger from '$lib/components/auth/SignInTrigger.svelte';
	import ImportSourceList from '$lib/components/imports/ImportSourceList.svelte';
	import { Button } from '$lib/components/shadcn';
	import { useAuthState } from '$lib/auth/useAuthState';
	import { useImportJobs } from '$lib/queries/imports/useImportJobs';

	// Preliminary page: not in the main nav. Imports are created by admins through the API for now.
	const auth = useAuthState();
	const jobs = useImportJobs(() => auth.isLoaded && auth.userId !== null);
</script>

<PageWrapper>
	<header class="mb-6 flex flex-col gap-1">
		<p class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Preliminary</p>
		<h1 class="text-2xl font-semibold tracking-tight">Import</h1>
		<p class="text-muted-foreground max-w-2xl">
			Whole channels and filmographies, listed so you can pick what is worth bringing into Perspectize. Nothing is added
			until you import it.
		</p>
	</header>

	{#if !auth.isLoaded}
		<p class="text-muted-foreground py-12 text-center">Loading…</p>
	{:else if auth.userId === null}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<p class="text-muted-foreground max-w-md">Sign in to browse and import from channels and filmographies.</p>
			<SignInTrigger>
				<Button type="button">Sign in</Button>
			</SignInTrigger>
		</div>
	{:else if jobs.isPending}
		<p class="text-muted-foreground py-12 text-center">Loading imports…</p>
	{:else if jobs.isError}
		<p class="text-destructive py-12 text-center">Couldn't load imports. Refresh to try again.</p>
	{:else if jobs.data && jobs.data.importJobs.length === 0}
		<p class="text-muted-foreground py-12 text-center">No imports yet. An admin creates them through the API.</p>
	{:else if jobs.data}
		<ul class="flex flex-col gap-3" data-testid="import-job-list">
			{#each jobs.data.importJobs as job (job.id)}
				<li class="border-border bg-card rounded-lg border p-4">
					<a class="text-lg font-semibold hover:underline" href={`/import/${job.id}`}>{job.name}</a>
					<p class="text-muted-foreground mb-2 text-sm">
						{job.sources.reduce((n, s) => n + s.itemCount, 0)} rows from {job.sources.length}
						source{job.sources.length === 1 ? '' : 's'}
					</p>
					<ImportSourceList sources={job.sources} />
				</li>
			{/each}
		</ul>
	{/if}
</PageWrapper>
