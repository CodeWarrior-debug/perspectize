<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/shadcn';
	import LazyLoadError from '$lib/components/LazyLoadError.svelte';
	import PlanTable from '$lib/components/plan/PlanTable.svelte';
	import ListSwitcher from '$lib/components/plan/ListSwitcher.svelte';
	import TodoDialog from '$lib/components/plan/TodoDialog.svelte';
	import { useUserTodos } from '$lib/queries/userTodos/useUserTodos';
	import { useUserTodoLists } from '$lib/queries/userTodos/useUserTodoLists';
	import { useReorderUserTodoList } from '$lib/queries/userTodos/useReorderUserTodoList';
	import { useMyPerspectives } from '$lib/queries/perspectives/useMyPerspectives';
	import type { PerspectiveItem } from '$lib/queries/perspectives';
	import type { UserTodoItem, UserTodoSortBy } from '$lib/queries/userTodos';
	import { rowsForSelection, type ListSelection } from '$lib/utils/plan-todo-helpers';

	/**
	 * PlanBoard: the signed-in user's plan. Owns the query, the list selection and
	 * the dialogs. Mounted only once the user id is known, so the todo query never
	 * runs without an owner filter.
	 */
	let { userId }: { userId: number } = $props();

	/** One page. The Plan page does not page further yet; the footer says so when more exist. */
	const PAGE_SIZE = 100;

	let selection = $state<ListSelection>({ kind: 'all' });
	let userSort = $state<{ sortBy: UserTodoSortBy; sortOrder: 'ASC' | 'DESC' } | null>(null);
	const listMode = $derived(selection.kind === 'list');

	const todosQuery = useUserTodos(() => ({
		first: PAGE_SIZE,
		includeTotalCount: true,
		// One list is ordered by position (the order drag-reorder writes); otherwise the header sort.
		sortBy: selection.kind === 'list' ? 'LIST_POSITION' : (userSort?.sortBy ?? 'CREATED_AT'),
		sortOrder: selection.kind === 'list' ? 'ASC' : (userSort?.sortOrder ?? 'DESC'),
		filter: {
			userId,
			...(selection.kind === 'list' ? { listId: selection.id } : {}),
		},
	}));

	const listsQuery = useUserTodoLists(() => userId);
	const lists = $derived(listsQuery.data?.userTodoLists ?? []);
	const reorder = useReorderUserTodoList();
	const myPerspectives = useMyPerspectives(() => userId);

	const perspectivesByContentId = $derived.by(() => {
		const map = new Map<string, PerspectiveItem>();
		for (const p of myPerspectives.data?.perspectives?.items ?? []) {
			if (p.contentID) map.set(p.contentID, p);
		}
		return map;
	});

	const pageItems = $derived(todosQuery.data?.userTodos.items ?? []);
	const rows = $derived(rowsForSelection(pageItems, selection));
	const totalCount = $derived(todosQuery.data?.userTodos.totalCount ?? null);
	const hasMore = $derived(todosQuery.data?.userTodos.pageInfo.hasNextPage ?? false);

	// ---- Dialogs -------------------------------------------------------------

	let dialogOpen = $state(false);
	let dialogTodo = $state<UserTodoItem | null>(null);

	function openCreate() {
		dialogTodo = null;
		dialogOpen = true;
	}

	function openEdit(todo: UserTodoItem) {
		dialogTodo = todo;
		dialogOpen = true;
	}

	let popoverOpen = $state(false);
	let popoverContent = $state<{ id: number; name: string } | null>(null);

	function openAddPerspective(todo: UserTodoItem) {
		if (!todo.content) return;
		popoverContent = { id: Number(todo.content.id), name: todo.content.name };
		popoverOpen = true;
	}

	// ---- Sorting and reordering ---------------------------------------------

	function handleReorder(ids: number[]) {
		if (selection.kind !== 'list') return;
		const current = rows.map((r) => Number(r.id));
		if (ids.length === current.length && ids.every((id, i) => id === current[i])) return;
		reorder.mutate(
			{ listId: selection.id, todoIds: ids },
			{
				onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not reorder the list'),
			},
		);
	}
</script>

<section class="flex flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Plan</h1>
		<Button type="button" onclick={openCreate}>New todo</Button>
	</div>

	<ListSwitcher {lists} {selection} {userId} onSelect={(next) => (selection = next)} />

	{#if todosQuery.isPending}
		<p class="text-muted-foreground py-12 text-center">Loading your plan…</p>
	{:else if todosQuery.isError}
		<p role="alert" class="text-destructive py-12 text-center">Could not load your plan. Try again shortly.</p>
	{:else}
		<PlanTable
			{rows}
			{listMode}
			onOpen={openEdit}
			onAddPerspective={openAddPerspective}
			onSortChange={(next) => (userSort = next)}
			onReorder={handleReorder}
		/>
		{#if hasMore}
			<p class="text-muted-foreground text-sm">
				Showing the first {PAGE_SIZE} of {totalCount ?? 'many'} todos.
			</p>
		{/if}
	{/if}
</section>

{#if dialogOpen}
	<TodoDialog
		bind:open={dialogOpen}
		todo={dialogTodo}
		{lists}
		defaultListId={selection.kind === 'list' ? selection.id : null}
	/>
{/if}

<!-- Lazy, like ActivityTable: the Tiptap-based editor only loads when a perspective is opened. -->
{#if popoverOpen && popoverContent !== null}
	{#await import('$lib/components/PerspectivePopover.svelte') then { default: PerspectivePopover }}
		<PerspectivePopover
			contentId={popoverContent.id}
			contentName={popoverContent.name}
			existingPerspective={perspectivesByContentId.get(String(popoverContent.id)) ?? null}
			{userId}
			bind:open={popoverOpen}
			onClose={() => {
				popoverOpen = false;
			}}
		/>
	{:catch}
		<LazyLoadError what="the perspective editor" floating />
	{/await}
{/if}
