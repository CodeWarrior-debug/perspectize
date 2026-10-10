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

/**
 * A toast with one action button, lasting ACTION_TOAST_DURATION_MS. `opts` is
 * spread last, so a caller can pass e.g. an `id`, or override the duration.
 */
export function toastWithAction(message: string, action: ToastActionButton, opts?: ExternalToast) {
	return toast(message, { duration: ACTION_TOAST_DURATION_MS, action, ...opts });
}
