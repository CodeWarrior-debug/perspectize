import { toast, type ExternalToast } from 'svelte-sonner';

/**
 * How long a toast with an action button stays up. The app-wide default
 * (`<Toaster duration={2000}>` in +layout.svelte) is too short to reach the
 * button, so every toast that carries an action uses this instead.
 */
export const ACTION_TOAST_DURATION_MS = 4000;

export interface ToastActionButton {
	label: string;
	onClick: () => void;
}

export interface ToastWithActionOptions extends ExternalToast {
	/** A second, less prominent choice, rendered as sonner's cancel button. */
	secondary?: ToastActionButton;
}

/**
 * A toast with an action button (and optionally a second choice), lasting
 * ACTION_TOAST_DURATION_MS. Remaining `opts` are spread last, so a caller can
 * pass e.g. an `id`, or override the duration.
 */
export function toastWithAction(message: string, action: ToastActionButton, opts?: ToastWithActionOptions) {
	const { secondary, ...rest } = opts ?? {};
	return toast(message, {
		duration: ACTION_TOAST_DURATION_MS,
		action,
		...(secondary ? { cancel: secondary } : {}),
		...rest,
	});
}

/**
 * True when an event target is inside a sonner toast. A toast renders outside any
 * open modal, so a modal's outside-click dismissal must ignore it, or tapping a
 * toast's action button would also close the dialog that raised the toast.
 */
export function isInsideToast(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest('[data-sonner-toast]') !== null;
}
