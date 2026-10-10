/**
 * Pure logic for the Plan page (user todos): action ordering and matching, the
 * Done <-> 100% follow-up prompts, row selection for the list switcher, the
 * "Add perspective" gate, and building create/update inputs from dialog state.
 * Kept free of Svelte and AG Grid so it can be unit-tested directly.
 */
import type {
	CreateUserTodoInput,
	TodoActionItem,
	TodoPrivacy,
	UpdateUserTodoInput,
	UserTodoItem,
	UserTodoStatus,
} from '$lib/queries/userTodos';

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Presets first in typical-sequence order, then user-entered actions; ties by label. */
export function sortTodoActions(actions: readonly TodoActionItem[]): TodoActionItem[] {
	return [...actions].sort((a, b) => {
		const aSeq = a.typicalSequence ?? Number.POSITIVE_INFINITY;
		const bSeq = b.typicalSequence ?? Number.POSITIVE_INFINITY;
		if (aSeq !== bSeq) return aSeq - bSeq;
		return a.label.localeCompare(b.label);
	});
}

/** Case-insensitive label match used by the action picker's filter. An empty query matches everything. */
export function actionMatchesQuery(action: TodoActionItem, query: string): boolean {
	const q = query.trim().toLowerCase();
	return q === '' || action.label.toLowerCase().includes(q);
}

/**
 * The text to offer as `Add "<text>"`, or null when the typed text is empty or
 * already names an existing action (so the picker never offers a duplicate).
 */
export function actionAddText(query: string, actions: readonly TodoActionItem[]): string | null {
	const text = query.trim();
	if (text === '') return null;
	const lower = text.toLowerCase();
	return actions.some((a) => a.label.toLowerCase() === lower) ? null : text;
}

// ---------------------------------------------------------------------------
// Done <-> 100% follow-up prompts
// ---------------------------------------------------------------------------

export type CompletionPrompt = 'MARK_100' | 'MARK_DONE';

/** The toast text for each prompt. */
export const COMPLETION_PROMPT_MESSAGES: Record<CompletionPrompt, string> = {
	MARK_100: 'Mark 100% complete too?',
	MARK_DONE: 'Mark as done too?',
};

/** Status set to DONE while percent < 100 asks whether to mark 100% too. */
export function statusPrompt(nextStatus: UserTodoStatus, percentComplete: number): CompletionPrompt | null {
	return nextStatus === 'DONE' && percentComplete < 100 ? 'MARK_100' : null;
}

/** Percent set to 100 while the status is not DONE asks whether to mark it done too. */
export function percentPrompt(nextPercent: number, status: UserTodoStatus): CompletionPrompt | null {
	return nextPercent === 100 && status !== 'DONE' ? 'MARK_DONE' : null;
}

/**
 * The paired field(s) a confirmed prompt sends. The end date is filled with
 * `today` only when it is empty. Nothing is sent unless the user clicked Yes.
 */
export function completionFollowUp(
	prompt: CompletionPrompt,
	current: { endDate: string | null; today: string },
): { status?: UserTodoStatus; percentComplete?: number; endDate: string } {
	const endDate = current.endDate ? current.endDate : current.today;
	return prompt === 'MARK_100' ? { percentComplete: 100, endDate } : { status: 'DONE', endDate };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type ListSelection = { kind: 'all' } | { kind: 'unlisted' } | { kind: 'list'; id: number };

/**
 * The rows to show for the switcher's selection. "Unlisted" is applied to the
 * loaded page (the API has no unlisted filter); a single list is already
 * filtered by the server, so it passes through.
 */
export function rowsForSelection(rows: readonly UserTodoItem[], selection: ListSelection): UserTodoItem[] {
	if (selection.kind === 'unlisted') return rows.filter((r) => r.list === null);
	return [...rows];
}

/** Null when the row can take a perspective; otherwise the reason it can't. */
export function addPerspectiveDisabledReason(todo: Pick<UserTodoItem, 'content'>): string | null {
	return todo.content === null ? 'Link this to content first' : null;
}

/** Local calendar day as YYYY-MM-DD (not UTC, so a late-evening user keeps today). */
export function todayIso(now: Date = new Date()): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Dialog form -> API inputs
// ---------------------------------------------------------------------------

/** Dialog state. Dates are YYYY-MM-DD or '' (empty); the list is an id or null. */
export interface TodoFormValues {
	contentId: number | null;
	name: string;
	actionId: number | null;
	priority: number | null;
	status: UserTodoStatus;
	percentComplete: number;
	startDate: string;
	endDate: string;
	dueDate: string;
	comments: string;
	privacy: TodoPrivacy;
	listId: number | null;
}

export function clampPercent(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(100, Math.max(0, Math.round(value)));
}

/** Editor output with no text is stored as no comments at all. */
export function normalizeComments(html: string): string | null {
	const text = html
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.trim();
	return text === '' && !/<(img|table)\b/i.test(html) ? null : html;
}

function emptyToNull(value: string): string | null {
	return value === '' ? null : value;
}

/** Create input: omits every optional field left blank. */
export function buildCreateInput(form: TodoFormValues): CreateUserTodoInput {
	if (form.actionId === null) throw new Error('An action is required');
	const input: CreateUserTodoInput = {
		actionId: form.actionId,
		status: form.status,
		percentComplete: clampPercent(form.percentComplete),
		privacy: form.privacy,
	};
	if (form.contentId !== null) input.contentId = form.contentId;
	const name = form.name.trim();
	if (form.contentId === null && name !== '') input.name = name;
	if (form.priority !== null) input.priority = form.priority;
	if (form.startDate) input.startDate = form.startDate;
	if (form.endDate) input.endDate = form.endDate;
	if (form.dueDate) input.dueDate = form.dueDate;
	const comments = normalizeComments(form.comments);
	if (comments !== null) input.comments = comments;
	if (form.listId !== null) input.listId = form.listId;
	return input;
}

/**
 * Update input: every editable field is sent, with `null` clearing a field. A
 * todo that has content keeps its content, so no name is sent for it.
 */
export function buildUpdateInput(id: number, form: TodoFormValues, hasContent: boolean): UpdateUserTodoInput {
	const input: UpdateUserTodoInput = {
		id,
		actionId: form.actionId ?? undefined,
		priority: form.priority,
		status: form.status,
		percentComplete: clampPercent(form.percentComplete),
		startDate: emptyToNull(form.startDate),
		endDate: emptyToNull(form.endDate),
		dueDate: emptyToNull(form.dueDate),
		comments: normalizeComments(form.comments),
		privacy: form.privacy,
		listId: form.listId,
	};
	if (!hasContent) {
		const name = form.name.trim();
		input.name = name === '' ? null : name;
	}
	return input;
}
