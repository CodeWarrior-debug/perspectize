<script lang="ts">
	import LazyLoadError from '$lib/components/LazyLoadError.svelte';
	import { useTodoActions } from '$lib/queries/userTodos/useTodoActions';
	import { useUserTodoLists } from '$lib/queries/userTodos/useUserTodoLists';

	/**
	 * The "Add to plan" flow: TodoDialog in create mode, prefilled with the content
	 * and the `consume` action. Mounted only while open (the caller renders it under
	 * `{#if}`), and the editor itself is lazy-loaded because it pulls in Tiptap.
	 */
	let {
		content,
		userId,
		onClose,
	}: {
		content: { id: number; name: string };
		/** The signed-in user who owns the new todo. */
		userId: number;
		onClose: () => void;
	} = $props();

	const CONSUME_KEY = 'consume';

	const actions = useTodoActions();
	const lists = useUserTodoLists(() => userId);

	// Resolved from the cached action list; null until it loads, and the dialog
	// picks it up live (see TodoDialog's defaultActionId).
	const consumeId = $derived.by(() => {
		const found = actions.data?.todoActions.find((a) => a.key === CONSUME_KEY);
		return found ? Number(found.id) : null;
	});
</script>

{#await import('$lib/components/plan/TodoDialog.svelte') then { default: TodoDialog }}
	<TodoDialog
		bind:open={
			() => true,
			(next) => {
				if (!next) onClose();
			}
		}
		newContent={content}
		lists={lists.data?.userTodoLists ?? []}
		defaultActionId={consumeId}
	/>
{:catch}
	<LazyLoadError what="the todo editor" floating />
{/await}
