import { toast } from 'svelte-sonner';

/**
 * Turns a failed perspective mutation into one user-facing outcome.
 *
 * Two paths. When the GraphQL error carries `extensions.code` (typed errors from the
 * backend), that code decides. When it does not (the backend the frontend is talking to
 * today), the message is matched exactly as before, per operation, so the toasts stay the
 * same. Each operation keeps its own fallback table because the old matches differ: `not
 * found` means "gone" for delete but is generic for update.
 */

export type PerspectiveOp = 'create' | 'update' | 'delete';

export type PerspectiveErrorCode =
	'INVALID_INPUT' | 'NOT_FOUND' | 'NOT_ALLOWED' | 'FORBIDDEN' | 'UNAVAILABLE' | 'ALREADY_EXISTS';

export interface PerspectiveFailure {
	/** Where the decision came from: the typed code, or the legacy message match. */
	source: 'code' | 'message';
	message: string;
	/** Offer a Retry action (the work is still in the draft). */
	retry: boolean;
	/** The row is gone or was never ours, so the lists need a refetch. */
	refetchLists: boolean;
}

type GraphQLErrorEntry = { message?: unknown; extensions?: { code?: unknown } };

function firstGraphQLError(err: unknown): GraphQLErrorEntry | undefined {
	return (err as { response?: { errors?: GraphQLErrorEntry[] } } | null)?.response?.errors?.[0];
}

/** `extensions.code` from the first GraphQL error, or null (plain Error, network failure). */
export function graphqlErrorCode(err: unknown): string | null {
	const code = firstGraphQLError(err)?.extensions?.code;
	return typeof code === 'string' && code !== '' ? code : null;
}

/**
 * The server's own sentence for a typed error. graphql-request's Error.message is the whole
 * response JSON, so the sentence comes from the first GraphQL error instead.
 */
function serverMessage(err: Error): string {
	const message = firstGraphQLError(err)?.message;
	return typeof message === 'string' && message !== '' ? message : err.message;
}

const GENERIC: Record<'create' | 'update', string> = {
	create: 'Failed to add perspective.',
	update: 'Failed to update perspective.',
};

function legacyFailure(err: Error, op: PerspectiveOp): PerspectiveFailure {
	const message = err.message.toLowerCase();
	const plain = (text: string): PerspectiveFailure => ({
		source: 'message',
		message: text,
		retry: false,
		refetchLists: false,
	});
	if (op === 'delete') {
		if (message.includes('access denied') || message.includes('authentication required')) {
			return plain('You can only delete your own perspectives');
		}
		if (message.includes('not found')) {
			return { ...plain('That perspective no longer exists'), refetchLists: true };
		}
		return plain('Failed to delete perspective. Please try again.');
	}
	if (message.includes('no user selected') || message.includes('user not found')) return plain('No user selected');
	if (message.includes('invalid rating')) return plain('Invalid rating value');
	if (message.includes('at least one field')) return plain('Please fill in at least one field');
	// Persistent: the form has closed and the work is only safe in a draft, so the Retry must not vanish.
	return { source: 'message', message: GENERIC[op], retry: true, refetchLists: false };
}

function typedFailure(code: PerspectiveErrorCode, err: Error, op: PerspectiveOp): PerspectiveFailure | null {
	const typed = (message: string, extra: Partial<PerspectiveFailure> = {}): PerspectiveFailure => ({
		source: 'code',
		message,
		retry: false,
		refetchLists: false,
		...extra,
	});
	switch (code) {
		case 'INVALID_INPUT':
			return typed(serverMessage(err));
		case 'NOT_FOUND':
			if (op === 'create') return typed('No user selected');
			return typed('That perspective no longer exists', { refetchLists: true });
		case 'NOT_ALLOWED':
		case 'FORBIDDEN':
			return typed(
				op === 'delete' ? 'You can only delete your own perspectives' : 'You can only change your own perspectives',
			);
		case 'ALREADY_EXISTS':
			return op === 'create' ? typed('You already have a perspective on this item') : null;
		case 'UNAVAILABLE':
			return op === 'delete' ? null : { ...typed(GENERIC[op]), retry: true };
	}
	return null;
}

/** The outcome for one failed mutation. Typed code first, then the legacy message match. */
export function classifyPerspectiveError(err: unknown, op: PerspectiveOp): PerspectiveFailure {
	const error = err instanceof Error ? err : new Error(String(err));
	const code = graphqlErrorCode(err);
	if (code !== null) {
		const typed = typedFailure(code as PerspectiveErrorCode, error, op);
		if (typed) return typed;
	}
	return legacyFailure(error, op);
}

/**
 * Show the outcome as a toast. Retry and refetch come from the caller, which owns the
 * mutation and the cache. A Retry toast is persistent so it can't vanish after the default.
 */
export function reportPerspectiveError(
	err: unknown,
	op: PerspectiveOp,
	handlers: { retry?: () => void; refetch?: () => void } = {},
): PerspectiveFailure {
	const failure = classifyPerspectiveError(err, op);
	if (failure.refetchLists) handlers.refetch?.();
	if (failure.retry && handlers.retry) {
		toast.error(failure.message, {
			duration: Infinity,
			closeButton: true,
			action: { label: 'Retry', onClick: handlers.retry },
		});
	} else {
		toast.error(failure.message);
	}
	return failure;
}
