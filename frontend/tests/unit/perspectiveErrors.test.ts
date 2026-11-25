/**
 * Both paths of perspectiveErrors.ts for every operation.
 *
 * Typed path: `extensions.code` on the GraphQL error (the backend's typed errors, not
 * yet deployed). Legacy path: no code, so today's message matching decides, and the
 * toasts must not change.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'svelte-sonner';
import { ClientError } from 'graphql-request';
import {
	classifyPerspectiveError,
	graphqlErrorCode,
	reportPerspectiveError,
} from '#lib/queries/perspectives/perspectiveErrors.js';

vi.mock('svelte-sonner', () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

/** A ClientError as graphql-request throws it: the message is the first GraphQL error's. */
function gqlError(message: string, code?: string): Error {
	const extensions = code ? { code } : undefined;
	return new ClientError(
		{ errors: [{ message, extensions }], status: 200 } as never,
		{ query: '', variables: {} } as never,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('graphqlErrorCode', () => {
	it('reads extensions.code from the first GraphQL error', () => {
		expect(graphqlErrorCode(gqlError('x', 'NOT_FOUND'))).toBe('NOT_FOUND');
	});

	it('is null for a plain Error, a missing code, or an empty code', () => {
		expect(graphqlErrorCode(new Error('x'))).toBeNull();
		expect(graphqlErrorCode(gqlError('x'))).toBeNull();
		expect(graphqlErrorCode(gqlError('x', ''))).toBeNull();
	});
});

describe('legacy path (no extensions.code): today’s message matching', () => {
	it('create maps the three known messages, then a persistent-retry generic', () => {
		expect(classifyPerspectiveError(new Error('No user selected'), 'create').message).toBe('No user selected');
		expect(classifyPerspectiveError(new Error('user not found'), 'create').message).toBe('No user selected');
		expect(classifyPerspectiveError(new Error('Invalid rating: 11'), 'create').message).toBe('Invalid rating value');
		expect(classifyPerspectiveError(new Error('at least one field is required'), 'create').message).toBe(
			'Please fill in at least one field',
		);
		const generic = classifyPerspectiveError(new Error('boom'), 'create');
		expect(generic).toMatchObject({ source: 'message', message: 'Failed to add perspective.', retry: true });
	});

	it('update uses its own generic text and keeps Retry, and treats "not found" as generic', () => {
		expect(classifyPerspectiveError(new Error('boom'), 'update')).toMatchObject({
			message: 'Failed to update perspective.',
			retry: true,
			refetchLists: false,
		});
		expect(classifyPerspectiveError(new Error('not found'), 'update')).toMatchObject({
			message: 'Failed to update perspective.',
			refetchLists: false,
		});
	});

	it('delete maps access and gone messages, with no Retry on the generic', () => {
		expect(classifyPerspectiveError(new Error('access denied'), 'delete').message).toBe(
			'You can only delete your own perspectives',
		);
		expect(classifyPerspectiveError(new Error('authentication required'), 'delete').message).toBe(
			'You can only delete your own perspectives',
		);
		expect(classifyPerspectiveError(new Error('not found'), 'delete')).toMatchObject({
			message: 'That perspective no longer exists',
			refetchLists: true,
		});
		expect(classifyPerspectiveError(new Error('boom'), 'delete')).toMatchObject({
			message: 'Failed to delete perspective. Please try again.',
			retry: false,
		});
	});

	it('an unconfirmed delete (plain Error, no code) takes the generic delete toast', () => {
		expect(classifyPerspectiveError(new Error('Delete was not confirmed by the server'), 'delete').message).toBe(
			'Failed to delete perspective. Please try again.',
		);
	});
});

describe('typed path (extensions.code present): the code decides', () => {
	it('INVALID_INPUT shows the server message, with no Retry', () => {
		expect(classifyPerspectiveError(gqlError('quality must be 0-10000', 'INVALID_INPUT'), 'create')).toEqual({
			source: 'code',
			message: 'quality must be 0-10000',
			retry: false,
			refetchLists: false,
		});
	});

	it('NOT_FOUND on create means the user is missing; on update and delete it means the row is gone', () => {
		expect(classifyPerspectiveError(gqlError('x', 'NOT_FOUND'), 'create').message).toBe('No user selected');
		expect(classifyPerspectiveError(gqlError('x', 'NOT_FOUND'), 'update')).toMatchObject({
			message: 'That perspective no longer exists',
			refetchLists: true,
		});
		expect(classifyPerspectiveError(gqlError('x', 'NOT_FOUND'), 'delete')).toMatchObject({
			message: 'That perspective no longer exists',
			refetchLists: true,
		});
	});

	it('NOT_ALLOWED and FORBIDDEN map to the owner message for the operation, with no Retry', () => {
		for (const code of ['NOT_ALLOWED', 'FORBIDDEN']) {
			expect(classifyPerspectiveError(gqlError('x', code), 'delete')).toMatchObject({
				message: 'You can only delete your own perspectives',
				retry: false,
			});
			expect(classifyPerspectiveError(gqlError('x', code), 'update')).toMatchObject({
				message: 'You can only change your own perspectives',
				retry: false,
			});
		}
	});

	it('ALREADY_EXISTS is a create-only message; other operations fall through to the legacy match', () => {
		expect(classifyPerspectiveError(gqlError('x', 'ALREADY_EXISTS'), 'create').message).toBe(
			'You already have a perspective on this item',
		);
		expect(classifyPerspectiveError(gqlError('boom', 'ALREADY_EXISTS'), 'update')).toMatchObject({
			source: 'message',
			message: 'Failed to update perspective.',
		});
	});

	it('UNAVAILABLE keeps Retry for create and update; delete takes the generic message', () => {
		expect(classifyPerspectiveError(gqlError('x', 'UNAVAILABLE'), 'create')).toMatchObject({
			message: 'Failed to add perspective.',
			retry: true,
		});
		expect(classifyPerspectiveError(gqlError('x', 'UNAVAILABLE'), 'delete')).toMatchObject({
			source: 'message',
			message: 'Failed to delete perspective. Please try again.',
		});
	});

	it('an unknown code falls back to the legacy match', () => {
		expect(classifyPerspectiveError(gqlError('access denied', 'SOMETHING_NEW'), 'delete')).toMatchObject({
			source: 'message',
			message: 'You can only delete your own perspectives',
		});
	});
});

describe('reportPerspectiveError', () => {
	it('a Retry toast is persistent and runs the retry handler', () => {
		const retry = vi.fn();
		reportPerspectiveError(new Error('boom'), 'create', { retry });
		const [message, options] = vi.mocked(toast.error).mock.calls[0] as unknown as [
			string,
			{ duration: number; action: { label: string; onClick: () => void } },
		];
		expect(message).toBe('Failed to add perspective.');
		expect(options.duration).toBe(Infinity);
		options.action.onClick();
		expect(retry).toHaveBeenCalledOnce();
	});

	it('a no-retry error shows a plain toast and refetches when the row is gone', () => {
		const refetch = vi.fn();
		reportPerspectiveError(new Error('not found'), 'delete', { refetch });
		expect(toast.error).toHaveBeenCalledWith('That perspective no longer exists');
		expect(refetch).toHaveBeenCalledOnce();
	});
});
