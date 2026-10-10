<script lang="ts">
	import { useTodoActions } from '$lib/queries/userTodos/useTodoActions';
	import { useCreateTodoAction } from '$lib/queries/userTodos/useCreateTodoAction';
	import type { TodoActionItem } from '$lib/queries/userTodos';
	import { actionAddText, actionMatchesQuery, sortTodoActions } from '$lib/utils/plan-todo-helpers';

	/**
	 * ActionPicker: a combobox over the action list, presets first in typical
	 * sequence. Each option's description is its hover tooltip. Typed text that
	 * matches no action offers `Add "<text>"`, which creates the action and selects it.
	 */
	let {
		value = null,
		onChange,
		disabled = false,
		id = 'todo-action',
	}: {
		/** Selected action id, or null. */
		value: number | null;
		onChange: (action: TodoActionItem) => void;
		disabled?: boolean;
		id?: string;
	} = $props();

	const actionsQuery = useTodoActions();
	const createAction = useCreateTodoAction();

	const actions = $derived(sortTodoActions(actionsQuery.data?.todoActions ?? []));
	const selected = $derived(actions.find((a) => Number(a.id) === value) ?? null);

	let text = $state('');
	let editing = $state(false);
	let open = $state(false);
	let error = $state<string | null>(null);

	const shownText = $derived(editing ? text : (selected?.label ?? ''));
	const matches = $derived(actions.filter((a) => actionMatchesQuery(a, text)));
	// Offer Add only when nothing in the list matches what was typed (a partial match is not a new action).
	const addText = $derived(matches.length === 0 ? actionAddText(text, actions) : null);
	const listId = $derived(`${id}-listbox`);

	function startEditing() {
		if (disabled) return;
		editing = true;
		text = '';
		open = true;
	}

	function close() {
		open = false;
		editing = false;
		text = '';
	}

	function choose(action: TodoActionItem) {
		error = null;
		onChange(action);
		close();
	}

	async function addAndChoose(label: string) {
		error = null;
		try {
			const created = await createAction.mutateAsync({ label });
			choose(created);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not add that action';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			close();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (matches.length > 0) choose(matches[0]);
			else if (addText) void addAndChoose(addText);
		}
	}
</script>

<div class="relative">
	<input
		{id}
		type="text"
		role="combobox"
		autocomplete="off"
		aria-expanded={open}
		aria-controls={listId}
		aria-autocomplete="list"
		{disabled}
		value={shownText}
		placeholder={selected ? '' : 'Choose an action'}
		oninput={(e) => {
			text = e.currentTarget.value;
			editing = true;
			open = true;
		}}
		onfocus={startEditing}
		onblur={close}
		onkeydown={handleKeydown}
		class="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
	/>

	{#if open && !disabled}
		<!-- Options are buttons: mousedown is prevented so the input keeps focus until the click lands. -->
		<div
			id={listId}
			role="listbox"
			aria-label="Actions"
			class="bg-popover text-popover-foreground border-border absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border p-1 shadow-md"
		>
			{#each matches as action (action.id)}
				<button
					type="button"
					role="option"
					aria-selected={Number(action.id) === value}
					title={action.description}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => choose(action)}
					class="hover:bg-accent hover:text-accent-foreground flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm {Number(
						action.id,
					) === value
						? 'font-semibold'
						: ''}"
				>
					{action.label}
				</button>
			{/each}

			{#if addText}
				<button
					type="button"
					role="option"
					aria-selected="false"
					data-testid="action-add-option"
					disabled={createAction.isPending}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => addAndChoose(addText)}
					class="text-primary hover:bg-accent flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm disabled:opacity-50"
				>
					Add "{addText}"
				</button>
			{/if}

			{#if matches.length === 0 && !addText}
				<p class="text-muted-foreground px-2 py-1.5 text-sm">No actions</p>
			{/if}
		</div>
	{/if}

	{#if error}
		<p role="alert" class="text-destructive mt-1 text-xs">{error}</p>
	{/if}
</div>
