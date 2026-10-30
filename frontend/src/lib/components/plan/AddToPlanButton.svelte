<script lang="ts">
	import ListPlusIcon from '@lucide/svelte/icons/list-plus';
	import { useAuthState } from '$lib/auth/useAuthState';

	/**
	 * "Add to plan" entry point on Activity rows and the details modal. Renders
	 * nothing unless someone is signed in: a todo needs an owner.
	 */
	let {
		variant = 'icon',
		onclick,
	}: {
		/** `icon` for a card or row action; `text` for a modal footer. */
		variant?: 'icon' | 'text';
		onclick: () => void;
	} = $props();

	const auth = useAuthState();
</script>

{#if auth.userId !== null}
	{#if variant === 'icon'}
		<button
			type="button"
			data-testid="add-to-plan"
			title="Add to plan"
			aria-label="Add to plan"
			class="flex size-9 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary"
			{onclick}
		>
			<ListPlusIcon class="size-4" />
		</button>
	{:else}
		<button
			type="button"
			data-testid="add-to-plan"
			class="inline-flex items-center gap-1.5 rounded-md border border-primary px-3.5 py-2 text-[13px] font-semibold text-primary hover:bg-primary/5"
			{onclick}
		>
			<ListPlusIcon class="size-3.5" />
			Add to plan
		</button>
	{/if}
{/if}
