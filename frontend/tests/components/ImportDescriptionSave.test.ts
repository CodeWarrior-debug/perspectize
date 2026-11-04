import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { QueryClient } from '@tanstack/svelte-query';
import TestWrapper from '../helpers/TestWrapper.svelte';
import ImportDescriptionList from '../helpers/ImportDescriptionList.svelte';
import { makeClient } from '../helpers/queryBudget';
import { graphqlRequest } from '$lib/queries/client';
import { toast } from 'svelte-sonner';

/**
 * The Imports list's description row against a REAL QueryClient: a save evicts
 * the lists, so the new text comes back from the refetch (not from local state).
 */

const mocks = vi.hoisted(() => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('svelte-sonner', () => ({ toast: mocks.toast }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/components/CommentsEditor.svelte', async () => {
	const mod = await import('../helpers/FakeCommentsEditor.svelte');
	return { default: mod.default };
});
vi.mock('$lib/queries/users/useMe.svelte', () => ({
	useMe: () => ({
		get me() {
			return { id: '2', username: 'ben', role: 'USER' };
		},
	}),
}));

let client: QueryClient;
/** The description the "server" holds for import 7. */
let serverDescription: string | null;
let refuseSave: string | null;

function listResponse() {
	return {
		importJobs: [
			{
				id: '7',
				name: 'Peterson',
				requestStatus: 'APPROVED',
				requestedBy: { id: '2', username: 'ben' },
				reviewNote: null,
				reviewedAt: null,
				closedAt: null,
				description: serverDescription,
				createdAt: '2026-10-29T12:00:00Z',
				updatedAt: '2026-10-29T12:00:00Z',
				sources: [],
			},
		],
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	client = makeClient();
	serverDescription = '<p>Old text</p>';
	refuseSave = null;
	vi.mocked(graphqlRequest).mockImplementation(async (query: string, variables?: any) => {
		if (query.includes('mutation UpdateImportJobDescription')) {
			if (refuseSave) throw { response: { errors: [{ message: `invalid input: ${refuseSave}` }] } };
			serverDescription = variables.input.description;
			return {
				updateImportJobDescription: { id: '7', description: serverDescription, updatedAt: '2026-11-04T12:00:00Z' },
			};
		}
		if (query.includes('query ImportJobs')) return listResponse();
		throw new Error(`unexpected request: ${query.slice(0, 60)}`);
	});
});

const listCalls = () =>
	vi.mocked(graphqlRequest).mock.calls.filter(([q]) => String(q).includes('query ImportJobs')).length;

describe('ImportDescription on the Imports list (real cache)', () => {
	it('after a save the list refetches, shows the new text, and toasts once', async () => {
		render(TestWrapper, { props: { queryClient: client, component: ImportDescriptionList } });
		expect(await screen.findByText('Old text')).toBeInTheDocument();
		expect(listCalls()).toBe(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
		await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: '<p>New text</p>' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save description' }));

		expect(await screen.findByText('New text')).toBeInTheDocument();
		expect(screen.queryByText('Old text')).toBeNull();
		expect(toast.success).toHaveBeenCalledTimes(1);
		expect(listCalls(), 'the save evicted the list, so it refetched once').toBe(2);
	});

	it('a refused save shows the server reason and evicts nothing, so the old text stays cached', async () => {
		refuseSave = 'the import is closed';
		render(TestWrapper, { props: { queryClient: client, component: ImportDescriptionList } });
		expect(await screen.findByText('Old text')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
		await fireEvent.input(screen.getByLabelText('Comment'), { target: { value: '<p>New text</p>' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save description' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('The import is closed');
		expect(screen.getByLabelText('Comment'), 'the editor stays open to fix it').toBeInTheDocument();
		expect(toast.success).not.toHaveBeenCalled();
		expect(listCalls(), 'a refused save evicts nothing, so nothing refetches').toBe(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.getByText('Old text'), 'the cached text is still there').toBeInTheDocument();
		expect(listCalls()).toBe(1);
	});
});
