<script lang="ts">
	import { Button, Input } from '$lib/components/shadcn';
	import type { UserTodoListItem } from '$lib/queries/userTodos';
	import { useCreateUserTodoList } from '$lib/queries/userTodos/useCreateUserTodoList';
	import { useUpdateUserTodoList } from '$lib/queries/userTodos/useUpdateUserTodoList';
	import { useDeleteUserTodoList } from '$lib/queries/userTodos/useDeleteUserTodoList';
	import type { ListSelection } from '$lib/utils/plan-todo-helpers';

	/**
	 * ListSwitcher: pick All, Unlisted or one of the user's lists, and create,
	 * rename or delete lists. Selecting a list is what enables drag-to-reorder
	 * on the table.
	 */
	let {
		lists,
		selection,
		userId,
		onSelect,
	}: {
		lists: readonly UserTodoListItem[];
		selection: ListSelection;
		userId: number;
		onSelect: (selection: ListSelection) => void;
	} = $props();

	const createList = useCreateUserTodoList();
	const updateList = useUpdateUserTodoList();
	const deleteList = useDeleteUserTodoList();

	let draftName = $state('');
	let mode = $state<'idle' | 'create' | 'rename'>('idle');
	let error = $state<string | null>(null);
	let busy = $state(false);

	const selectValue = $derived(selection.kind === 'list' ? `list:${selection.id}` : selection.kind);
	const selectedList = $derived(
		selection.kind === 'list' ? (lists.find((l) => Number(l.id) === selection.id) ?? null) : null,
	);

	function onSelectChange(value: string) {
		error = null;
		mode = 'idle';
		if (value === 'all' || value === 'unlisted') onSelect({ kind: value });
		else onSelect({ kind: 'list', id: Number(value.slice('list:'.length)) });
	}

	function startCreate() {
		error = null;
		draftName = '';
		mode = 'create';
	}

	function startRename() {
		if (!selectedList) return;
		error = null;
		draftName = selectedList.name;
		mode = 'rename';
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const name = draftName.trim();
		if (name === '') {
			error = 'Give the list a name.';
			return;
		}
		busy = true;
		error = null;
		try {
			if (mode === 'create') {
				const created = await createList.mutateAsync({ name });
				onSelect({ kind: 'list', id: Number(created.id) });
			} else if (mode === 'rename' && selectedList) {
				await updateList.mutateAsync({ id: Number(selectedList.id), name });
			}
			mode = 'idle';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save the list';
		} finally {
			busy = false;
		}
	}

	async function removeSelected() {
		if (!selectedList) return;
		if (!window.confirm(`Delete the list "${selectedList.name}"? Its todos stay, unlisted.`)) return;
		error = null;
		busy = true;
		try {
			await deleteList.mutateAsync({ id: selectedList.id, userId });
			onSelect({ kind: 'all' });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not delete the list';
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex flex-col gap-2">
	<div class="flex flex-wrap items-center gap-2">
		<label class="sr-only" for="plan-list-select">Show</label>
		<select
			id="plan-list-select"
			class="border-input bg-background h-9 min-w-40 rounded-md border px-3 text-sm"
			value={selectValue}
			onchange={(e) => onSelectChange(e.currentTarget.value)}
		>
			<option value="all">All todos</option>
			<option value="unlisted">Unlisted</option>
			{#each lists as list (list.id)}
				<option value={`list:${list.id}`}>{list.name}</option>
			{/each}
		</select>

		<Button type="button" variant="outline" size="sm" onclick={startCreate} disabled={busy}>New list</Button>
		{#if selectedList}
			<Button type="button" variant="outline" size="sm" onclick={startRename} disabled={busy}>Rename</Button>
			<Button type="button" variant="outline" size="sm" onclick={removeSelected} disabled={busy}>Delete list</Button>
		{/if}
	</div>

	{#if mode !== 'idle'}
		<form class="flex flex-wrap items-center gap-2" onsubmit={submit}>
			<Input
				type="text"
				aria-label={mode === 'create' ? 'New list name' : 'List name'}
				placeholder="List name"
				maxlength={100}
				bind:value={draftName}
				class="max-w-xs"
			/>
			<Button type="submit" size="sm" disabled={busy}>{mode === 'create' ? 'Create list' : 'Save name'}</Button>
			<Button type="button" variant="ghost" size="sm" onclick={() => (mode = 'idle')}>Cancel</Button>
		</form>
	{/if}

	{#if error}
		<p role="alert" class="text-destructive text-sm">{error}</p>
	{/if}
</div>
