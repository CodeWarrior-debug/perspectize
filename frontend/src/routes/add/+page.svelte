<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Button } from '#lib/components/shadcn/index.js';
	import AddContentFields from '#lib/components/addContent/AddContentFields.svelte';
	import { useAddContent } from '#lib/components/addContent/useAddContent.svelte.js';
	import AuthShow from '#lib/components/auth/AuthShow.svelte';
	import SignInTrigger from '#lib/components/auth/SignInTrigger.svelte';
	import { libraryContentHref } from '#lib/utils/contentLinks.js';
	import { pickAddInput } from '#lib/utils/sharedInput.js';

	// This page is its own feedback: the hooks' toasts and navigation stay off.
	const add = useAddContent({ quiet: true });

	// Launchers (the extension, the iOS Shortcut) pass the page they came from in the query string.
	const params = page.url.searchParams;
	const sharedTitle = params.get('title')?.trim() ?? '';
	add.input = pickAddInput({ url: params.get('url'), text: params.get('text') });

	const existingId = $derived(add.webPagePreview?.alreadyExistsContentId ?? null);

	// A popup window has no opener and a one-entry history; there, "Done" closes it.
	function done() {
		if (window.opener != null || window.history.length <= 1) {
			window.close();
		} else {
			goto('/content-library');
		}
	}
</script>

<svelte:head>
	<title>Add to Perspectize</title>
</svelte:head>

<main class="mx-auto w-full max-w-md px-4 py-6">
	{#if add.isSuccess}
		<section class="space-y-4" data-testid="add-success">
			<h1 class="text-lg font-semibold">{add.alreadySaved ? 'Already saved' : 'Added'}</h1>
			<div class="flex gap-2">
				{#if add.savedContentId != null}
					<Button href={libraryContentHref(String(add.savedContentId))}>Add your perspective</Button>
				{/if}
				<Button variant="outline" onclick={done}>Done</Button>
			</div>
		</section>
	{:else}
		<form
			class="space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				add.submit();
			}}
		>
			<h1 class="text-lg font-semibold">Add to Perspectize</h1>
			{#if sharedTitle}
				<p class="text-muted-foreground text-sm" data-testid="shared-title">{sharedTitle}</p>
			{/if}

			<AddContentFields {add} />

			{#if existingId != null}
				<p class="text-sm">
					Already saved.
					<a class="underline" href={libraryContentHref(String(existingId))}>Open it</a>
				</p>
			{/if}

			<div class="flex justify-end gap-2">
				<AuthShow when="signed-in">
					<Button type="submit" disabled={add.isPending || add.isSubmitDisabled}>
						{add.isPending ? 'Adding...' : add.submitLabel}
					</Button>
				</AuthShow>
				<AuthShow when="signed-out">
					<SignInTrigger>
						<Button type="button">Sign in to add</Button>
					</SignInTrigger>
				</AuthShow>
			</div>
		</form>
	{/if}
</main>
