import { describe, expect, it } from 'vitest';
import {
	classifyPerspectiveWriteError,
	perspectiveWriteFailureMessage,
} from '#lib/queries/perspectives/writeError';

/** A graphql-request ClientError for one GraphQL error with an optional code. */
function gqlError(message: string, code?: string): Error {
	const err = new Error(message) as Error & { response: unknown };
	err.response = {
		errors: [{ message, ...(code ? { extensions: { code } } : {}) }],
	};
	return err;
}

describe('classifyPerspectiveWriteError', () => {
	it('a duplicate is non-retryable, whatever its message says', () => {
		const err = gqlError('you already have a private perspective on this content', 'ALREADY_EXISTS');
		expect(classifyPerspectiveWriteError(err)).toEqual({ kind: 'duplicate' });
	});

	it('classifies a coded invalid rating by its message', () => {
		const err = gqlError('invalid rating: rating must be between 0 and 10000: quality 10001', 'INVALID_INPUT');
		expect(classifyPerspectiveWriteError(err)).toEqual({ kind: 'invalidRating' });
	});

	it('classifies a coded empty perspective by its message', () => {
		const err = gqlError('invalid input: invalid input: at least one field must be provided', 'INVALID_INPUT');
		expect(classifyPerspectiveWriteError(err)).toEqual({ kind: 'emptyPerspective' });
	});

	it('classifies a coded missing user by its message', () => {
		const err = gqlError('user not found: resource not found', 'NOT_FOUND');
		expect(classifyPerspectiveWriteError(err)).toEqual({ kind: 'noUser' });
	});

	it('shows a typed refusal with no matching text as non-retryable, using the server message', () => {
		const err = gqlError('access denied: review status is set by moderators', 'FORBIDDEN');
		expect(classifyPerspectiveWriteError(err)).toEqual({
			kind: 'rejected',
			message: 'access denied: review status is set by moderators',
		});
	});

	it('falls back to message substrings for an error with no code', () => {
		expect(classifyPerspectiveWriteError(new Error('Invalid rating: quality 9'))).toEqual({
			kind: 'invalidRating',
		});
		expect(classifyPerspectiveWriteError(new Error('no user selected'))).toEqual({ kind: 'noUser' });
		expect(classifyPerspectiveWriteError(new Error('at least one field must be provided'))).toEqual({
			kind: 'emptyPerspective',
		});
	});

	it('an uncoded, unrecognised failure stays retryable', () => {
		expect(classifyPerspectiveWriteError(new Error('socket hang up'))).toEqual({ kind: 'retryable' });
	});

	it('a non-string code is ignored and the substring rules apply', () => {
		const err = new Error('invalid rating: quality 9') as Error & { response: unknown };
		err.response = { errors: [{ extensions: { code: 42 } }] };
		expect(classifyPerspectiveWriteError(err)).toEqual({ kind: 'invalidRating' });
	});
});

describe('perspectiveWriteFailureMessage', () => {
	it('gives the duplicate a clear, non-retry message', () => {
		const text = perspectiveWriteFailureMessage({ kind: 'duplicate' });
		expect(text).toBe('You already have a perspective on this content with this privacy setting.');
	});

	it('keeps the existing wording for the recognised failures', () => {
		expect(perspectiveWriteFailureMessage({ kind: 'noUser' })).toBe('No user selected');
		expect(perspectiveWriteFailureMessage({ kind: 'invalidRating' })).toBe('Invalid rating value');
		expect(perspectiveWriteFailureMessage({ kind: 'emptyPerspective' })).toBe('Please fill in at least one field');
	});

	it('shows a rejected failure its own message', () => {
		expect(perspectiveWriteFailureMessage({ kind: 'rejected', message: 'nope' })).toBe('nope');
	});
});
