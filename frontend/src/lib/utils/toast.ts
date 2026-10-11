import { toast, type ExternalToast, type ToasterProps } from 'svelte-sonner';

/**
 * Props for the app's one `<Toaster>` (+layout.svelte renders it in both auth
 * branches, so they share this). `expand` keeps simultaneous toasts separated
 * vertically, each sliding into its own slot; sonner's default collapses them
 * into an overlapping stack that only fans out on hover, which hid one toast
 * behind another (e.g. "Perspective saved" over "Mark this Todo done?").
 */
export const TOASTER_PROPS = {
	position: 'top-right',
	duration: 2000,
	richColors: true,
	expand: true,
} as const satisfies ToasterProps;

/**
 * How long a toast with an action button stays up. The app-wide default
 * (`TOASTER_PROPS.duration`) is too short to reach the button, so every toast
 * that carries an action uses this instead.
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
