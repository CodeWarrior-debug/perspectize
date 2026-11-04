<script lang="ts">
	import PageWrapper from '$lib/components/PageWrapper.svelte';
	import SignInTrigger from '$lib/components/auth/SignInTrigger.svelte';
	import ImportJobActions from '$lib/components/imports/ImportJobActions.svelte';
	import ImportJobStatus from '$lib/components/imports/ImportJobStatus.svelte';
	import ImportRequestForm from '$lib/components/imports/ImportRequestForm.svelte';
	import ImportSourceList from '$lib/components/imports/ImportSourceList.svelte';
	import { Button } from '$lib/components/shadcn';
	import { useAuthState } from '$lib/auth/useAuthState';
	import { useImportJobs } from '$lib/queries/imports/useImportJobs';
	import { useMe } from '$lib/queries/users/useMe.svelte';

	// Preliminary page: not in the main nav.
	type Tab = 'imports' | 'request';
	const auth = useAuthState();
	const me = useMe();
	const signedIn = $derived(auth.isLoaded && auth.userId !== null);
	let tab = $state<Tab>('imports');
	let showClosed = $state(false);
	const jobs = useImportJobs(
		() => signedIn,
		() => showClosed && me.isAdmin,
	);
	const requestedCount = $derived(jobs.data?.importJobs.filter((j) => j.requestStatus === 'REQUESTED').length ?? 0);

	const tabs: { value: Tab; label: string }[] = [
		{ value: 'imports', label: 'Imports' },
		{ value: 'request', label: 'Request an import' },
	];
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
			<p class="text-muted-foreground max-w-md">Sign in to browse, request and import channels and filmographies.</p>
			<SignInTrigger>
				<Button type="button">Sign in</Button>
			</SignInTrigger>
		</div>
	{:else}
		<div class="border-border mb-5 flex gap-1 border-b" role="tablist" aria-label="Import">
			{#each tabs as t (t.value)}
				<button
					type="button"
					role="tab"
					aria-selected={tab === t.value}
					class="-mb-px border-b-2 px-3 py-2 text-sm"
					class:border-primary={tab === t.value}
					class:font-medium={tab === t.value}
					class:border-transparent={tab !== t.value}
					class:text-muted-foreground={tab !== t.value}
					onclick={() => (tab = t.value)}
				>
					{t.label}
					{#if t.value === 'imports' && me.isAdmin && requestedCount > 0}
						<span class="bg-primary text-primary-foreground ml-1 rounded-full px-1.5 text-xs tabular-nums"
							>{requestedCount}</span
						>
					{/if}
				</button>
			{/each}
		</div>

		{#if tab === 'request'}
			<ImportRequestForm isAdmin={me.isAdmin} onCreated={() => (tab = 'imports')} />
		{:else}
			{#if me.isAdmin}
				<label class="text-muted-foreground mb-3 flex items-center gap-2 text-sm">
					<input type="checkbox" bind:checked={showClosed} />
					Show closed imports
				</label>
			{/if}
			{#if jobs.isPending}
				<p class="text-muted-foreground py-12 text-center">Loading imports…</p>
			{:else if jobs.isError}
				<p class="text-destructive py-12 text-center">Couldn't load imports. Refresh to try again.</p>
			{:else if jobs.data && jobs.data.importJobs.length === 0}
				<div class="flex flex-col items-center gap-3 py-12 text-center">
					<p class="text-muted-foreground">No imports yet.</p>
					<Button type="button" onclick={() => (tab = 'request')}>Request an import</Button>
				</div>
			{:else if jobs.data}
				<ul class="flex flex-col gap-3" data-testid="import-job-list">
					{#each jobs.data.importJobs as job (job.id)}
						<li
							class="border-border bg-card flex flex-col gap-2 rounded-lg border p-4"
							class:opacity-70={!!job.closedAt}
						>
							{#if job.requestStatus === 'APPROVED'}
								<a class="text-lg font-semibold hover:underline" href={`/import/${job.id}`}>{job.name}</a>
							{:else}
								<span class="text-lg font-semibold">{job.name}</span>
							{/if}
							<ImportJobStatus {job} />
							{#if job.requestStatus === 'APPROVED'}
								<p class="text-muted-foreground text-sm">
									{job.sources.reduce((n, s) => n + s.itemCount, 0)} rows from {job.sources.length}
									source{job.sources.length === 1 ? '' : 's'}
								</p>
							{/if}
							<ImportSourceList sources={job.sources} />
							<ImportJobActions {job} isAdmin={me.isAdmin} />
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	{/if}
</PageWrapper>
