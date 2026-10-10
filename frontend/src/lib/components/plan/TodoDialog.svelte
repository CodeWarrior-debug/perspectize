<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from '$lib/components/shadcn';
	import RatingInput from '$lib/components/RatingInput.svelte';
	import CommentsEditor from '$lib/components/CommentsEditor.svelte';
	import ActionPicker from '$lib/components/plan/ActionPicker.svelte';
	import ItemPicker from '$lib/components/plan/ItemPicker.svelte';
	import { isInsideToast, toastWithAction } from '$lib/utils/toast';
	import {
		buildCreateInput,
		buildUpdateInput,
		clampPercent,
		COMPLETION_PROMPT_MESSAGES,
		completionFollowUp,
		percentPrompt,
		statusPrompt,
		todayIso,
		type CompletionPrompt,
		type TodoFormValues,
	} from '$lib/utils/plan-todo-helpers';
	import type { TodoPrivacy, UserTodoItem, UserTodoListItem, UserTodoStatus } from '$lib/queries/userTodos';
	import { useCreateUserTodo } from '$lib/queries/userTodos/useCreateUserTodo';
	import { useUpdateUserTodo } from '$lib/queries/userTodos/useUpdateUserTodo';

	/**
	 * TodoDialog: create a todo (`todo` null) or edit one. Mounted only while open,
	 * so the form starts from the props. Content is read-only when the todo has it.
	 * A new todo with no content handed in picks its item from search (Item, then
	 * Action); Name stays greyed out until "Not in Perspectize" is chosen. The
	 * Save/Cancel footer is pinned so it is visible without scrolling on a phone.
	 */
	let {
		open = $bindable(true),
		todo = null,
		newContent = null,
		lists = [],
		defaultListId = null,
		defaultActionId = null,
		onSaved,
	}: {
		open?: boolean;
		/** The todo being edited, or null to create one. */
		todo?: UserTodoItem | null;
		/** Content to attach to a new todo (create mode only). */
		newContent?: { id: number; name: string } | null;
		lists?: readonly UserTodoListItem[];
		defaultListId?: number | null;
		/** Action preselected in create mode until the user picks another. Read live, so it can arrive after mount. */
		defaultActionId?: number | null;
		onSaved?: () => void;
	} = $props();

	function initialForm(
		existing: UserTodoItem | null,
		content: { id: number; name: string } | null,
		listId: number | null,
	): TodoFormValues {
		if (existing) {
			return {
				contentId: existing.content ? Number(existing.content.id) : null,
				name: existing.name ?? '',
				actionId: Number(existing.action.id),
				priority: existing.priority,
				status: existing.status,
				percentComplete: existing.percentComplete,
				startDate: existing.startDate ?? '',
				endDate: existing.endDate ?? '',
				dueDate: existing.dueDate ?? '',
				comments: existing.comments ?? '',
				privacy: existing.privacy,
				listId: existing.list ? Number(existing.list.id) : null,
			};
		}
		return {
			contentId: content?.id ?? null,
			name: '',
			actionId: null,
			priority: null,
			status: 'NOT_STARTED',
			percentComplete: 0,
			startDate: '',
			endDate: '',
			dueDate: '',
			comments: '',
			privacy: 'PUBLIC',
			listId,
		};
	}

	// Intentionally a one-time read: the parent mounts this dialog only while it is open,
	// so the form starts from the props of that opening and is not reset by later changes.
	// svelte-ignore state_referenced_locally
	let form = $state<TodoFormValues>(initialForm(todo, newContent, defaultListId));
	let error = $state<string | null>(null);
	let saving = $state(false);

	const createTodo = useCreateUserTodo();
	const updateTodo = useUpdateUserTodo();

	const contentName = $derived(todo?.content?.name ?? newContent?.name ?? null);
	const hasContent = $derived(todo ? todo.content !== null : form.contentId !== null);

	// ---- Item (create mode with no content handed in) ------------------------

	/** Only a brand-new todo with nothing attached gets to pick its item. */
	const showItemPicker = $derived(!todo && newContent === null);
	/** The item chosen from search. */
	let picked = $state<{ id: number; name: string } | null>(null);
	/** The user said the item isn't in Perspectize, so Name is theirs to type. */
	let freeText = $state(false);
	/** Name is locked while an item is (or is yet to be) picked from search. */
	const nameLocked = $derived(showItemPicker && !freeText);
	const nameShown = $derived(nameLocked ? (picked?.name ?? '') : form.name);

	function pickItem(item: { id: number; name: string }) {
		picked = item;
		form.contentId = item.id;
		error = null;
	}

	function clearItem() {
		picked = null;
		form.contentId = null;
	}

	function startFreeText() {
		freeText = true;
		clearItem();
		error = null;
	}

	function stopFreeText() {
		freeText = false;
		form.name = '';
	}

	// Comments stay collapsed behind a button unless there is already something to show.
	// svelte-ignore state_referenced_locally
	let commentsOpen = $state(Boolean(todo?.comments));
	// The user's pick wins; until then the default (e.g. `consume` from Add to plan) applies.
	const actionId = $derived(form.actionId ?? defaultActionId);

	const STATUS_OPTIONS: { value: UserTodoStatus; label: string }[] = [
		{ value: 'NOT_STARTED', label: 'Not started' },
		{ value: 'IN_PROGRESS', label: 'In progress' },
		{ value: 'DONE', label: 'Done' },
		{ value: 'DROPPED', label: 'Dropped' },
	];

	const PRIVACY_OPTIONS: { value: TodoPrivacy; label: string }[] = [
		{ value: 'PUBLIC', label: 'Public' },
		{ value: 'PRIVATE', label: 'Private' },
	];

	// ---- Done <-> 100% follow-up prompts -------------------------------------
	// Each prompt is raised by the user's own change, and only the toast's Yes
	// changes the paired field. Dismissing it changes nothing.

	function askFollowUp(prompt: CompletionPrompt) {
		toastWithAction(COMPLETION_PROMPT_MESSAGES[prompt], {
			label: 'Yes',
			onClick: () => applyFollowUp(prompt),
		});
	}

	function applyFollowUp(prompt: CompletionPrompt) {
		const patch = completionFollowUp(prompt, { endDate: form.endDate || null, today: todayIso() });
		if (patch.status !== undefined) form.status = patch.status;
		if (patch.percentComplete !== undefined) form.percentComplete = patch.percentComplete;
		form.endDate = patch.endDate;
		if (todo) {
			updateTodo.mutateAsync({ id: Number(todo.id), ...patch }).catch((err: unknown) => {
				toast.error(err instanceof Error ? err.message : 'Could not update the todo');
			});
		}
	}

	function onStatusChange(next: UserTodoStatus) {
		form.status = next;
		const prompt = statusPrompt(next, form.percentComplete);
		if (prompt) askFollowUp(prompt);
	}

	function onPercentCommit(raw: number) {
		const next = clampPercent(raw);
		form.percentComplete = next;
		const prompt = percentPrompt(next, form.status);
		if (prompt) askFollowUp(prompt);
	}

	// ---- Save ----------------------------------------------------------------

	async function save(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		if (actionId === null) {
			error = 'Choose an action.';
			return;
		}
		if (!hasContent && form.name.trim() === '') {
			error = showItemPicker
				? 'Pick an item, or choose Not in Perspectize and name it.'
				: 'Name the todo, or link it to content.';
			return;
		}
		const values: TodoFormValues = { ...form, actionId };
		saving = true;
		try {
			if (todo) {
				await updateTodo.mutateAsync(buildUpdateInput(Number(todo.id), values, hasContent));
			} else {
				await createTodo.mutateAsync(buildCreateInput(values));
			}
			open = false;
			onSaved?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not save the todo';
		} finally {
			saving = false;
		}
	}
</script>

<Dialog bind:open>
	<!-- Flex column: header and footer stay put, only the form body scrolls (dvh: the phone browser toolbar eats vh). -->
	<DialogContent
		class="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
		overlayClass="bg-black/45"
		onInteractOutside={(e) => {
			// The prompt toasts render outside the modal: clicking one must not dismiss this dialog.
			if (isInsideToast(e.target)) e.preventDefault();
		}}
	>
		<DialogHeader class="px-6 pt-6">
			<DialogTitle>{todo ? 'Edit todo' : 'Add Todo'}</DialogTitle>
		</DialogHeader>

		<form class="flex min-h-0 flex-1 flex-col" onsubmit={save}>
			<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4 pt-2" data-testid="todo-form-body">
				{#if showItemPicker}
					<div class="flex flex-col gap-1">
						<span class="text-sm font-medium">Item</span>
						{#if picked}
							<div class="border-border flex items-center justify-between gap-2 rounded-md border px-3 py-2">
								<p class="min-w-0 truncate text-sm" data-testid="todo-item-picked">{picked.name}</p>
								<Button type="button" variant="outline" size="sm" onclick={clearItem}>Change</Button>
							</div>
						{:else if freeText}
							<div class="border-border flex items-center justify-between gap-2 rounded-md border px-3 py-2">
								<p class="text-muted-foreground text-sm">Not in Perspectize</p>
								<Button type="button" variant="outline" size="sm" onclick={stopFreeText}>Search instead</Button>
							</div>
						{:else}
							<ItemPicker onPick={pickItem} onFreeText={startFreeText} />
						{/if}
					</div>
				{:else if contentName !== null}
					<div class="flex flex-col gap-1">
						<span class="text-sm font-medium">Item</span>
						<p class="text-sm text-muted-foreground" data-testid="todo-content-name">{contentName}</p>
					</div>
				{/if}

				<div class="flex flex-col gap-1">
					<Label for="todo-action">Action</Label>
					<ActionPicker id="todo-action" value={actionId} onChange={(action) => (form.actionId = Number(action.id))} />
				</div>

				{#if showItemPicker || contentName === null}
					<div class="flex flex-col gap-1">
						<Label for="todo-name">Name</Label>
						<Input
							id="todo-name"
							type="text"
							disabled={nameLocked}
							value={nameShown}
							oninput={(e) => (form.name = e.currentTarget.value)}
							placeholder={nameLocked ? 'Pick an item, or choose Not in Perspectize' : 'What is this about?'}
						/>
					</div>
				{/if}

				<RatingInput
					label="Priority"
					name="priority"
					compact
					bind:value={form.priority}
					onRemove={() => (form.priority = null)}
				/>

				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<Label for="todo-status">Status</Label>
						<select
							id="todo-status"
							class="border-input bg-background h-9 rounded-md border px-3 text-sm"
							value={form.status}
							onchange={(e) => onStatusChange(e.currentTarget.value as UserTodoStatus)}
						>
							{#each STATUS_OPTIONS as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					</div>
					<div class="flex flex-col gap-1">
						<Label for="todo-percent">% complete</Label>
						<Input
							id="todo-percent"
							type="number"
							min={0}
							max={100}
							step={1}
							value={form.percentComplete}
							oninput={(e) => (form.percentComplete = Number(e.currentTarget.value))}
							onchange={(e) => onPercentCommit(Number(e.currentTarget.value))}
						/>
					</div>
				</div>

				<div class="grid grid-cols-3 gap-3">
					<div class="flex flex-col gap-1">
						<Label for="todo-start">Start</Label>
						<Input id="todo-start" type="date" bind:value={form.startDate} />
					</div>
					<div class="flex flex-col gap-1">
						<Label for="todo-end">End</Label>
						<Input id="todo-end" type="date" bind:value={form.endDate} />
					</div>
					<div class="flex flex-col gap-1">
						<Label for="todo-due">Due</Label>
						<Input id="todo-due" type="date" bind:value={form.dueDate} />
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-1">
						<Label for="todo-privacy">Privacy</Label>
						<select
							id="todo-privacy"
							class="border-input bg-background h-9 rounded-md border px-3 text-sm"
							bind:value={form.privacy}
						>
							{#each PRIVACY_OPTIONS as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					</div>
					<div class="flex flex-col gap-1">
						<Label for="todo-list">List</Label>
						<select
							id="todo-list"
							class="border-input bg-background h-9 rounded-md border px-3 text-sm"
							value={form.listId === null ? '' : String(form.listId)}
							onchange={(e) => {
								const v = e.currentTarget.value;
								form.listId = v === '' ? null : Number(v);
							}}
						>
							<option value="">No list</option>
							{#each lists as list (list.id)}
								<option value={list.id}>{list.name}</option>
							{/each}
						</select>
					</div>
				</div>

				{#if commentsOpen}
					<div class="flex flex-col gap-1">
						<Label>Comments</Label>
						<CommentsEditor
							toolbar="basic"
							value={form.comments}
							onChange={(html) => (form.comments = html)}
							minHeight={96}
							placeholder="Notes on this todo"
						/>
					</div>
				{:else}
					<Button type="button" variant="ghost" size="sm" class="self-start" onclick={() => (commentsOpen = true)}>
						Add comments
					</Button>
				{/if}
			</div>

			<div class="border-border flex flex-col gap-2 border-t px-6 py-3" data-testid="todo-form-footer">
				{#if error}
					<p role="alert" class="text-destructive text-sm">{error}</p>
				{/if}
				<div class="flex justify-end gap-2">
					<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
					<Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
				</div>
			</div>
		</form>
	</DialogContent>
</Dialog>
