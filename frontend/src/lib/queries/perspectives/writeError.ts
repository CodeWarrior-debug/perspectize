/**
 * Classifies a failed perspective create or update into what the user is shown.
 *
 * The server's typed code (`extensions.code`, read from the graphql-request
 * ClientError shape `error.response.errors[0]`, as claimHasOthersError does) decides
 * first. Message substrings are the fallback for an error that carries no code.
 * Only an uncoded, unrecognised error is retryable: a typed refusal would fail the
 * same way on retry, so it must not offer a Retry.
 */
export type PerspectiveWriteFailure =
	| { kind: 'duplicate' }
	| { kind: 'noUser' }
	| { kind: 'invalidRating' }
	| { kind: 'emptyPerspective' }
	| { kind: 'rejected'; message: string }
	| { kind: 'retryable' };

function serverCode(error: unknown): string | undefined {
	const first = (error as { response?: { errors?: unknown[] } } | null | undefined)?.response?.errors?.[0] as
		| { extensions?: { code?: unknown } }
		| undefined;
	const code = first?.extensions?.code;
	return typeof code === 'string' ? code : undefined;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? '');
}

/** The message-substring rules the classifier has always used. */
function byMessage(message: string): PerspectiveWriteFailure | undefined {
	const lower = message.toLowerCase();
	if (lower.includes('no user selected') || lower.includes('user not found')) return { kind: 'noUser' };
	if (lower.includes('invalid rating')) return { kind: 'invalidRating' };
	if (lower.includes('at least one field')) return { kind: 'emptyPerspective' };
	return undefined;
}

export function classifyPerspectiveWriteError(error: unknown): PerspectiveWriteFailure {
	const code = serverCode(error);
	const message = errorText(error);

	if (code === 'ALREADY_EXISTS') return { kind: 'duplicate' };
	if (code !== undefined) {
		// A typed refusal: pick a specific message when the text matches, otherwise
		// show the server's own message and do not retry.
		return byMessage(message) ?? { kind: 'rejected', message };
	}
	return byMessage(message) ?? { kind: 'retryable' };
}

/** The toast text for a non-retryable failure. Retryable failures have their own toast. */
export function perspectiveWriteFailureMessage(failure: PerspectiveWriteFailure): string {
	switch (failure.kind) {
		case 'duplicate':
			return 'You already have a perspective on this content with this privacy setting.';
		case 'noUser':
			return 'No user selected';
		case 'invalidRating':
			return 'Invalid rating value';
		case 'emptyPerspective':
			return 'Please fill in at least one field';
		case 'rejected':
			return failure.message;
		case 'retryable':
			return 'Failed to save perspective.';
	}
}
