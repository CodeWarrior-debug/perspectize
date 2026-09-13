import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({
	mockMutate: vi.fn(),
	users: [
		{ id: 'u1', username: 'me' },
		{ id: 'u2', username: 'alice' },
		{ id: 'u3', username: 'bob' },
	],
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn(() => ({ data: { users: mocks.users }, isLoading: false })),
	createMutation: vi.fn(() => ({ mutate: mocks.mockMutate, isPending: false })),
	useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import NewThreadDialog from '$lib/components/messaging/NewThreadDialog.svelte';

describe('NewThreadDialog', () => {
	beforeEach(() => vi.clearAllMocks());

	it('lists everyone except me and filters by username', async () => {
		render(NewThreadDialog, { props: { open: true, onOpenChange: vi.fn(), myUserId: 'u1' } });
		expect(screen.getAllByTestId('user-option')).toHaveLength(2);
		await fireEvent.input(screen.getByTestId('user-filter'), { target: { value: 'ali' } });
		expect(screen.getAllByTestId('user-option')).toHaveLength(1);
		expect(screen.getByTestId('user-option')).toHaveTextContent('alice');
	});

	it('selecting people enables Start and calls mutate with their ids', async () => {
		const onOpenChange = vi.fn();
		render(NewThreadDialog, { props: { open: true, onOpenChange, myUserId: 'u1' } });
		const [alice, bob] = screen.getAllByTestId('user-option');
		await fireEvent.click(alice);
		await fireEvent.click(bob);
		await fireEvent.click(screen.getByTestId('start-thread'));
		expect(mocks.mockMutate).toHaveBeenCalledWith(
			{ participantUserIds: ['u2', 'u3'] },
			{ onSuccess: expect.any(Function) },
		);
	});

	it('navigates to the new thread on success when no onCreated callback is given', async () => {
		const { goto } = await import('$app/navigation');
		render(NewThreadDialog, { props: { open: true, onOpenChange: vi.fn(), myUserId: 'u1' } });
		await fireEvent.click(screen.getAllByTestId('user-option')[0]);
		await fireEvent.click(screen.getByTestId('start-thread'));
		const { onSuccess } = mocks.mockMutate.mock.calls[0][1];
		onSuccess({ createMessageThread: { id: 't9' } });
		expect(goto).toHaveBeenCalledWith('/messages/t9');
	});

	it('calls onCreated instead of navigating when provided', async () => {
		const { goto } = await import('$app/navigation');
		const onCreated = vi.fn();
		render(NewThreadDialog, { props: { open: true, onOpenChange: vi.fn(), myUserId: 'u1', onCreated } });
		await fireEvent.click(screen.getAllByTestId('user-option')[0]);
		await fireEvent.click(screen.getByTestId('start-thread'));
		const { onSuccess } = mocks.mockMutate.mock.calls[0][1];
		onSuccess({ createMessageThread: { id: 't9' } });
		expect(onCreated).toHaveBeenCalledWith('t9');
		expect(goto).not.toHaveBeenCalled();
	});
});
