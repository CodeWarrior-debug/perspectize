<script lang="ts">
	import ListPlusIcon from '@lucide/svelte/icons/list-plus';
	import { useAuthState } from '$lib/auth/useAuthState';
	import { MODAL_ACTION_CLASS } from '$lib/components/modal-action';
	import { cn } from '$lib/utils';

	/**
	 * "Add to plan" entry point on Activity rows and the details modal. Renders
	 * nothing unless someone is signed in: a todo needs an owner.
	 */
	let {
		variant = 'icon',
		class: className = '',
		onclick,
	}: {
		/** `icon` for a card or row action; `text` for a modal footer. */
		variant?: 'icon' | 'text';
		/** Extra classes, e.g. layout from the row the button sits in. */
		class?: string;
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
			class={cn(
				'flex size-9 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary',
				className,
			)}
			{onclick}
		>
			<ListPlusIcon class="size-4" />
		</button>
	{:else}
		<button type="button" data-testid="add-to-plan" class={cn(MODAL_ACTION_CLASS, className)} {onclick}>
			<ListPlusIcon />
			Add to plan
		</button>
	{/if}
{/if}
