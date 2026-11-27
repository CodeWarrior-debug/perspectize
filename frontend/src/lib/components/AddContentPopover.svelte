<script lang="ts">
	import FormPopover from '#lib/components/FormPopover.svelte';
	import AddContentFields from '#lib/components/addContent/AddContentFields.svelte';
	import { useAddContent } from '#lib/components/addContent/useAddContent.svelte.js';
	import PlusIcon from '@lucide/svelte/icons/plus';

	let {
		triggerVariant = 'default',
	}: {
		triggerVariant?: 'default' | 'outline' | 'ghost';
	} = $props();

	const add = useAddContent();

	let open = $state(false);

	$effect(() => {
		if (open) add.reset();
	});

	$effect(() => {
		if (add.isSuccess) open = false;
	});
</script>

<FormPopover
	bind:open
	{triggerVariant}
	triggerLabel="Add Content"
	title="Add Content"
	description="Paste a YouTube, TMDB, IMDb or Open Library link, any other web link, or type a Bible reference like John 3:16-18."
	submitLabel={add.submitLabel}
	pendingLabel="Adding..."
	isPending={add.isPending}
	isSubmitDisabled={add.isSubmitDisabled}
	onSubmit={add.submit}
>
	{#snippet triggerIcon()}
		<PlusIcon class="size-4" />
	{/snippet}
	{#snippet formFields()}
		<AddContentFields {add} />
	{/snippet}
</FormPopover>
