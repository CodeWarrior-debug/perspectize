<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from '$lib/components/shadcn';
	import RatingInput from '$lib/components/RatingInput.svelte';
	import PerspectiveEditor from '$lib/components/PerspectiveEditor.svelte';
	import ActionPicker from '$lib/components/plan/ActionPicker.svelte';
	import { toastWithAction } from '$lib/utils/toast';
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
	 * so the form starts from the props. Content is read-only when the todo has it;
	 * otherwise a free-text name is entered.
	 */
	let {
		open = $bindable(true),
		todo = null,
		newContent = null,
		lists = [],
		defaultListId = null,
		onSaved,
	}: {
		open?: boolean;
		/** The todo being edited, or null to create one. */
		todo?: UserTodoItem | null;
		/** Content to attach to a new todo (create mode only). */
		newContent?: { id: number; name: string } | null;
		lists?: readonly UserTodoListItem[];
		defaultListId?: number | null;
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
		if (form.actionId === null) {
			error = 'Choose an action.';
			return;
		}
		if (!hasContent && form.name.trim() === '') {
			error = 'Name the todo, or link it to content.';
			return;
		}
		saving = true;
		try {
			if (todo) {
				await updateTodo.mutateAsync(buildUpdateInput(Number(todo.id), form, hasContent));
			} else {
				await createTodo.mutateAsync(buildCreateInput(form));
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
	<DialogContent class="max-h-[90vh] overflow-y-auto p-0 sm:max-w-[560px]" overlayClass="bg-black/45">
		<DialogHeader class="px-6 pt-6">
			<DialogTitle>{todo ? 'Edit todo' : 'New todo'}</DialogTitle>
		</DialogHeader>

		<form class="flex flex-col gap-4 px-6 pb-6 pt-2" onsubmit={save}>
			{#if contentName !== null}
				<div class="flex flex-col gap-1">
					<span class="text-sm font-medium">Content</span>
					<p class="text-sm text-muted-foreground" data-testid="todo-content-name">{contentName}</p>
				</div>
			{:else}
				<div class="flex flex-col gap-1">
					<Label for="todo-name">Name</Label>
					<Input id="todo-name" type="text" bind:value={form.name} placeholder="What is this about?" />
				</div>
			{/if}

			<div class="flex flex-col gap-1">
				<Label for="todo-action">Action</Label>
				<ActionPicker
					id="todo-action"
					value={form.actionId}
					onChange={(action) => (form.actionId = Number(action.id))}
				/>
			</div>

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

			<div class="flex flex-col gap-1">
				<Label>Comments</Label>
				<PerspectiveEditor
					value={form.comments}
					onChange={(html) => (form.comments = html)}
					minHeight={96}
					placeholder="Notes on this todo"
				/>
			</div>

			{#if error}
				<p role="alert" class="text-destructive text-sm">{error}</p>
			{/if}

			<div class="flex justify-end gap-2">
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
			</div>
		</form>
	</DialogContent>
</Dialog>
