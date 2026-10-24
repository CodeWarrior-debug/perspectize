import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ClaimDeleteDialog from '$lib/components/declare/ClaimDeleteDialog.svelte';

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('$lib/queries/content/useDeleteClaim', () => ({
	useDeleteClaim: () => ({ mutateAsync, isPending: false }),
}));

// Shape graphql-request throws for a GraphQL error response.
function graphqlError(code: string) {
	return { response: { errors: [{ message: 'refused', extensions: { code } }] } };
}

describe('ClaimDeleteDialog', () => {
	beforeEach(() => {
		mutateAsync.mockReset();
	});

	it('confirm state: Delete removes the claim without keepAnonymous', async () => {
		mutateAsync.mockResolvedValue({ deleteClaim: true });
		const onDone = vi.fn();
		render(ClaimDeleteDialog, { props: { claimId: '42', open: true, onDone } });

		expect(screen.getByText('Delete this claim?')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(onDone).toHaveBeenCalled());
		expect(mutateAsync).toHaveBeenCalledWith({ id: '42', keepAnonymous: false });
		expect(screen.queryByText('Keep as anonymous')).not.toBeInTheDocument();
	});

	it('blocked state: CLAIM_HAS_OTHERS swaps to the keep-as-anonymous choice', async () => {
		mutateAsync.mockRejectedValue(graphqlError('CLAIM_HAS_OTHERS'));
		const onDone = vi.fn();
		render(ClaimDeleteDialog, { props: { claimId: '42', open: true, onDone } });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		expect(await screen.findByText('Other people have engaged with this claim')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Keep as anonymous' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
		expect(onDone).not.toHaveBeenCalled();
	});

	it('keep-as-anonymous: sends keepAnonymous true and closes', async () => {
		mutateAsync.mockRejectedValueOnce(graphqlError('CLAIM_HAS_OTHERS')).mockResolvedValueOnce({ deleteClaim: true });
		const onDone = vi.fn();
		render(ClaimDeleteDialog, { props: { claimId: '42', open: true, onDone } });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Keep as anonymous' }));

		await waitFor(() => expect(onDone).toHaveBeenCalled());
		expect(mutateAsync).toHaveBeenLastCalledWith({ id: '42', keepAnonymous: true });
	});

	it('other errors stay on the confirm step', async () => {
		mutateAsync.mockRejectedValue(new Error('network down'));
		const onDone = vi.fn();
		render(ClaimDeleteDialog, { props: { claimId: '42', open: true, onDone } });

		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
		expect(screen.getByText('Delete this claim?')).toBeInTheDocument();
		expect(screen.queryByText('Keep as anonymous')).not.toBeInTheDocument();
		expect(onDone).not.toHaveBeenCalled();
	});
});
