import { toast } from 'svelte-sonner';
import { sanitizeHtml } from '#lib/utils/sanitize.js';
import { hasReviewContent } from '#lib/utils/reviewContent.js';
import { completedTodoInput, openConsumeOrReviewTodos } from '#lib/utils/plan-todo-helpers.js';
import { toastWithAction } from '#lib/utils/toast.js';
import { useFetchUserTodos } from '#lib/queries/userTodos/useFetchUserTodos.js';
import { useUpdateUserTodo } from '#lib/queries/userTodos/useUpdateUserTodo.js';
import { isOptimisticId, type PerspectiveItem } from './index';
import { useCreatePerspective } from './useCreatePerspective';
import { useUpdatePerspective } from './useUpdatePerspective';
import { useDeletePerspective } from './useDeletePerspective';
import { createReviewDraft } from './reviewDraft.svelte';

/**
 * The viewer's perspective on one content item: save, delete, the draft, and the Plan
 * follow-up. The popover is presentation and calls this module; the cache rules
 * (perspectiveCache.ts), error outcomes (perspectiveErrors.ts) and the draft
 * (reviewDraft.svelte.ts) sit behind it.
 *
 * Scope is per viewer and per content item. The popover edits one perspective; the
 * lookup in viewerPerspectives.ts returns every perspective on the item.
 */

/** A feeling as the popover holds it (the wheel's shape). */
export interface FeelingForm {
	emoji: string;
	label?: string | null;
	intensity: number;
	note?: string | null;
}

/** What the form shows, before it becomes a request. */
export interface PerspectiveFormValues {
	quality: number | null;
	agreement: number | null;
	importance: number | null;
	confidence: number | null;
	like: 'THUMBS_UP' | 'THUMBS_DOWN' | null;
	/** Rich-text HTML from the comment editor. */
	comment: string;
	/** Non-core rating fields, keyed by field name. */
	dynamicValues: Record<string, number | null>;
	feelings: FeelingForm[];
	isPrivate: boolean;
}

export type SaveResult = 'sent' | 'empty' | 'busy';

export interface PerspectiveSaveOptions {
	/** Fires after the server confirms a save (not on delete). */
	onSaved?: () => void;
	/** Fires once the perspective is deleted. */
	onDeleted?: () => void;
}

function customFieldsPayload(dynamicValues: Record<string, number | null>): Record<string, number> | undefined {
	const entries = Object.entries(dynamicValues).filter(([, v]) => v !== null);
	if (entries.length === 0) return undefined;
	// Keys are lowercased here as a final guard: GraphQL always gets the bare key.
	return Object.fromEntries(entries.map(([k, v]) => [k.toLowerCase(), v])) as Record<string, number>;
}

function review(comment: string): string | undefined {
	return hasReviewContent(comment) ? sanitizeHtml(comment) : undefined;
}

export function usePerspectiveSave(scope: () => { userId: number; contentId: number }) {
	const createMutation = useCreatePerspective();
	const updateMutation = useUpdatePerspective();
	const deleteMutation = useDeletePerspective();
	const fetchTodos = useFetchUserTodos();
	const updateTodo = useUpdateUserTodo();
	const draft = createReviewDraft(scope);

	/**
	 * After a save succeeds: offer to mark the viewer's open consume or review todo for
	 * this content done. Looked up on save, so opening the popover costs no request. A
	 * failed lookup just skips the prompt.
	 */
	async function offerMarkTodosDone(userId: number, contentId: number) {
		const items = await fetchTodos({
			first: 50,
			filter: { userId, contentId, status: ['NOT_STARTED', 'IN_PROGRESS'] },
		}).catch(() => null);
		if (items === null) return;
		const open = openConsumeOrReviewTodos(items);
		if (open.length === 0) return;
		const complete = (fullPercent: boolean) => {
			for (const todo of open) {
				updateTodo.mutateAsync(completedTodoInput(todo, fullPercent)).catch((err: unknown) => {
					toast.error(err instanceof Error ? err.message : 'Could not update the Todo');
				});
			}
		};
		toastWithAction(
			'Mark this Todo done?',
			{ label: 'Done + 100%', onClick: () => complete(true) },
			{ secondary: { label: 'Done, keep %', onClick: () => complete(false) } },
		);
	}

	/** True for a row created a moment ago whose server id hasn't arrived yet. */
	function isStillSaving(row: PerspectiveItem | null | undefined): boolean {
		return isOptimisticId(row?.id);
	}

	return {
		draft,

		/** Save the form. Create when `existing` is null, otherwise update it. */
		save(
			form: PerspectiveFormValues,
			existing: PerspectiveItem | null,
			options: PerspectiveSaveOptions = {},
		): SaveResult {
			if (isStillSaving(existing)) {
				toast.info('Still saving your perspective — try again in a moment');
				return 'busy';
			}
			const hasAnyRating =
				form.quality !== null || form.agreement !== null || form.importance !== null || form.confidence !== null;
			const hasLike = form.like !== null;
			const hasComment = hasReviewContent(form.comment);
			const hasDynamic = Object.values(form.dynamicValues).some((v) => v !== null);
			const hasFeelings = form.feelings.length > 0;
			if (!hasAnyRating && !hasLike && !hasComment && !hasDynamic && !hasFeelings) {
				toast.error('Please fill in at least one field');
				return 'empty';
			}

			const { userId, contentId } = scope();
			const feelings = hasFeelings
				? form.feelings.map((f) => ({
						emoji: f.emoji,
						label: f.label ?? undefined,
						intensity: f.intensity,
						note: f.note ?? undefined,
					}))
				: undefined;
			const privacy = form.isPrivate ? 'PRIVATE' : 'PUBLIC';

			// The sheet closes at once and a save made offline just waits; without this the
			// person believes it is safe on the server.
			draft.flush();
			if (typeof navigator !== 'undefined' && !navigator.onLine) {
				toast.info("You're offline. This will save when you reconnect.", { duration: 6000 });
			}
			const afterSave = () => {
				draft.clear();
				options.onSaved?.();
				if (userId > 0) void offerMarkTodosDone(userId, contentId);
			};

			if (existing) {
				updateMutation
					.mutateAsync({
						id: parseInt(existing.id, 10),
						// Edit sends the full form: a field the user emptied is null so the server clears
						// it. Undefined would be dropped by the request and read as "leave unchanged".
						quality: form.quality,
						agreement: form.agreement,
						importance: form.importance,
						confidence: form.confidence,
						like: form.like,
						review: review(form.comment) ?? null,
						customFields: customFieldsPayload(form.dynamicValues) ?? null,
						feelings: feelings ?? null,
						privacy,
					})
					.then(afterSave, () => {
						// Error toast + Retry come from useUpdatePerspective's onError.
					});
			} else {
				createMutation
					.mutateAsync({
						userID: userId,
						contentID: contentId,
						quality: form.quality ?? undefined,
						agreement: form.agreement ?? undefined,
						importance: form.importance ?? undefined,
						confidence: form.confidence ?? undefined,
						like: form.like ?? undefined,
						review: review(form.comment),
						customFields: customFieldsPayload(form.dynamicValues),
						feelings,
						privacy,
					})
					.then(afterSave, () => {
						// Error toast + Retry come from useCreatePerspective's onError.
					});
			}
			return 'sent';
		},

		/** Delete a perspective the viewer owns. The caller checks ownership before calling. */
		remove(existing: PerspectiveItem, options: PerspectiveSaveOptions = {}): SaveResult {
			if (isStillSaving(existing)) {
				toast.info('Still saving your perspective — try again in a moment');
				return 'busy';
			}
			deleteMutation.mutate(
				{ id: existing.id, contentID: existing.contentID },
				{
					onSuccess: () => {
						// The perspective is gone, so an unsaved draft for it is meaningless.
						draft.clear();
						options.onDeleted?.();
					},
				},
			);
			return 'sent';
		},

		/** Whether a save or delete is in flight. Disables the form's buttons. */
		status: {
			get saving() {
				return createMutation.isPending || updateMutation.isPending;
			},
			get deleting() {
				return deleteMutation.isPending;
			},
			get busy() {
				return createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
			},
		},

		isStillSaving,
	};
}
