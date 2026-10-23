import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '$lib/queries/keys';
import { UPDATE_CLAIM } from '$lib/queries/content/claims';
import { graphqlRequest } from '$lib/queries/client';
import { invalidationOutcome, makeClient, seed } from '../helpers/queryBudget';

let client: QueryClient;
let capturedOptions: any;

const mockToastSuccess = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/svelte-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/svelte-query')>();
	return {
		...actual,
		createMutation: vi.fn((optionsFn: () => any) => {
			capturedOptions = optionsFn();
			return { mutate: vi.fn(), isPending: false };
		}),
		useQueryClient: () => client,
	};
});
vi.mock('svelte-sonner', () => ({ toast: { success: mockToastSuccess, error: mockToastError } }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));

beforeEach(() => {
	client = makeClient();
	capturedOptions = undefined;
	vi.clearAllMocks();
});

async function useHook() {
	const { useUpdateClaim } = await import('$lib/queries/content/useUpdateClaim');
	useUpdateClaim();
}

describe('useUpdateClaim mutationFn', () => {
	it('sends UPDATE_CLAIM with the id and input', async () => {
		await useHook();
		vi.mocked(graphqlRequest).mockResolvedValue({ updateClaim: { id: '42' } });
		const input = { text: 'Water is wet', effectiveDate: '2026-01-05', evaluateBy: null };

		await capturedOptions.mutationFn({ id: '42', input });

		expect(graphqlRequest).toHaveBeenCalledWith(UPDATE_CLAIM, { id: '42', input });
	});
});

describe('useUpdateClaim onSuccess', () => {
	it('shows a success toast', async () => {
		await useHook();
		capturedOptions.onSuccess({ updateClaim: { id: '42' } }, { id: '42', input: {} });
		expect(mockToastSuccess).toHaveBeenCalledWith('Claim updated');
	});

	it('evicts the content lists (incl. the claim list) and the edited row, and nothing else', async () => {
		const affected = [
			queryKeys.content.list({ first: 50 }),
			queryKeys.content.claimList(),
			queryKeys.content.row('42'),
		];
		const unrelated = [
			queryKeys.content.detail('42'),
			queryKeys.content.row('43'),
			queryKeys.perspectives.listByContent(42),
			queryKeys.users.list(),
			queryKeys.bible.passageText(1, 2),
		];
		for (const k of [...affected, ...unrelated]) seed(client, k);

		await useHook();
		capturedOptions.onSuccess({ updateClaim: { id: '42' } }, { id: '42', input: {} });

		const outcome = invalidationOutcome(client, [...affected, ...unrelated]);
		expect(outcome.invalidated).toEqual(affected);
		expect(outcome.untouched).toEqual(unrelated);
	});
});

describe('useUpdateClaim onError', () => {
	it.each([
		['content not found', 'Claim not found'],
		['CONTENT NOT FOUND for this user', 'Claim not found'],
		['invalid input: text too long', 'Invalid claim input. Please check your entry.'],
		['INVALID INPUT format', 'Invalid claim input. Please check your entry.'],
		['network timeout', 'Failed to update claim. Please try again.'],
	])('maps "%s" to the matching error toast', async (message, toastText) => {
		await useHook();
		capturedOptions.onError(new Error(message));
		expect(mockToastError).toHaveBeenCalledWith(toastText);
		expect(mockToastSuccess).not.toHaveBeenCalled();
	});
});
