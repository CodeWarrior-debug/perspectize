<script lang="ts">
	import type { LibraryItem } from './libraryItem';
	import { createQuery } from '@tanstack/svelte-query';
	import { Button, Input } from '$lib/components/shadcn';
	import BookCard from './BookCard.svelte';
	import { BOOK_SEARCH_STALE_TIME, lookupBookByIsbn, openLibraryKeys } from '$lib/services/openLibraryApi';
	import { checkIsbn, normalizeIsbn } from '$lib/utils/isbn';

	// Add one book by its ISBN. Nothing is requested until the number is complete and its check digit
	// matches: a typo never reaches Open Library, which can resolve a bad checksum to an unrelated record.
	let {
		library,
		pendingUrl = null,
		onAdd,
	}: {
		/** Canonical work URLs already in the library. */
		library: ReadonlyMap<string, LibraryItem>;
		/** URL of the book being added right now, or null. */
		pendingUrl?: string | null;
		/** Called with the resolved work's canonical url when its Add button is clicked. */
		onAdd: (url: string) => void;
	} = $props();

	let value = $state('');
	const check = $derived(checkIsbn(value));
	const isbn = $derived(normalizeIsbn(value));

	const lookup = createQuery(() => {
		const number = isbn;
		return {
			queryKey: openLibraryKeys.isbn(number),
			queryFn: () => lookupBookByIsbn(number),
			enabled: check === 'valid',
			staleTime: BOOK_SEARCH_STALE_TIME,
		};
	});

	type IsbnState = 'idle' | 'invalid' | 'incomplete' | 'resolving' | 'found' | 'notFound' | 'error';

	const isbnState = $derived<IsbnState>(
		check === 'empty'
			? 'idle'
			: check === 'invalid'
				? 'invalid'
				: check === 'incomplete'
					? 'incomplete'
					: lookup.isError
						? 'error'
						: lookup.isPending
							? 'resolving'
							: lookup.data
								? 'found'
								: 'notFound',
	);

	interface ErrorInfo {
		message: string;
	}

	// Network failures get a connection message; anything else gets the generic one. Both can be retried.
	function classifyError(error: unknown): ErrorInfo {
		if (error instanceof TypeError) {
			return { message: 'Unable to reach Perspectize. Check your connection.' };
		}
		return { message: 'Book lookup is unavailable right now.' };
	}
</script>

<section class="flex flex-col gap-6" aria-label="Add a book by ISBN">
	<div class="flex flex-col gap-1.5">
		<label for="isbn-input" class="text-sm font-medium text-foreground">ISBN-10 or ISBN-13</label>
		<Input
			id="isbn-input"
			type="text"
			placeholder="e.g. 978-0-434-74002-4"
			aria-label="ISBN"
			autocomplete="off"
			bind:value
			class="max-w-md"
		/>
	</div>

	{#if isbnState === 'incomplete'}
		<p class="text-sm text-muted-foreground text-center py-8">An ISBN has 10 or 13 digits.</p>
	{:else if isbnState === 'invalid'}
		<p class="text-sm text-destructive text-center py-8">That ISBN's check digit doesn't match. Check for a typo.</p>
	{:else if isbnState === 'resolving'}
		<div class="flex flex-col gap-4" aria-busy="true" aria-label="Looking up ISBN">
			<div class="flex flex-col sm:flex-row gap-4 p-3 border border-border rounded-lg bg-card animate-pulse">
				<div class="w-32 sm:w-28 aspect-[2/3] bg-muted rounded shrink-0"></div>
				<div class="flex-1 space-y-2 py-1">
					<div class="h-4 bg-muted rounded w-3/4"></div>
					<div class="h-3 bg-muted rounded w-1/3"></div>
					<div class="h-3 bg-muted rounded w-full"></div>
				</div>
			</div>
		</div>
	{:else if isbnState === 'error'}
		{@const errorInfo = classifyError(lookup.error)}
		<div class="flex flex-col items-center gap-3 py-8 text-center">
			<p class="text-sm text-destructive">{errorInfo.message}</p>
			<Button variant="outline" size="sm" onclick={() => lookup.refetch()}>Retry</Button>
		</div>
	{:else if isbnState === 'notFound'}
		<p class="text-sm text-muted-foreground text-center py-8">No book found for that ISBN</p>
	{:else if isbnState === 'found' && lookup.data}
		<BookCard
			result={lookup.data}
			libraryItem={library.get(lookup.data.url) ?? null}
			isPending={pendingUrl === lookup.data.url}
			{onAdd}
		/>
	{/if}
</section>
