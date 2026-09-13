<script lang="ts">
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogDescription,
		DialogFooter,
		Button,
		Input,
		Label,
	} from '$lib/components/shadcn';
	import { useAddVideo } from '$lib/queries/content/useAddVideo';
	import { validateYouTubeUrl } from '$lib/utils/youtube';

	// Props
	let {
		open = $bindable(false),
		onSuccess,
	}: {
		open?: boolean;
		/** Fired after a successful add (new or already-existed). */
		onSuccess?: () => void;
	} = $props();

	// Reactive state
	let url = $state('');
	let error = $state('');

	// Reset form when dialog opens
	$effect(() => {
		if (open) {
			url = '';
			error = '';
		}
	});

	// Shared mutation hook
	const mutation = useAddVideo();

	// Form submission handler
	function handleSubmit(e: Event) {
		e.preventDefault();

		if (!validateYouTubeUrl(url)) {
			error = 'Please enter a valid YouTube URL';
			return;
		}

		error = '';
		mutation.mutate(url, {
			onSuccess: () => {
				open = false;
				onSuccess?.();
			},
		});
	}
</script>

<Dialog bind:open>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Add Video</DialogTitle>
			<DialogDescription>Paste a YouTube URL to add it to your library.</DialogDescription>
		</DialogHeader>

		<form onsubmit={handleSubmit}>
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="url">YouTube URL</Label>
					<Input
						id="url"
						type="text"
						placeholder="https://www.youtube.com/watch?v=..."
						bind:value={url}
						disabled={mutation.isPending}
					/>
					{#if error}
						<p class="text-sm text-red-600">{error}</p>
					{/if}
				</div>
			</div>

			<DialogFooter>
				<Button type="button" variant="outline" onclick={() => (open = false)} disabled={mutation.isPending}>
					Cancel
				</Button>
				<Button type="submit" disabled={mutation.isPending || !url.trim()}>
					{mutation.isPending ? 'Adding...' : 'Add Video'}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
