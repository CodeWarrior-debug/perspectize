<script lang="ts">
	import { untrack } from 'svelte';
	import { Input, Label } from '$lib/components/shadcn';
	import FormPopover from '$lib/components/FormPopover.svelte';
	import { useAddMovie } from '$lib/queries/content/useAddMovie';
	import { contentNotAllowedMessage, validateMovieInput } from '$lib/utils/movie';
	import ClapperboardIcon from '@lucide/svelte/icons/clapperboard';

	let {
		triggerVariant = 'default',
	}: {
		triggerVariant?: 'default' | 'outline' | 'ghost';
	} = $props();

	let open = $state(false);
	let input = $state('');

	const movieMutation = useAddMovie();

	// Only `open` may be a dependency here. `movieMutation.reset` reads the reactive mutation
	// object, so without untrack a success re-runs this effect (open is still true), resets the
	// mutation before the close-on-success effect below sees `isSuccess`, and the popover never closes.
	$effect(() => {
		if (open) {
			input = '';
			untrack(() => movieMutation.reset());
		}
	});

	$effect(() => {
		if (movieMutation.isSuccess) open = false;
	});

	const trimmed = $derived(input.trim());
	const isValid = $derived(validateMovieInput(trimmed));
	const notAllowedMessage = $derived(contentNotAllowedMessage(movieMutation.error));
	const showInvalid = $derived(trimmed !== '' && !isValid);

	function handleSubmit() {
		if (!isValid) return;
		movieMutation.mutate(trimmed);
	}
</script>

<FormPopover
	bind:open
	{triggerVariant}
	triggerLabel="Add Movie"
	title="Add Movie"
	description="Paste a TMDB or IMDb movie link, or an IMDb id like tt0133093."
	submitLabel="Add"
	pendingLabel="Adding..."
	isPending={movieMutation.isPending}
	isSubmitDisabled={!isValid}
	onSubmit={handleSubmit}
>
	{#snippet triggerIcon()}
		<ClapperboardIcon class="size-4" />
	{/snippet}
	{#snippet formFields()}
		<div class="space-y-2">
			<Label for="movie-input">TMDB or IMDb link</Label>
			<Input
				id="movie-input"
				type="text"
				placeholder="https://www.themoviedb.org/movie/603 or tt0133093"
				bind:value={input}
				disabled={movieMutation.isPending}
				autocomplete="off"
				aria-invalid={showInvalid}
			/>
			{#if showInvalid}
				<p class="text-sm text-destructive">Please enter a valid TMDB or IMDb movie link or IMDb id</p>
			{/if}
			{#if movieMutation.isError}
				<p class="text-sm text-destructive">
					{notAllowedMessage ?? 'Could not add this movie. Check the link and try again.'}
				</p>
			{/if}
			<p class="text-xs text-muted-foreground">
				This product uses the TMDB API but is not endorsed or certified by TMDB.
			</p>
		</div>
	{/snippet}
</FormPopover>
